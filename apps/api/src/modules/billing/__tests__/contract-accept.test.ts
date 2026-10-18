// Aceite pelo administrador indicado (plano 014, passo 8): só ele aceita, com
// o papel relido no banco; o hash calculado no navegador tem de bater; o
// updateMany filtra SENT; o IP gravado é o do cliente, não o do proxy; e a
// Inteligência segue o tipo de licença vigente.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { effectiveInstantOfDay, resolveCompetenceTerms } from '@addere/types'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())
vi.mock('../billing-mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../billing-mailer')>()
  return { ...actual, sendBillingEmail: vi.fn(async () => true) }
})

import { prismaCallLog, prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'
import { sendBillingEmail } from '../billing-mailer'
import { acceptDocument } from '../me.service'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const MARIA = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
const JOAO = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2'
const DOC = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3'
const HASH = 'ab'.repeat(32)
const OTHER_HASH = 'cd'.repeat(32)

let app: FastifyInstance
let tokens: Record<string, string>
const mailer = vi.mocked(sendBillingEmail)

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    // O e-mail do token é de propósito diferente do banco: o aceite congela o do banco
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

type UserRow = Record<string, unknown> & { role: string; active: boolean; companyId: string | null }
let users: Record<string, UserRow>

const userRow = (id: string, name: string, email: string): UserRow => ({
  id,
  name,
  email,
  role: 'ADMIN',
  active: true,
  companyId: COMPANY_A,
  createdAt: new Date('2026-10-01T12:00:00Z'),
  idVendProt: null,
  servedCities: [],
  managerId: null,
  company: { name: 'Empresa Exemplo', intelligenceEnabled: false, intelligenceConfig: null },
})

beforeEach(() => {
  resetPrismaMock()
  mailer.mockReset()
  mailer.mockResolvedValue(true)
  users = {
    [MARIA]: userRow(MARIA, 'Maria Exemplo', 'maria@example.com'),
    [JOAO]: userRow(JOAO, 'João Exemplo', 'joao@example.com'),
    'sales-a': { ...userRow('sales-a', 'Vendedor', 'v@example.com'), role: 'SALESPERSON' },
  }
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where: { id: string } }) => users[args.where.id] ?? { active: true }
  )
  prismaMock.userPermission.findMany.mockResolvedValue([])
})

const auth = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })

const docRow = (over: Record<string, unknown> = {}) => ({
  id: DOC,
  kind: 'CONTRACT',
  status: 'SENT',
  sha256: HASH,
  contractId: 'contract-1',
  termsId: 'terms-1',
  ...over,
})

const fullDoc = (over: Record<string, unknown> = {}) => ({
  ...docRow(),
  renderedBody: '# CONTRATO',
  sentAt: new Date('2026-10-15T12:00:00Z'),
  sentById: 'super-1',
  lastEmailAt: null,
  acceptedAt: new Date('2026-10-16T12:00:00Z'),
  acceptedById: MARIA,
  acceptedByName: 'Maria Exemplo',
  acceptedByEmail: 'maria@example.com',
  acceptedIp: '203.0.113.9',
  acceptedUserAgent: 'Navegador de teste',
  cancelledAt: null,
  cancelledById: null,
  cancelReason: null,
  companyId: COMPANY_A,
  templateId: 'tpl-1',
  conditionsTemplateId: 'tpl-1',
  createdAt: new Date('2026-10-15T12:00:00Z'),
  updatedAt: new Date('2026-10-16T12:00:00Z'),
  template: { version: 1 },
  conditionsTemplate: { version: 1 },
  terms: { version: 1 },
  status: 'ACCEPTED',
  ...over,
})

