// Documentos para aceite (plano 014, passo 7): envio só com o administrador
// indicado e um e-mail só, a ele; troca do indicado e edição do aditivo
// cancelam o documento enviado; a regra dos 30 dias; nenhum evento leva texto,
// e-mail ou IP.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { effectiveInstantOfDay, minimumEffectiveDate } from '@addere/types'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())
vi.mock('../billing-mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../billing-mailer')>()
  return { ...actual, sendBillingEmail: vi.fn(async () => true) }
})

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'
import { sendBillingEmail } from '../billing-mailer'
import { todayYmdSaoPaulo } from '../amendment-rules'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'
const MARIA = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
const JOAO = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'
const DOC = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3'
const TPL_C = 'd4d4d4d4-d4d4-4d4d-8d4d-d4d4d4d4d4d4'
const TPL_A = 'e5e5e5e5-e5e5-4e5e-8e5e-e5e5e5e5e5e5'
const PKG_P10 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

let app: FastifyInstance
let tokens: Record<string, string>
const mailer = vi.mocked(sendBillingEmail)

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    super: app.jwt.sign({ sub: 'super-1', email: 's@a.com', role: 'SUPERADMIN' }),
    maria: app.jwt.sign({
      sub: MARIA,
      email: 'maria@example.com',
      role: 'ADMIN',
      companyId: COMPANY_A,
    }),
  }
})

afterAll(async () => {
  await app.close()
})

// Usuários do banco, relidos pelo assertValidDesignee (o authenticate só lê `active`)
type UserRow = {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  companyId: string | null
}
let users: Record<string, UserRow>

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
  prismaMock.user.findMany.mockResolvedValue([{ id: 'super-1', name: 'Gustavo' }])
})

const auth = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })

const CONTRACT_BODY = [
  '# CONTRATO',
  '',
  '- **Empresa:** {{cliente.razaoSocial}}',
  '- **CPF do representante:** {{cliente.representanteCpf}}',
  '- **Administrador indicado:** {{cliente.administradorNome}}, {{cliente.administradorEmail}}',
  '- **Total mensal:** {{valores.mensal}} ({{valores.mensalExtenso}})',
].join('\n')

const AMENDMENT_BODY = [
  '# TERMO ADITIVO',
  '',
  'Contrato aceito em {{aditivo.contratoAceitoEm}}. Motivo: {{aditivo.motivo}}',
  '',
  '- **Antes:** {{aditivo.mensalAnterior}}',
  '- **Depois:** {{valores.mensal}}',
  '- **Vale a partir de:** {{aditivo.valeAPartirDe}}',
].join('\n')

const template = (kind: 'CONTRACT' | 'AMENDMENT', over: Record<string, unknown> = {}) => ({
  id: kind === 'CONTRACT' ? TPL_C : TPL_A,
  kind,
  version: 1,
  status: 'PUBLISHED',
  body: kind === 'CONTRACT' ? CONTRACT_BODY : AMENDMENT_BODY,
  changeNote: null,
  createdById: null,
  publishedAt: new Date('2026-10-15T12:00:00Z'),
  publishedById: 'super-1',
  createdAt: new Date('2026-10-15T12:00:00Z'),
  updatedAt: new Date('2026-10-15T12:00:00Z'),
  ...over,
})

const profile = {
  companyId: COMPANY_A,
  legalName: 'Empresa Exemplo Ltda',
  tradeName: null,
  addressStreet: 'Rua Exemplo',
  addressNumber: '100',
  addressComplement: null,
  addressDistrict: 'Centro',
  addressCity: 'Cidade Exemplo',
  addressState: 'SP',
  addressZip: '01310100',
  legalRepName: 'Nome do Representante',
  legalRepCpf: '11144477735',
  legalRepRole: 'Diretor',
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  billingContactName: null,
  billingEmail: 'cobranca@example.com',
  billingPhone: null,
  notes: null,
}

