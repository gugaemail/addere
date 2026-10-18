// Pedido de licenças adicionais (plano 015, passo 5): só o administrador
// indicado pede, com o preço atual, um pendente por empresa; a frase gravada é
// a do painel, com SHA-256, IP real e navegador; a Addere recebe o aviso por
// e-mail. O superadmin aprova (termos EFFECTIVE na hora, origin
// LICENSE_REQUEST) ou recusa com motivo.
import { createHash } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { licenseRequestDeclaration } from '@addere/types'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())
vi.mock('../billing-mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../billing-mailer')>()
  return { ...actual, sendBillingEmail: vi.fn(async () => true) }
})

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'
import { sendBillingEmail } from '../billing-mailer'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const MARIA = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
const JOAO = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'
const REQUEST = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4'
const PAST = new Date('2026-09-01T12:00:00Z')
const NOTIFY = 'avisos@example.com'

let app: FastifyInstance
let tokens: Record<string, string>
const mailer = vi.mocked(sendBillingEmail)

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    // O e-mail do token é de propósito diferente do banco: o pedido congela o do banco
    maria: app.jwt.sign({
      sub: MARIA,
      email: 'token@example.com',
      role: 'ADMIN',
      companyId: COMPANY_A,
    }),
    joao: app.jwt.sign({
      sub: JOAO,
      email: 'joao@example.com',
      role: 'ADMIN',
      companyId: COMPANY_A,
    }),
    sales: app.jwt.sign({
      sub: 'sales-a',
      email: 'v@example.com',
      role: 'SALESPERSON',
      companyId: COMPANY_A,
    }),
    super: app.jwt.sign({ sub: 'super-1', email: 's@example.com', role: 'SUPERADMIN' }),
  }
})

afterAll(async () => {
  await app.close()
})

type UserRow = { id: string; name: string; email: string; role: string; active: boolean }
let users: Record<string, UserRow & { companyId: string | null }>

const termsRow = (over: Record<string, unknown> = {}) => ({
  id: 'terms-1',
  status: 'EFFECTIVE',
  version: 1,
  effectiveFrom: PAST,
  packageId: 'pkg-20',
  licenseType: 'STANDARD',
  includedSeats: 20,
  extraSeats: 2,
  packagePrice: new Prisma.Decimal('2400'),
  extraSeatPrice: new Prisma.Decimal('99'),
  ...over,
})

/** O contrato como as consultas do pedido e da aprovação o leem */
function contract(
  opts: {
    status?: string
    designatedAdminId?: string | null
    terms?: ReturnType<typeof termsRow>[]
  } = {}
) {
  const terms = opts.terms ?? [termsRow()]
  prismaMock.companyContract.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.companyContract.findUnique.mockResolvedValue({
    id: 'contract-1',
    companyId: COMPANY_A,
    status: opts.status ?? 'ACTIVE',
    designatedAdminId: opts.designatedAdminId === undefined ? MARIA : opts.designatedAdminId,
    terms,
  })
  prismaMock.contractTerms.findMany.mockResolvedValue(terms.filter((t) => t.status === 'EFFECTIVE'))
}

beforeEach(() => {
  resetPrismaMock()
  mailer.mockReset()
  mailer.mockResolvedValue(true)
  users = {
    [MARIA]: {
      id: MARIA,
      name: 'Maria Exemplo',
      email: 'maria@example.com',
      role: 'ADMIN',
      active: true,
      companyId: COMPANY_A,
    },
    [JOAO]: {
      id: JOAO,
      name: 'João Exemplo',
      email: 'joao@example.com',
      role: 'ADMIN',
      active: true,
      companyId: COMPANY_A,
    },
  }
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where: { id: string } }) => users[args.where.id] ?? { active: true }
  )
  prismaMock.userPermission.findMany.mockResolvedValue([])
  prismaMock.billingSettings.findUnique.mockResolvedValue({ notifyEmail: NOTIFY })
  prismaMock.licenseRequest.create.mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({
      id: REQUEST,
      ...args.data,
      unitPriceShown: new Prisma.Decimal(args.data.unitPriceShown as string),
      status: 'PENDING',
      createdAt: new Date('2026-11-12T13:00:00Z'),
      decidedAt: null,
      decidedById: null,
      decisionReason: null,
      resultingTermsId: null,
      company: { name: 'Empresa Exemplo' },
      decidedBy: null,
    })
  )
})

const auth = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })

function postRequest(who: keyof typeof tokens, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url: '/billing/me/license-requests',
    headers: auth(who),
    payload,
  })
}

const validBody = { quantity: 2, unitPriceShown: '99.00', message: 'Dois vendedores novos.' }

describe('POST /billing/me/license-requests', () => {
  it('o indicado pede: a frase do painel, o hash, o IP real e o aviso à Addere', async () => {
    contract()
    const res = await app.inject({
      method: 'POST',
      url: '/billing/me/license-requests',
      headers: {
        ...auth('maria'),
        // O mesmo cabeçalho do teste do trustProxy (plano 014)
        'x-forwarded-for': '198.51.100.20, 203.0.113.9',
        'user-agent': 'N'.repeat(600),
      },
      payload: validBody,
    })

    expect(res.statusCode).toBe(201)
    const expected = licenseRequestDeclaration(2, '99')
    const data = prismaMock.licenseRequest.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      companyId: COMPANY_A,
      quantity: 2,
      message: 'Dois vendedores novos.',
      unitPriceShown: '99.00',
      declarationText: expected,
      declarationSha256: createHash('sha256').update(expected, 'utf8').digest('hex'),
      requestedById: MARIA,
      requestedByName: 'Maria Exemplo',
      requestedByEmail: 'maria@example.com',
      requestedIp: '203.0.113.9',
    })
    expect(data.requestedUserAgent).toHaveLength(512)

    // A trava vem antes de tudo
    const lockOrder = prismaMock.companyContract.updateMany.mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(prismaMock.licenseRequest.create.mock.invocationCallOrder[0])

    expect(prismaMock.billingEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'LICENSE_REQUEST_CREATED',
      companyId: COMPANY_A,
      actorId: MARIA,
      payload: { fields: [], licenseRequestId: REQUEST },
    })

    expect(mailer).toHaveBeenCalledTimes(1)
    const mail = mailer.mock.calls[0][0]
    expect(mail.to).toBe(NOTIFY)
    expect(mail.subject).toBe('Pedido de 2 licenças — Empresa Exemplo')
    expect(mail.html).toContain('R$ 198,00')
    expect(mail.html).not.toContain('203.0.113.9')

    // O ADMIN não recebe IP nem hash de volta
    const body = res.json()
    expect(body).toMatchObject({
      status: 'PENDING',
      unitPriceShown: '99.00',
      monthlyIncrease: '198.00',
      declarationText: expected,
    })
    expect(body).not.toHaveProperty('requestedIp')
    expect(body).not.toHaveProperty('declarationSha256')
  })

  it('o e-mail escapa o que vem do cliente', async () => {
    contract()
    await postRequest('maria', { ...validBody, message: '<b>urgente</b>' })
    expect(mailer.mock.calls[0][0].html).toContain('&lt;b&gt;urgente&lt;/b&gt;')
  })

  it('sem notifyEmail: o pedido é criado e o e-mail não sai', async () => {
    contract()
    prismaMock.billingSettings.findUnique.mockResolvedValue({ notifyEmail: null })
    const res = await postRequest('maria', validBody)
    expect(res.statusCode).toBe(201)
    expect(mailer).not.toHaveBeenCalled()
  })

  it('e-mail que falha não desfaz o pedido', async () => {
    contract()
    mailer.mockRejectedValue(new Error('rede'))
    const res = await postRequest('maria', validBody)
    expect(res.statusCode).toBe(201)
  })

  it('sem contrato: 409 CONTRACT_NOT_ACTIVE', async () => {
    const res = await postRequest('maria', validBody)
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('CONTRACT_NOT_ACTIVE')
  })

  it.each(['DRAFT', 'PENDING_ACCEPTANCE', 'CANCELLED'])(
    'contrato em %s: 409 CONTRACT_NOT_ACTIVE',
    async (status) => {
      contract({ status })
      const res = await postRequest('maria', validBody)
      expect(res.statusCode).toBe(409)
      expect(res.json().code).toBe('CONTRACT_NOT_ACTIVE')
      expect(prismaMock.licenseRequest.create).not.toHaveBeenCalled()
    }
  )

  it('preço diferente do atual: 409 LICENSE_PRICE_CHANGED com o preço novo', async () => {
    contract()
    const res = await postRequest('maria', { ...validBody, unitPriceShown: '95.00' })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({
      code: 'LICENSE_PRICE_CHANGED',
      details: { unitPrice: '99.00' },
    })
    expect(prismaMock.licenseRequest.create).not.toHaveBeenCalled()
  })

  it('o mesmo preço escrito de outro jeito vale ("99" = 99,00)', async () => {
    contract()
    const res = await postRequest('maria', { ...validBody, unitPriceShown: '99' })
    expect(res.statusCode).toBe(201)
  })

  it('pedido pendente: 409 LICENSE_REQUEST_PENDING', async () => {
    contract()
    prismaMock.licenseRequest.findFirst.mockResolvedValue({ id: 'outro' })
    const res = await postRequest('maria', validBody)
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('LICENSE_REQUEST_PENDING')
    expect(prismaMock.licenseRequest.create).not.toHaveBeenCalled()
  })

  describe('só o administrador indicado pede', () => {
    function expectNothingWritten() {
      expect(prismaMock.licenseRequest.create).not.toHaveBeenCalled()
      expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
      expect(mailer).not.toHaveBeenCalled()
    }

    it('outro ADMIN ativo: 403 NOT_DESIGNATED_ADMIN, antes do preço e do pendente', async () => {
      contract()
      prismaMock.licenseRequest.findFirst.mockResolvedValue({ id: 'outro' })
      const res = await postRequest('joao', { ...validBody, unitPriceShown: '1.00' })
      expect(res.statusCode).toBe(403)
      expect(res.json().code).toBe('NOT_DESIGNATED_ADMIN')
      expectNothingWritten()
    })

    it('contrato sem indicado: ninguém pede', async () => {
      contract({ designatedAdminId: null })
      const res = await postRequest('maria', validBody)
      expect(res.statusCode).toBe(403)
      expect(res.json().code).toBe('NOT_DESIGNATED_ADMIN')
      expectNothingWritten()
    })

    it('indicado rebaixado a vendedor (o token ainda diz ADMIN): 403', async () => {
      contract()
      users[MARIA].role = 'SALESPERSON'
      const res = await postRequest('maria', validBody)
      expect(res.statusCode).toBe(403)
      expect(res.json().code).toBe('NOT_DESIGNATED_ADMIN')
      expectNothingWritten()
    })
  })

  it.each(['super', 'sales'] as const)('%s: 403 pela guarda do ADMIN', async (who) => {
    contract()
    const res = await postRequest(who, validBody)
    expect(res.statusCode).toBe(403)
    expect(prismaMock.licenseRequest.create).not.toHaveBeenCalled()
  })

  it.each([
    ['quantidade 0', { ...validBody, quantity: 0 }],
    ['quantidade 101', { ...validBody, quantity: 101 }],
    ['mensagem com 501 caracteres', { ...validBody, message: 'x'.repeat(501) }],
    ['preço mal escrito', { ...validBody, unitPriceShown: '99,00' }],
  ])('%s: 400', async (_label, payload) => {
    contract()
    const res = await postRequest('maria', payload)
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /admin/billing/license-requests/:id/decide', () => {
  let row: Record<string, unknown>

  beforeEach(() => {
    const declarationText = licenseRequestDeclaration(3, '99')
    row = {
      id: REQUEST,
      companyId: COMPANY_A,
      quantity: 3,
      message: null,
      unitPriceShown: new Prisma.Decimal('99'),
      declarationText,
      declarationSha256: createHash('sha256').update(declarationText, 'utf8').digest('hex'),
      requestedById: MARIA,
      requestedByName: 'Maria Exemplo',
      requestedByEmail: 'maria@example.com',
      requestedIp: '203.0.113.9',
      requestedUserAgent: 'Navegador de teste',
      status: 'PENDING',
      createdAt: new Date('2026-12-02T17:10:00Z'),
      updatedAt: new Date('2026-12-02T17:10:00Z'),
      decidedAt: null,
      decidedById: null,
      decisionReason: null,
      resultingTermsId: null,
      company: { name: 'Empresa Exemplo' },
      decidedBy: null,
    }
    prismaMock.licenseRequest.findUnique.mockImplementation(async () => row)
    // O updateMany filtra PENDING, como no banco
    prismaMock.licenseRequest.updateMany.mockImplementation(
      async (args: { where: { status: string }; data: Record<string, unknown> }) => {
        if (row.status !== args.where.status) return { count: 0 }
        Object.assign(row, args.data, args.data.decidedById ? { decidedBy: { name: 'Super' } } : {})
        return { count: 1 }
      }
    )
    prismaMock.contractTerms.findFirst.mockResolvedValue({ version: 3 })
    prismaMock.contractTerms.create.mockResolvedValue({ id: 'terms-new', version: 4 })
    prismaMock.company.findUnique.mockResolvedValue({ intelligenceEnabled: false })
  })

  function decide(who: keyof typeof tokens, payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: `/admin/billing/license-requests/${REQUEST}/decide`,
      headers: auth(who),
      payload,
    })
  }

  it('aprovação cria os termos EFFECTIVE agora, com as licenças somadas', async () => {
    contract({ terms: [termsRow({ licenseType: 'INTELLIGENCE' })] })
    const before = Date.now()
    const res = await decide('super', { decision: 'APPROVE' })

    expect(res.statusCode).toBe(200)
    const data = prismaMock.contractTerms.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      contractId: 'contract-1',
      version: 4,
      status: 'EFFECTIVE',
      origin: 'LICENSE_REQUEST',
      proposedEffectiveFrom: null,
      packageId: 'pkg-20',
      licenseType: 'INTELLIGENCE',
      includedSeats: 20,
      extraSeats: 5, // 2 + 3
      reason: `Pedido de licenças ${REQUEST}`,
      createdById: 'super-1',
    })
    expect(data.packagePrice.equals(new Prisma.Decimal('2400'))).toBe(true)
    expect(data.extraSeatPrice.equals(new Prisma.Decimal('99'))).toBe(true)
    expect(data.effectiveFrom.getTime()).toBeGreaterThanOrEqual(before)
    expect(data.effectiveFrom.getTime()).toBeLessThanOrEqual(Date.now())

    expect(row).toMatchObject({
      status: 'APPROVED',
      decidedById: 'super-1',
      resultingTermsId: 'terms-new',
    })
    // A Inteligência segue os termos novos na mesma transação (derivação do 014)
    expect(prismaMock.company.update.mock.calls[0][0].data).toEqual({ intelligenceEnabled: true })
    const approved = prismaMock.billingEvent.create.mock.calls
      .map((c: [{ data: { type: string; payload: unknown } }]) => c[0].data)
      .find((d: { type: string }) => d.type === 'LICENSE_REQUEST_APPROVED')
    expect(approved).toMatchObject({
      companyId: COMPANY_A,
      actorId: 'super-1',
      payload: { fields: ['extraSeats'], licenseRequestId: REQUEST, termsId: 'terms-new' },
    })

    // O superadmin vê a auditoria
    expect(res.json()).toMatchObject({
      status: 'APPROVED',
      decidedByName: 'Super',
      requestedIp: '203.0.113.9',
      declarationSha256: row.declarationSha256,
    })
  })

  it('segunda decisão: 409 LICENSE_REQUEST_ALREADY_DECIDED, sem termos novos', async () => {
    contract()
    row.status = 'APPROVED'
    const res = await decide('super', { decision: 'APPROVE' })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('LICENSE_REQUEST_ALREADY_DECIDED')
    expect(prismaMock.contractTerms.create).not.toHaveBeenCalled()
  })

  it('preço mudou entre o pedido e a aprovação: 409 LICENSE_PRICE_CHANGED', async () => {
    contract({ terms: [termsRow({ extraSeatPrice: new Prisma.Decimal('120') })] })
    const res = await decide('super', { decision: 'APPROVE' })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('LICENSE_PRICE_CHANGED')
    expect(prismaMock.contractTerms.create).not.toHaveBeenCalled()
  })

  it('total mensal com as licenças somadas acima do Decimal(14,2): 422 AMOUNT_TOO_LARGE', async () => {
    contract({ terms: [termsRow({ packagePrice: new Prisma.Decimal('999999999999.99') })] })
    const res = await decide('super', { decision: 'APPROVE' })
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('AMOUNT_TOO_LARGE')
    expect(prismaMock.contractTerms.create).not.toHaveBeenCalled()
    expect(row.status).toBe('PENDING')
  })

  it('aditivo em andamento (termo PROPOSED): 409 AMENDMENT_PENDING', async () => {
    contract({ terms: [termsRow(), termsRow({ id: 'terms-2', version: 2, status: 'PROPOSED' })] })
    const res = await decide('super', { decision: 'APPROVE' })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('AMENDMENT_PENDING')
    expect(prismaMock.contractTerms.create).not.toHaveBeenCalled()
  })

  it('aditivo aceito que ainda não vale: 409 AMENDMENT_NOT_YET_EFFECTIVE', async () => {
    contract({
      terms: [
        termsRow(),
        termsRow({ id: 'terms-2', version: 2, effectiveFrom: new Date(Date.now() + 86_400_000) }),
      ],
    })
    const res = await decide('super', { decision: 'APPROVE' })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('AMENDMENT_NOT_YET_EFFECTIVE')
    expect(prismaMock.contractTerms.create).not.toHaveBeenCalled()
  })

  it('contrato que deixou de estar ativo: 409 CONTRACT_NOT_ACTIVE', async () => {
    contract({ status: 'CANCELLED' })
    const res = await decide('super', { decision: 'APPROVE' })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('CONTRACT_NOT_ACTIVE')
  })

  it('recusa sem motivo: 400', async () => {
    contract()
    const res = await decide('super', { decision: 'REJECT' })
    expect(res.statusCode).toBe(400)
    expect(prismaMock.licenseRequest.updateMany).not.toHaveBeenCalled()
  })

  it('recusa com motivo: REJECTED, motivo gravado, sem termos', async () => {
    contract()
    const res = await decide('super', { decision: 'REJECT', reason: 'aguardar aditivo' })
    expect(res.statusCode).toBe(200)
    expect(row).toMatchObject({
      status: 'REJECTED',
      decisionReason: 'aguardar aditivo',
      decidedById: 'super-1',
    })
    expect(prismaMock.contractTerms.create).not.toHaveBeenCalled()
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'LICENSE_REQUEST_REJECTED',
      payload: { fields: [], licenseRequestId: REQUEST },
    })
  })

  it('pedido que não existe: 404', async () => {
    prismaMock.licenseRequest.findUnique.mockResolvedValue(null)
    const res = await decide('super', { decision: 'APPROVE' })
    expect(res.statusCode).toBe(404)
  })

  it('ADMIN não decide: 403', async () => {
    contract()
    const res = await decide('maria', { decision: 'APPROVE' })
    expect(res.statusCode).toBe(403)
    expect(prismaMock.contractTerms.create).not.toHaveBeenCalled()
  })
})