/** O estado do banco para um aceite: documento, contrato, termos e a empresa */
function mockAccept(opts: {
  doc?: Record<string, unknown> | null
  designatedAdminId?: string | null
  proposedEffectiveFrom?: Date | null
  // Termos EFFECTIVE que a sincronização da Inteligência lê depois do aceite
  effectiveTerms?: Array<{
    status: string
    effectiveFrom: Date
    version: number
    licenseType: string
  }>
  intelligenceEnabled?: boolean
}) {
  prismaMock.contractDocument.findFirst.mockResolvedValue(
    opts.doc === undefined ? docRow() : opts.doc
  )
  prismaMock.companyContract.findUnique
    .mockResolvedValueOnce({
      id: 'contract-1',
      companyId: COMPANY_A,
      designatedAdminId: opts.designatedAdminId === undefined ? MARIA : opts.designatedAdminId,
      graceMonths: 0,
      dueDay: 10,
    })
    .mockResolvedValueOnce({
      status: 'ACTIVE',
      terms: opts.effectiveTerms ?? [
        {
          // Os termos que o aceite acabou de tornar EFFECTIVE (no aceite, ou seja, já valem)
          status: 'EFFECTIVE',
          effectiveFrom: new Date(Date.now() - 60_000),
          version: 1,
          licenseType: 'INTELLIGENCE',
        },
      ],
    })
  prismaMock.contractDocument.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.contractTerms.findUnique.mockResolvedValue({
    version: 1,
    proposedEffectiveFrom: opts.proposedEffectiveFrom ?? null,
  })
  prismaMock.contractTerms.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.companyContract.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.company.findUnique.mockResolvedValue({
    intelligenceEnabled: opts.intelligenceEnabled ?? false,
  })
  prismaMock.contractDocument.findUnique.mockResolvedValue(fullDoc())
  prismaMock.user.findMany.mockResolvedValue([
    { email: 'maria@example.com' },
    { email: 'JOAO@example.com' },
  ])
  prismaMock.clientProfile.findUnique.mockResolvedValue({ billingEmail: 'joao@example.com' })
  prismaMock.billingSettings.findUnique.mockResolvedValue({ notifyEmail: 'avisos@example.com' })
}

const accept = (who: keyof typeof tokens, sha256 = HASH, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: `/billing/me/documents/${DOC}/accept`,
    headers: { ...auth(who), ...headers },
    payload: { sha256 },
  })

/** A trava da linha do contrato (contract-lock.ts), pela empresa de quem chama */
const LOCK = {
  call: 'companyContract.updateMany',
  args: [{ where: { companyId: COMPANY_A }, data: { seatGuardVersion: { increment: 1 } } }],
}

/** As escritas no status do contrato, sem a trava */
const contractStatusWrites = () =>
  prismaMock.companyContract.updateMany.mock.calls
    .map((c: [{ data: Record<string, unknown> }]) => c[0])
    .filter((a: { data: Record<string, unknown> }) => a.data.seatGuardVersion === undefined)

function expectNoAcceptWrite() {
  // Só a trava: nenhuma escrita do aceite
  expect(prismaCallLog({ writesOnly: true })).toEqual([LOCK])
  expect(mailer).not.toHaveBeenCalled()
}

describe('só o administrador indicado aceita', () => {
  it('outro ADMIN ativo da mesma empresa → 403 NOT_DESIGNATED_ADMIN', async () => {
    mockAccept({})
    const res = await accept('joao')
    expect(res.statusCode).toBe(403)
    expect(res.json()).toEqual({
      message: 'Só o administrador indicado pela sua empresa pode fazer isso.',
      code: 'NOT_DESIGNATED_ADMIN',
    })
    expectNoAcceptWrite()
  })

  it.each(['maria', 'joao'] as const)('contrato sem indicado → 403 para %s', async (who) => {
    mockAccept({ designatedAdminId: null })
    const res = await accept(who)
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('NOT_DESIGNATED_ADMIN')
    expectNoAcceptWrite()
  })

  it('indicado rebaixado a vendedor (o JWT ainda diz ADMIN) → 403', async () => {
    users[MARIA] = { ...users[MARIA], role: 'SALESPERSON' }
    mockAccept({})
    const res = await accept('maria')
    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('NOT_DESIGNATED_ADMIN')
    expectNoAcceptWrite()
  })

  it('o indicado vem antes do hash: quem não pode aceitar não ouve falar do texto', async () => {
    mockAccept({})
    const res = await accept('joao', OTHER_HASH)
    expect(res.statusCode).toBe(403)
  })
})