const termsRow = (over: Record<string, unknown> = {}) => ({
  id: 'terms-1',
  version: 1,
  status: 'PROPOSED',
  origin: 'CONTRACT',
  effectiveFrom: null,
  licenseType: 'STANDARD',
  includedSeats: 10,
  extraSeats: 0,
  packagePrice: new Prisma.Decimal('1500'),
  extraSeatPrice: new Prisma.Decimal('95'),
  proposedEffectiveFrom: null,
  reason: null,
  requestedByClient: false,
  package: { name: 'Pacote 10' },
  ...over,
})

/** As consultas do envio: contrato, empresa com cadastro e termos, regras globais */
function mockSendState(opts: {
  status?: string
  designatedAdminId?: string | null
  terms?: ReturnType<typeof termsRow>[]
  profile?: typeof profile
}) {
  const terms = opts.terms ?? [termsRow()]
  const designatedAdminId = opts.designatedAdminId === undefined ? MARIA : opts.designatedAdminId
  prismaMock.companyContract.findUnique.mockResolvedValue({
    id: 'contract-1',
    status: opts.status ?? 'DRAFT',
    designatedAdminId,
    terms: terms.filter((t) => t.status === 'PROPOSED').map((t) => ({ origin: t.origin })),
  })
  prismaMock.company.findUnique.mockResolvedValue({
    cnpj: '12345678000190',
    clientProfile: opts.profile ?? profile,
    contract: {
      id: 'contract-1',
      graceMonths: 0,
      dueDay: 10,
      overdueBlockDays: null,
      designatedAdmin: designatedAdminId ? users[designatedAdminId] : null,
      terms,
    },
  })
  prismaMock.billingSettings.findUnique.mockResolvedValue({ overdueBlockDays: 15 })
  prismaMock.contractDocument.findFirst.mockResolvedValue(null)
  prismaMock.contractDocument.create.mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({
      id: DOC,
      lastEmailAt: null,
      acceptedAt: null,
      acceptedById: null,
      acceptedByName: null,
      acceptedByEmail: null,
      acceptedIp: null,
      acceptedUserAgent: null,
      cancelledAt: null,
      cancelledById: null,
      cancelReason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...args.data,
      template: { version: 1 },
      conditionsTemplate: args.data.conditionsTemplateId ? { version: 1 } : null,
      terms: { version: 1 },
    })
  )
  prismaMock.companyContract.updateMany.mockResolvedValue({ count: 1 })
}

function expectNoDocumentWrite() {
  expect(prismaMock.contractDocument.create).not.toHaveBeenCalled()
  expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  expect(mailer).not.toHaveBeenCalled()
}

const sendUrl = `/admin/billing/clients/${COMPANY_A}/documents/send`
const send = (payload?: object) =>
  app.inject({ method: 'POST', url: sendUrl, headers: auth('super'), payload })