describe('GET /admin/billing/license-requests', () => {
  it('SUPERADMIN filtra por situação e empresa, do mais novo ao mais antigo', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/billing/license-requests?status=PENDING&companyId=${COMPANY_A}`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    const args = prismaMock.licenseRequest.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ status: 'PENDING', companyId: COMPANY_A })
    expect(args.orderBy).toEqual({ createdAt: 'desc' })
    expect(args.take).toBe(200)
  })

  it('ADMIN: 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/billing/license-requests',
      headers: auth('maria'),
    })
    expect(res.statusCode).toBe(403)
    expect(prismaMock.licenseRequest.findMany).not.toHaveBeenCalled()
  })
})

describe('GET /billing/me — pedidos de licenças', () => {
  it('os 20 mais recentes da empresa, sem IP nem hash', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue({
      companyId: COMPANY_A,
      status: 'ACTIVE',
      startDate: PAST,
      graceMonths: 0,
      firstBilledCompetence: PAST,
      dueDay: 10,
      designatedAdmin: { ...users[MARIA] },
      terms: [{ ...termsRow(), package: { code: 'P20', name: 'Pacote 20' } }],
    })
    prismaMock.licenseRequest.findMany.mockResolvedValue([
      {
        id: REQUEST,
        companyId: COMPANY_A,
        quantity: 2,
        message: null,
        unitPriceShown: new Prisma.Decimal('99'),
        declarationText: licenseRequestDeclaration(2, '99'),
        declarationSha256: 'ab'.repeat(32),
        requestedByName: 'Maria Exemplo',
        requestedIp: '203.0.113.9',
        status: 'PENDING',
        createdAt: new Date('2026-12-02T17:10:00Z'),
        decidedAt: null,
        decisionReason: null,
        resultingTermsId: null,
        company: { name: 'Empresa Exemplo' },
        decidedBy: null,
      },
    ])
    const res = await app.inject({ method: 'GET', url: '/billing/me', headers: auth('joao') })
    expect(res.statusCode).toBe(200)
    const args = prismaMock.licenseRequest.findMany.mock.calls[0][0]
    expect(args.where).toEqual({ companyId: COMPANY_A })
    expect(args.take).toBe(20)
    const [first] = res.json().licenseRequests
    expect(first).toMatchObject({ quantity: 2, monthlyIncrease: '198.00', status: 'PENDING' })
    expect(first).not.toHaveProperty('requestedIp')
    expect(first).not.toHaveProperty('declarationSha256')
  })
})