describe('aceite — recusas', () => {
  it('hash diferente → 422 DOCUMENT_HASH_MISMATCH, sem updateMany', async () => {
    mockAccept({})
    const res = await accept('maria', OTHER_HASH)
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('DOCUMENT_HASH_MISMATCH')
    expectNoAcceptWrite()
  })

  it('documento cancelado → 409 DOCUMENT_NOT_PENDING', async () => {
    mockAccept({ doc: docRow({ status: 'CANCELLED' }) })
    const res = await accept('maria')
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({
      message: 'Este documento já foi aceito ou cancelado.',
      code: 'DOCUMENT_NOT_PENDING',
    })
    expectNoAcceptWrite()
  })

  it('documento de outra empresa → 404 (a busca filtra a empresa de quem chama)', async () => {
    mockAccept({ doc: null })
    const res = await accept('maria')
    expect(res.statusCode).toBe(404)
    expect(prismaMock.contractDocument.findFirst.mock.calls[0][0].where).toEqual({
      id: DOC,
      companyId: COMPANY_A,
    })
    expectNoAcceptWrite()
  })

  it('segundo aceite (updateMany com count 0) → 409 e nenhuma outra escrita', async () => {
    mockAccept({})
    prismaMock.contractDocument.updateMany.mockResolvedValue({ count: 0 })
    const res = await accept('maria')
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('DOCUMENT_NOT_PENDING')
    expect(prismaCallLog({ writesOnly: true }).map((c) => c.call)).toEqual([
      'companyContract.updateMany', // a trava
      'contractDocument.updateMany', // o aceite que deu count 0
    ])
    expect(prismaMock.company.update).not.toHaveBeenCalled()
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
    expect(mailer).not.toHaveBeenCalled()
  })

  it.each(['sales', 'super'] as const)('%s em /billing/me/documents → 403', async (who) => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/me/documents',
      headers: auth(who),
    })
    expect(res.statusCode).toBe(403)
    expect(prismaMock.contractDocument.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.contractDocument.findMany).not.toHaveBeenCalled()
  })

  it('vendedor não aceita → 403 antes de qualquer consulta', async () => {
    const res = await accept('sales')
    expect(res.statusCode).toBe(403)
    expect(prismaMock.contractDocument.findFirst).not.toHaveBeenCalled()
  })
})