describe('rotas de documentos — só o SUPERADMIN', () => {
  it.each([
    ['GET', `/admin/billing/clients/${COMPANY_A}/documents`, undefined],
    ['PUT', `/admin/billing/clients/${COMPANY_A}/designated-admin`, { userId: MARIA }],
    ['POST', `/admin/billing/clients/${COMPANY_A}/documents/preview`, {}],
    ['POST', sendUrl, {}],
    ['GET', `/admin/billing/documents/${DOC}`, undefined],
    ['POST', `/admin/billing/documents/${DOC}/resend`, undefined],
    ['POST', `/admin/billing/documents/${DOC}/cancel`, {}],
    ['PUT', `/admin/billing/clients/${COMPANY_A}/amendment`, {}],
    ['POST', `/admin/billing/clients/${COMPANY_A}/amendment/withdraw`, undefined],
  ] as const)('ADMIN em %s %s → 403', async (method, url, payload) => {
    const res = await app.inject({ method, url, headers: auth('maria'), payload })
    expect(res.statusCode).toBe(403)
    expect(prismaMock.companyContract.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.contractDocument.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})

describe('envio', () => {
  it('sem modelo publicado → 422 TEMPLATE_NOT_PUBLISHED', async () => {
    mockSendState({})
    prismaMock.contractTemplate.findFirst.mockResolvedValue(null)
    const res = await send()
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('TEMPLATE_NOT_PUBLISHED')
    expectNoDocumentWrite()
  })

  it('modelo publicado com marca → 422 TEMPLATE_NOT_PUBLISHABLE', async () => {
    mockSendState({})
    prismaMock.contractTemplate.findFirst.mockResolvedValue(
      template('CONTRACT', { body: '# C\n\n[[REVISAR: x]]' })
    )
    const res = await send()
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('TEMPLATE_NOT_PUBLISHABLE')
    expectNoDocumentWrite()
  })

  it('sem administrador indicado → 422 DESIGNATED_ADMIN_REQUIRED, sem create', async () => {
    mockSendState({ designatedAdminId: null })
    prismaMock.contractTemplate.findFirst.mockResolvedValue(template('CONTRACT'))
    const res = await send()
    expect(res.statusCode).toBe(422)
    expect(res.json()).toEqual({
      message: 'Escolha o administrador indicado pela Empresa antes de enviar.',
      code: 'DESIGNATED_ADMIN_REQUIRED',
    })
    expectNoDocumentWrite()
  })

  it.each([
    ['inativo', { active: false }],
    ['vendedor', { role: 'SALESPERSON' }],
    ['de outra empresa', { companyId: COMPANY_B }],
  ])('indicado %s → 422 DESIGNATED_ADMIN_INVALID, sem create', async (_label, over) => {
    users[MARIA] = { ...users[MARIA], ...over }
    mockSendState({})
    prismaMock.contractTemplate.findFirst.mockResolvedValue(template('CONTRACT'))
    const res = await send()
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('DESIGNATED_ADMIN_INVALID')
    expectNoDocumentWrite()
  })

  it('campo sem dado → 422 CONTRACT_FIELDS_MISSING com a lista', async () => {
    mockSendState({ profile: { ...profile, legalRepCpf: null } })
    prismaMock.contractTemplate.findFirst.mockResolvedValue(template('CONTRACT'))
    const res = await send()
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({
      code: 'CONTRACT_FIELDS_MISSING',
      details: { missing: ['cliente.representanteCpf'] },
    })
    expectNoDocumentWrite()
  })

  it('já existe documento enviado → 409 DOCUMENT_ALREADY_SENT', async () => {
    mockSendState({})
    prismaMock.contractTemplate.findFirst.mockResolvedValue(template('CONTRACT'))
    prismaMock.contractDocument.findFirst.mockResolvedValue({ id: DOC })
    const res = await send()
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('DOCUMENT_ALREADY_SENT')
    expectNoDocumentWrite()
  })

  it('contrato ativo sem aditivo proposto → 409 NOTHING_TO_SEND', async () => {
    mockSendState({ status: 'ACTIVE', terms: [termsRow({ status: 'EFFECTIVE' })] })
    const res = await send()
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('NOTHING_TO_SEND')
    expectNoDocumentWrite()
  })

  it('envio feliz: SHA-256 do texto, PENDING_ACCEPTANCE e um e-mail só, ao indicado', async () => {
    mockSendState({})
    prismaMock.contractTemplate.findFirst.mockResolvedValue(template('CONTRACT'))
    const res = await send({})
    expect(res.statusCode).toBe(201)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)

    // A trava da linha do contrato vem antes de tudo
    expect(prismaMock.companyContract.update).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      data: { seatGuardVersion: { increment: 1 } },
    })
    const data = prismaMock.contractDocument.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      kind: 'CONTRACT',
      status: 'SENT',
      sentById: 'super-1',
      companyId: COMPANY_A,
      contractId: 'contract-1',
      termsId: 'terms-1',
      templateId: TPL_C,
      conditionsTemplateId: TPL_C,
    })
    expect(data.renderedBody).toBe(
      [
        '# CONTRATO',
        '',
        '- **Empresa:** Empresa Exemplo Ltda',
        '- **CPF do representante:** 111.444.777-35',
        '- **Administrador indicado:** Maria Exemplo, maria@example.com',
        '- **Total mensal:** R$ 1.500,00 (mil e quinhentos reais)',
      ].join('\n')
    )
    expect(data.sha256).toBe(createHash('sha256').update(data.renderedBody, 'utf8').digest('hex'))
    expect(prismaMock.companyContract.updateMany).toHaveBeenCalledWith({
      where: { id: 'contract-1', status: 'DRAFT' },
      data: { status: 'PENDING_ACCEPTANCE' },
    })
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data).toEqual({
      type: 'DOCUMENT_SENT',
      companyId: COMPANY_A,
      actorId: 'super-1',
      payload: { fields: [], documentId: DOC, documentKind: 'CONTRACT' },
    })

    // Dois ADMINs ativos e billingEmail preenchido: um e-mail só, ao indicado
    expect(mailer).toHaveBeenCalledTimes(1)
    expect(mailer.mock.calls[0][0].to).toBe('maria@example.com')
    expect(mailer.mock.calls[0][0].subject).toBe(
      'Contrato de Licença de Uso do Addere aguardando seu aceite'
    )
    expect(mailer.mock.calls[0][0].html).toContain(`/contrato/${DOC}`)
    expect(prismaMock.contractDocument.update.mock.calls[0][0].where).toEqual({ id: DOC })
    expect(res.json()).toMatchObject({ emailSent: true, document: { id: DOC, status: 'SENT' } })

    // O evento não leva texto, e-mail nem CPF
    const events = JSON.stringify(prismaMock.billingEvent.create.mock.calls)
    expect(events).not.toContain('maria@example.com')
    expect(events).not.toContain('11144477735')
    expect(events).not.toContain('Empresa Exemplo')
  })

  it('RESEND_API_KEY ausente não derruba o envio', async () => {
    const actual = await vi.importActual<typeof import('../billing-mailer')>('../billing-mailer')
    mailer.mockImplementationOnce(actual.sendBillingEmail)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockSendState({})
    prismaMock.contractTemplate.findFirst.mockResolvedValue(template('CONTRACT'))
    const res = await send()
    warn.mockRestore()
    expect(res.statusCode).toBe(201)
    expect(res.json().emailSent).toBe(false)
    expect(prismaMock.contractDocument.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.contractDocument.update).not.toHaveBeenCalled()
  })
})