describe('aceite feliz do contrato', () => {
  it('tudo numa transação: documento, termos, contrato, Inteligência e evento', async () => {
    mockAccept({})
    const res = await accept('maria', HASH, { 'user-agent': 'Navegador de teste' })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)

    const acceptCall = prismaMock.contractDocument.updateMany.mock.calls[0][0]
    expect(acceptCall.where).toEqual({ id: DOC, status: 'SENT' })
    expect(acceptCall.data).toMatchObject({
      status: 'ACCEPTED',
      acceptedById: MARIA,
      // Do banco, não do JWT (o token diz token@example.com)
      acceptedByName: 'Maria Exemplo',
      acceptedByEmail: 'maria@example.com',
      acceptedUserAgent: 'Navegador de teste',
    })
    const acceptedAt: Date = acceptCall.data.acceptedAt

    expect(prismaMock.contractTerms.updateMany).toHaveBeenCalledWith({
      where: { id: 'terms-1', status: 'PROPOSED' },
      data: { status: 'EFFECTIVE', effectiveFrom: acceptedAt },
    })
    const [contractCall] = contractStatusWrites()
    expect(contractCall.where).toEqual({ id: 'contract-1', status: 'PENDING_ACCEPTANCE' })
    expect(contractCall.data.status).toBe('ACTIVE')
    expect(contractCall.data.startDate).toBeInstanceOf(Date)
    expect(contractCall.data.firstBilledCompetence).toBeInstanceOf(Date)
    // Com Inteligência: o aceite liga a camada
    expect(prismaMock.company.update).toHaveBeenCalledWith({
      where: { id: COMPANY_A },
      data: { intelligenceEnabled: true },
    })
    const events = prismaMock.billingEvent.create.mock.calls.map(
      (c: [{ data: Record<string, unknown> }]) => c[0].data
    )
    expect(events.map((e: Record<string, unknown>) => e.type)).toEqual([
      'INTELLIGENCE_APPLIED',
      'DOCUMENT_ACCEPTED',
    ])
    expect(events[1]).toEqual({
      type: 'DOCUMENT_ACCEPTED',
      companyId: COMPANY_A,
      actorId: MARIA,
      payload: { fields: [], documentId: DOC, documentKind: 'CONTRACT', termsVersion: 1 },
    })
    // Nem IP, nem navegador, nem e-mail no histórico
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('maria@example.com')
    expect(serialized).not.toContain('Navegador')
    expect(serialized).not.toContain('127.0.0.1')

    // Confirmação sem repetir endereço: os ADMINs, o contato de cobrança e a Addere
    expect(mailer.mock.calls.map((c) => c[0].to)).toEqual([
      'maria@example.com',
      'joao@example.com',
      'avisos@example.com',
    ])
    expect(mailer.mock.calls[0][0].subject).toBe('Contrato de Licença de Uso do Addere aceito')
    expect(mailer.mock.calls[0][0].html).not.toContain('203.0.113.9')
    expect(res.json()).toMatchObject({ id: DOC, status: 'ACCEPTED' })
  })

  it('grava o IP do cliente, não o do proxy nem o forjado à esquerda', async () => {
    mockAccept({})
    const res = await app.inject({
      method: 'POST',
      url: `/billing/me/documents/${DOC}/accept`,
      remoteAddress: '10.0.0.5',
      headers: { ...auth('maria'), 'x-forwarded-for': '198.51.100.20, 203.0.113.9' },
      payload: { sha256: HASH },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.contractDocument.updateMany.mock.calls[0][0].data.acceptedIp).toBe(
      '203.0.113.9'
    )
  })

  it('falha no e-mail de confirmação não desfaz o aceite', async () => {
    mockAccept({})
    mailer.mockResolvedValue(false)
    const res = await accept('maria')
    expect(res.statusCode).toBe(200)
  })
})

describe('aceite — a trava da linha do contrato vem primeiro', () => {
  const request = {
    userId: MARIA,
    companyId: COMPANY_A,
    sha256: HASH,
    ip: '203.0.113.9',
    userAgent: 'Navegador de teste',
  }

  it('é a primeira chamada ao banco: o documento só é lido depois dela', async () => {
    mockAccept({})
    await acceptDocument(DOC, request, new Date())
    const calls = prismaCallLog()
    expect(calls[0]).toEqual(LOCK)
    expect(calls[1].call).toBe('contractDocument.findFirst')
    // E a primeira escrita: documento, termos e contrato vêm depois, nessa ordem
    expect(
      prismaCallLog({ writesOnly: true })
        .slice(0, 4)
        .map((c) => c.call)
    ).toEqual([
      'companyContract.updateMany',
      'contractDocument.updateMany',
      'contractTerms.updateMany',
      'companyContract.updateMany',
    ])
  })

  it('empresa sem contrato → 404, sem ler nem escrever o documento', async () => {
    mockAccept({})
    prismaMock.companyContract.updateMany.mockResolvedValue({ count: 0 })
    await expect(acceptDocument(DOC, request, new Date())).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(prismaMock.contractDocument.findFirst).not.toHaveBeenCalled()
    expect(prismaCallLog({ writesOnly: true })).toEqual([LOCK])
  })

  it('a edição confirmou antes: na releitura o documento está CANCELLED → 409', async () => {
    // O rascunho editado cancelou o documento enquanto o aceite esperava a trava
    mockAccept({ doc: docRow({ status: 'CANCELLED' }) })
    await expect(acceptDocument(DOC, request, new Date())).rejects.toMatchObject({
      statusCode: 409,
      code: 'DOCUMENT_NOT_PENDING',
    })
    expectNoAcceptWrite()
  })
})