describe('prévia', () => {
  it('não falha por campo faltando: mostra a lista', async () => {
    mockSendState({ designatedAdminId: null })
    prismaMock.contractTemplate.findFirst.mockResolvedValue(template('CONTRACT'))
    const res = await app.inject({
      method: 'POST',
      url: `/admin/billing/clients/${COMPANY_A}/documents/preview`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      kind: 'CONTRACT',
      templateVersion: 1,
      missing: ['cliente.administradorNome', 'cliente.administradorEmail'],
      priceIncrease: false,
      minimumEffectiveFrom: null,
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.contractDocument.create).not.toHaveBeenCalled()
  })
})

describe('administrador indicado', () => {
  const url = `/admin/billing/clients/${COMPANY_A}/designated-admin`
  const put = (userId: string) =>
    app.inject({ method: 'PUT', url, headers: auth('super'), payload: { userId } })

  function mockContract(status: string, designatedAdminId: string | null, sent: object[]) {
    prismaMock.companyContract.findUnique.mockResolvedValue({
      id: 'contract-1',
      status,
      designatedAdminId,
    })
    prismaMock.contractDocument.findMany.mockResolvedValue(sent)
    prismaMock.contractDocument.updateMany.mockResolvedValue({ count: sent.length })
  }

  it('com o CONTRACT enviado: cancela o documento e o contrato volta a DRAFT', async () => {
    mockContract('PENDING_ACCEPTANCE', MARIA, [{ id: DOC, kind: 'CONTRACT', companyId: COMPANY_A }])
    const res = await put(JOAO)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ changed: true, cancelledDocuments: 1 })
    expect(prismaMock.companyContract.update).toHaveBeenCalledWith({
      where: { id: 'contract-1' },
      data: { designatedAdminId: JOAO },
    })
    expect(prismaMock.contractDocument.updateMany.mock.calls[0][0]).toMatchObject({
      where: { contractId: 'contract-1', status: 'SENT' },
      data: {
        status: 'CANCELLED',
        cancelledById: 'super-1',
        cancelReason: 'Administrador indicado trocado depois do envio',
      },
    })
    expect(prismaMock.companyContract.updateMany).toHaveBeenCalledWith({
      where: { id: 'contract-1', status: 'PENDING_ACCEPTANCE' },
      data: { status: 'DRAFT' },
    })
    const events = prismaMock.billingEvent.create.mock.calls.map(
      (c: [{ data: { type: string; payload: unknown } }]) => c[0].data
    )
    expect(events.map((e: { type: string }) => e.type)).toEqual([
      'DOCUMENT_CANCELLED',
      'DESIGNATED_ADMIN_CHANGED',
    ])
    // Só o nome do campo: nem nome nem e-mail do indicado
    expect(events[1].payload).toEqual({ fields: ['designatedAdminId'] })
    expect(JSON.stringify(events)).not.toContain('joao@example.com')
  })

  it('com um aditivo enviado: cancela o documento e o contrato continua ACTIVE', async () => {
    mockContract('ACTIVE', MARIA, [{ id: DOC, kind: 'AMENDMENT', companyId: COMPANY_A }])
    const res = await put(JOAO)
    expect(res.statusCode).toBe(200)
    expect(prismaMock.contractDocument.updateMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })

  it('o mesmo indicado não cancela nada nem grava evento', async () => {
    mockContract('PENDING_ACCEPTANCE', MARIA, [{ id: DOC, kind: 'CONTRACT', companyId: COMPANY_A }])
    const res = await put(MARIA)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ changed: false, cancelledDocuments: 0 })
    expect(prismaMock.companyContract.update).not.toHaveBeenCalled()
    expect(prismaMock.contractDocument.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  })

  it('quem não é ADMIN ativo da empresa → 422 DESIGNATED_ADMIN_INVALID', async () => {
    users[JOAO] = { ...users[JOAO], role: 'SALESPERSON' }
    mockContract('DRAFT', null, [])
    const res = await put(JOAO)
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('DESIGNATED_ADMIN_INVALID')
    expect(prismaMock.companyContract.update).not.toHaveBeenCalled()
  })

  it('sem contrato → 404; contrato cancelado → 409', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue(null)
    expect((await put(JOAO)).statusCode).toBe(404)
    prismaMock.companyContract.findUnique.mockResolvedValue({
      id: 'contract-1',
      status: 'CANCELLED',
      designatedAdminId: MARIA,
    })
    const res = await put(JOAO)
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('CONTRACT_NOT_ACTIVE')
  })

  it('GET …/documents lista em adminCandidates só os ADMINs ativos da empresa', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      id: COMPANY_A,
      contract: { designatedAdmin: users[MARIA], terms: [] },
    })
    prismaMock.user.findMany
      .mockResolvedValueOnce([
        { id: JOAO, name: 'João Exemplo', email: 'joao@example.com' },
        { id: MARIA, name: 'Maria Exemplo', email: 'maria@example.com' },
      ])
      .mockResolvedValueOnce([])
    const res = await app.inject({
      method: 'GET',
      url: `/admin/billing/clients/${COMPANY_A}/documents`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    const candidatesQuery = prismaMock.user.findMany.mock.calls[0][0]
    expect(candidatesQuery.where).toEqual({ companyId: COMPANY_A, role: 'ADMIN', active: true })
    expect(res.json()).toMatchObject({
      designatedAdmin: { id: MARIA, name: 'Maria Exemplo', valid: true },
      adminCandidates: [{ id: JOAO }, { id: MARIA }],
      activePilot: false,
      amendment: null,
    })
  })
})

describe('reenvio e cancelamento', () => {
  it('reenviar documento aceito → 409 DOCUMENT_NOT_PENDING', async () => {
    prismaMock.contractDocument.findUnique.mockResolvedValue({
      id: DOC,
      kind: 'CONTRACT',
      status: 'ACCEPTED',
      companyId: COMPANY_A,
      contract: { designatedAdminId: MARIA },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/admin/billing/documents/${DOC}/resend`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('DOCUMENT_NOT_PENDING')
    expect(mailer).not.toHaveBeenCalled()
  })

  it('reenviar com o indicado inativo → 422 DESIGNATED_ADMIN_INVALID', async () => {
    users[MARIA] = { ...users[MARIA], active: false }
    prismaMock.contractDocument.findUnique.mockResolvedValue({
      id: DOC,
      kind: 'CONTRACT',
      status: 'SENT',
      companyId: COMPANY_A,
      contract: { designatedAdminId: MARIA },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/admin/billing/documents/${DOC}/resend`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('DESIGNATED_ADMIN_INVALID')
    expect(mailer).not.toHaveBeenCalled()
  })

  it('reenviar: um e-mail ao indicado, lastEmailAt e DOCUMENT_RESENT', async () => {
    prismaMock.contractDocument.findUnique.mockResolvedValue({
      id: DOC,
      kind: 'AMENDMENT',
      status: 'SENT',
      companyId: COMPANY_A,
      contract: { designatedAdminId: MARIA },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/admin/billing/documents/${DOC}/resend`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ emailSent: true })
    expect(mailer).toHaveBeenCalledTimes(1)
    expect(mailer.mock.calls[0][0].to).toBe('maria@example.com')
    expect(mailer.mock.calls[0][0].subject).toBe(
      'Aditivo ao Contrato de Licença de Uso do Addere aguardando seu aceite'
    )
    expect(prismaMock.contractDocument.update.mock.calls[0][0].data.lastEmailAt).toBeInstanceOf(
      Date
    )
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data.type).toBe('DOCUMENT_RESENT')
  })

  it('cancelar o envio com motivo', async () => {
    prismaMock.contractDocument.findUnique.mockResolvedValue({
      status: 'SENT',
      contractId: 'contract-1',
    })
    prismaMock.contractDocument.findMany.mockResolvedValue([
      { id: DOC, kind: 'CONTRACT', companyId: COMPANY_A },
    ])
    prismaMock.contractDocument.updateMany.mockResolvedValue({ count: 1 })
    const res = await app.inject({
      method: 'POST',
      url: `/admin/billing/documents/${DOC}/cancel`,
      headers: auth('super'),
      payload: { reason: 'Cliente pediu correção' },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.contractDocument.updateMany.mock.calls[0][0].data.cancelReason).toBe(
      'Cliente pediu correção'
    )
    expect(prismaMock.companyContract.updateMany).toHaveBeenCalledWith({
      where: { id: 'contract-1', status: 'PENDING_ACCEPTANCE' },
      data: { status: 'DRAFT' },
    })
  })
})

// ─── Aditivo ─────────────────────────────────────────────────────────────────

describe('aditivo', () => {
  const url = `/admin/billing/clients/${COMPANY_A}/amendment`
  const today = todayYmdSaoPaulo(new Date())
  const minimum = minimumEffectiveDate(today)
  const dayBefore = (ymd: string) => {
    const d = new Date(`${ymd}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - 1)
    return d.toISOString().slice(0, 10)
  }

  const p10 = { id: PKG_P10, code: 'P10', name: 'Pacote 10', seats: 10, active: true }
  const effective = termsRow({
    status: 'EFFECTIVE',
    effectiveFrom: new Date('2026-09-01T12:00:00Z'),
    packageId: PKG_P10,
  })

  const body = (over: Record<string, unknown> = {}) => ({
    packageId: PKG_P10,
    licenseType: 'INTELLIGENCE',
    extraSeats: 0,
    packagePrice: '1500.00',
    extraSeatPrice: '95.00',
    reason: 'Troca para Com Inteligência',
    ...over,
  })
  const put = (payload: object) =>
    app.inject({ method: 'PUT', url, headers: auth('super'), payload })

  function mockActive(terms: object[]) {
    prismaMock.companyContract.findUnique.mockResolvedValue({
      id: 'contract-1',
      status: 'ACTIVE',
      terms,
    })
    prismaMock.licensePackage.findUnique.mockResolvedValue(p10)
  }

  it('cria o aditivo proposto, com a data às 00:01 de São Paulo', async () => {
    mockActive([effective])
    const res = await put(body({ packagePrice: '2000.00', proposedEffectiveFrom: minimum }))
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ termsVersion: 2, changed: true })
    expect(prismaMock.contractTerms.create.mock.calls[0][0].data).toMatchObject({
      contractId: 'contract-1',
      version: 2,
      status: 'PROPOSED',
      origin: 'AMENDMENT',
      createdById: 'super-1',
      licenseType: 'INTELLIGENCE',
      includedSeats: 10,
      packagePrice: '2000.00',
      proposedEffectiveFrom: effectiveInstantOfDay(minimum),
      requestedByClient: false,
    })
    const event = prismaMock.billingEvent.create.mock.calls[0][0].data
    expect(event.type).toBe('AMENDMENT_PROPOSED')
    expect(event.payload.termsVersion).toBe(2)
    expect(event.payload.fields).toEqual(
      expect.arrayContaining(['licenseType', 'packagePrice', 'proposedEffectiveFrom', 'reason'])
    )
    expect(JSON.stringify(event)).not.toContain('Troca para Com Inteligência')
  })

  it('aumenta o preço sem data → 422 AMENDMENT_NOTICE_TOO_SHORT com a data mínima', async () => {
    mockActive([effective])
    const res = await put(body({ packagePrice: '2000.00' }))
    expect(res.statusCode).toBe(422)
    expect(res.json()).toMatchObject({
      code: 'AMENDMENT_NOTICE_TOO_SHORT',
      details: { minimumEffectiveFrom: minimum },
    })
    expect(prismaMock.contractTerms.create).not.toHaveBeenCalled()
  })

  it('aumenta o preço com data curta → 422', async () => {
    mockActive([effective])
    const res = await put(
      body({ packagePrice: '2000.00', proposedEffectiveFrom: dayBefore(minimum) })
    )
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('AMENDMENT_NOTICE_TOO_SHORT')
  })

  it('a pedido da Empresa, o aumento vale no aceite, sem data', async () => {
    mockActive([effective])
    const res = await put(body({ packagePrice: '2000.00', requestedByClient: true }))
    expect(res.statusCode).toBe(200)
    expect(prismaMock.contractTerms.create.mock.calls[0][0].data).toMatchObject({
      requestedByClient: true,
      proposedEffectiveFrom: null,
    })
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data.payload.requestedByClient).toBe(
      true
    )
  })

  it('mais licenças adicionais pelo mesmo valor unitário vale no aceite', async () => {
    mockActive([effective])
    const res = await put(body({ licenseType: 'STANDARD', extraSeats: 5 }))
    expect(res.statusCode).toBe(200)
  })

  it('editar o aditivo cancela o documento enviado e mantém o contrato ACTIVE', async () => {
    const proposed = termsRow({
      id: 'terms-2',
      version: 2,
      origin: 'AMENDMENT',
      packageId: PKG_P10,
      licenseType: 'INTELLIGENCE',
      reason: 'Troca para Com Inteligência',
    })
    mockActive([effective, proposed])
    prismaMock.contractDocument.findMany.mockResolvedValue([
      { id: DOC, kind: 'AMENDMENT', companyId: COMPANY_A },
    ])
    prismaMock.contractDocument.updateMany.mockResolvedValue({ count: 1 })
    const res = await put(body({ extraSeats: 2 }))
    expect(res.statusCode).toBe(200)
    expect(prismaMock.contractTerms.update.mock.calls[0][0].where).toEqual({ id: 'terms-2' })
    expect(prismaMock.contractDocument.updateMany.mock.calls[0][0].data.cancelReason).toBe(
      'Aditivo alterado depois do envio'
    )
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
    expect(
      prismaMock.billingEvent.create.mock.calls.map(
        (c: [{ data: { type: string } }]) => c[0].data.type
      )
    ).toEqual(['DOCUMENT_CANCELLED', 'AMENDMENT_PROPOSED'])
  })

  it('o mesmo aditivo de novo não cancela nada', async () => {
    const proposed = termsRow({
      id: 'terms-2',
      version: 2,
      origin: 'AMENDMENT',
      packageId: PKG_P10,
      licenseType: 'INTELLIGENCE',
      packagePrice: new Prisma.Decimal('1500'),
      reason: 'Troca para Com Inteligência',
    })
    mockActive([effective, proposed])
    const res = await put(body())
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ termsVersion: 2, changed: false })
    expect(prismaMock.contractTerms.update).not.toHaveBeenCalled()
    expect(prismaMock.contractDocument.updateMany).not.toHaveBeenCalled()
  })

  it('contrato fora de ACTIVE → 409 CONTRACT_NOT_ACTIVE', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue({
      id: 'contract-1',
      status: 'DRAFT',
      terms: [],
    })
    const res = await put(body())
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('CONTRACT_NOT_ACTIVE')
  })

  it('aditivo aceito que ainda não vale → 409 AMENDMENT_NOT_YET_EFFECTIVE', async () => {
    mockActive([
      effective,
      termsRow({
        id: 'terms-2',
        version: 2,
        status: 'EFFECTIVE',
        origin: 'AMENDMENT',
        effectiveFrom: new Date(Date.now() + 10 * 86_400_000),
      }),
    ])
    const res = await put(body())
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('AMENDMENT_NOT_YET_EFFECTIVE')
  })

  it('motivo é obrigatório → 400', async () => {
    mockActive([effective])
    const res = await put(body({ reason: '' }))
    expect(res.statusCode).toBe(400)
    expect(prismaMock.contractTerms.create).not.toHaveBeenCalled()
  })

  it('descartar: WITHDRAWN e cancela o documento do aditivo', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue({
      id: 'contract-1',
      terms: [{ id: 'terms-2', version: 2 }],
    })
    prismaMock.contractDocument.findMany.mockResolvedValue([
      { id: DOC, kind: 'AMENDMENT', companyId: COMPANY_A },
    ])
    prismaMock.contractDocument.updateMany.mockResolvedValue({ count: 1 })
    const res = await app.inject({
      method: 'POST',
      url: `${url}/withdraw`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.contractTerms.updateMany).toHaveBeenCalledWith({
      where: { contractId: 'contract-1', status: 'PROPOSED', origin: 'AMENDMENT' },
      data: { status: 'WITHDRAWN' },
    })
    expect(
      prismaMock.billingEvent.create.mock.calls.map(
        (c: [{ data: { type: string } }]) => c[0].data.type
      )
    ).toEqual(['DOCUMENT_CANCELLED', 'AMENDMENT_WITHDRAWN'])
  })

  it('envio do aditivo que aumenta o preço sem data → 422', async () => {
    mockSendState({
      status: 'ACTIVE',
      terms: [
        effective,
        termsRow({
          id: 'terms-2',
          version: 2,
          origin: 'AMENDMENT',
          packagePrice: new Prisma.Decimal('2000'),
          reason: 'Reajuste',
        }),
      ],
    })
    prismaMock.contractTemplate.findFirst.mockResolvedValue(template('AMENDMENT'))
    prismaMock.contractDocument.findFirst.mockResolvedValue({
      acceptedAt: new Date('2026-09-01T12:00:00Z'),
    })
    const res = await send()
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('AMENDMENT_NOTICE_TOO_SHORT')
    expect(prismaMock.contractDocument.create).not.toHaveBeenCalled()
  })

  it('envio do aditivo sem aumento: vale no aceite e o texto traz a emissão no "vale a partir de"', async () => {
    mockSendState({
      status: 'ACTIVE',
      terms: [
        effective,
        termsRow({
          id: 'terms-2',
          version: 2,
          origin: 'AMENDMENT',
          extraSeats: 2,
          reason: 'Mais licenças',
        }),
      ],
    })
    prismaMock.contractTemplate.findFirst.mockResolvedValue(template('AMENDMENT'))
    // A data do aceite do CONTRACT original, e depois a checagem do documento já enviado
    prismaMock.contractDocument.findFirst
      .mockResolvedValueOnce({ acceptedAt: new Date('2026-09-01T12:00:00Z') })
      .mockResolvedValueOnce(null)
    const res = await send()
    expect(res.statusCode).toBe(201)
    const data = prismaMock.contractDocument.create.mock.calls[0][0].data
    expect(data.kind).toBe('AMENDMENT')
    expect(data.conditionsTemplateId).toBeNull()
    expect(data.renderedBody).toContain('Contrato aceito em 01/09/2026. Motivo: Mais licenças')
    expect(data.renderedBody).toContain('- **Depois:** R$ 1.690,00')
    // Aditivo não muda o status do contrato
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })
})