describe('aceite do aditivo', () => {
  const now = new Date('2026-10-20T15:00:00Z')
  const request = {
    userId: MARIA,
    companyId: COMPANY_A,
    sha256: HASH,
    ip: '203.0.113.9',
    userAgent: 'Navegador de teste',
  }
  const old = {
    status: 'EFFECTIVE',
    effectiveFrom: new Date('2026-09-01T12:00:00Z'),
    version: 1,
    licenseType: 'STANDARD',
  }

  it('com "vale a partir de" futuro: effectiveFrom é a data e a Inteligência não muda no aceite', async () => {
    const valeAPartirDe = effectiveInstantOfDay('2026-12-01')
    mockAccept({
      doc: docRow({ kind: 'AMENDMENT', termsId: 'terms-2' }),
      proposedEffectiveFrom: valeAPartirDe,
      effectiveTerms: [
        old,
        {
          status: 'EFFECTIVE',
          effectiveFrom: valeAPartirDe,
          version: 2,
          licenseType: 'INTELLIGENCE',
        },
      ],
    })
    await acceptDocument(DOC, request, now)

    const termsCall = prismaMock.contractTerms.updateMany.mock.calls[0][0]
    expect(termsCall.data).toEqual({ status: 'EFFECTIVE', effectiveFrom: valeAPartirDe })
    expect(termsCall.data.effectiveFrom.toISOString()).toBe('2026-12-01T03:01:00.000Z')
    // Aditivo não mexe no status do contrato
    expect(contractStatusWrites()).toEqual([])
    expect(prismaMock.company.update).not.toHaveBeenCalled()

    // Fronteira do dia 1 (contrato §6.4): dezembro pelos termos anteriores, janeiro pelos novos
    const terms = [
      { status: 'EFFECTIVE' as const, effectiveFrom: old.effectiveFrom, version: 1 },
      {
        status: 'EFFECTIVE' as const,
        effectiveFrom: termsCall.data.effectiveFrom as Date,
        version: 2,
      },
    ]
    expect(resolveCompetenceTerms(terms, new Date(Date.UTC(2026, 11, 1)))?.version).toBe(1)
    expect(resolveCompetenceTerms(terms, new Date(Date.UTC(2027, 0, 1)))?.version).toBe(2)
  })

  it('sem data: vale no aceite e a Inteligência muda na mesma transação', async () => {
    mockAccept({
      doc: docRow({ kind: 'AMENDMENT', termsId: 'terms-2' }),
      proposedEffectiveFrom: null,
      effectiveTerms: [
        old,
        { status: 'EFFECTIVE', effectiveFrom: now, version: 2, licenseType: 'INTELLIGENCE' },
      ],
    })
    await acceptDocument(DOC, request, now)
    expect(prismaMock.contractTerms.updateMany.mock.calls[0][0].data.effectiveFrom).toEqual(now)
    expect(prismaMock.company.update).toHaveBeenCalledWith({
      where: { id: COMPANY_A },
      data: { intelligenceEnabled: true },
    })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
  })

  it('"vale a partir de" que já passou: vale no aceite', async () => {
    mockAccept({
      doc: docRow({ kind: 'AMENDMENT', termsId: 'terms-2' }),
      proposedEffectiveFrom: effectiveInstantOfDay('2026-10-01'),
    })
    await acceptDocument(DOC, request, now)
    expect(prismaMock.contractTerms.updateMany.mock.calls[0][0].data.effectiveFrom).toEqual(now)
  })
})

describe('GET /billing/me', () => {
  const termsRow = (over: Record<string, unknown>) => ({
    status: 'EFFECTIVE',
    version: 1,
    effectiveFrom: new Date('2026-09-01T12:00:00Z'),
    licenseType: 'STANDARD',
    includedSeats: 10,
    extraSeats: 0,
    packagePrice: new Prisma.Decimal('1000'),
    extraSeatPrice: new Prisma.Decimal('95'),
    package: { code: 'P10', name: 'Pacote 10' },
    ...over,
  })
  const contract = (over: Record<string, unknown> = {}) => ({
    companyId: COMPANY_A,
    status: 'ACTIVE',
    startDate: new Date('2026-09-01T00:00:00Z'),
    graceMonths: 0,
    firstBilledCompetence: new Date('2026-10-01T00:00:00Z'),
    dueDay: 10,
    designatedAdmin: users[MARIA],
    terms: [termsRow({})],
    ...over,
  })

  it('sem contrato: tudo null', async () => {
    const res = await app.inject({ method: 'GET', url: '/billing/me', headers: auth('joao') })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      contract: null,
      currentTerms: null,
      scheduledTerms: null,
      pendingDocument: null,
      designatedAdmin: null,
    })
  })

  it('aditivo aceito para o futuro: atuais e agendados diferentes; indicado válido', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue(
      contract({
        terms: [
          termsRow({}),
          termsRow({
            version: 2,
            effectiveFrom: new Date(Date.now() + 40 * 86_400_000),
            licenseType: 'INTELLIGENCE',
            packagePrice: new Prisma.Decimal('1500'),
          }),
        ],
      })
    )
    const res = await app.inject({ method: 'GET', url: '/billing/me', headers: auth('joao') })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.contract).toMatchObject({ status: 'ACTIVE', dueDay: 10 })
    expect(body.currentTerms).toMatchObject({ licenseType: 'STANDARD', monthlyTotal: '1000.00' })
    expect(body.scheduledTerms).toMatchObject({
      licenseType: 'INTELLIGENCE',
      packagePrice: '1500.00',
    })
    expect(body.designatedAdmin).toEqual({ id: MARIA, name: 'Maria Exemplo', valid: true })
  })

  it.each([
    ['desativado', { active: false }],
    ['rebaixado', { role: 'SALESPERSON' }],
  ])('indicado %s: valid false', async (_label, over) => {
    prismaMock.companyContract.findUnique.mockResolvedValue(
      contract({ designatedAdmin: { ...users[MARIA], ...over } })
    )
    const res = await app.inject({ method: 'GET', url: '/billing/me', headers: auth('joao') })
    expect(res.json().designatedAdmin).toEqual({ id: MARIA, name: 'Maria Exemplo', valid: false })
  })

  it('contrato em rascunho não aparece para o cliente', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue(
      contract({ status: 'DRAFT', terms: [] })
    )
    const res = await app.inject({ method: 'GET', url: '/billing/me', headers: auth('maria') })
    expect(res.json().contract).toBeNull()
  })
})

describe('GET /auth/me — documento pendente', () => {
  const pending = {
    id: DOC,
    kind: 'CONTRACT',
    sentAt: new Date('2026-10-15T12:00:00Z'),
    contract: { companyId: COMPANY_A, designatedAdmin: null as unknown },
  }

  it.each(['maria', 'joao'] as const)(
    'ADMIN (%s) recebe o pendente com o indicado',
    async (who) => {
      pending.contract.designatedAdmin = users[MARIA]
      prismaMock.contractDocument.findFirst.mockResolvedValue(pending)
      const res = await app.inject({ method: 'GET', url: '/auth/me', headers: auth(who) })
      expect(res.statusCode).toBe(200)
      expect(res.json().company.pendingDocument).toEqual({
        id: DOC,
        kind: 'CONTRACT',
        sentAt: '2026-10-15T12:00:00.000Z',
        designatedAdmin: { id: MARIA, name: 'Maria Exemplo', valid: true },
      })
    }
  )

  it('vendedor recebe null, sem consulta', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: auth('sales') })
    expect(res.statusCode).toBe(200)
    expect(res.json().company.pendingDocument).toBeNull()
    expect(prismaMock.contractDocument.findFirst).not.toHaveBeenCalled()
  })
})
