// Rotas da Gestão Addere (plano 013): só o SUPERADMIN entra e o histórico
// guarda nomes de campo (nunca valores). O autoBlockEnabled só é escrito
// quando vem no corpo (plano 017: o switch de Pacotes e regras).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaCallLog, prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const PKG_P10 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

let app: FastifyInstance
let tokens: Record<string, string>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    super: app.jwt.sign({ sub: 'super-1', email: 's@a.com', role: 'SUPERADMIN' }),
    adminA: app.jwt.sign({
      sub: 'admin-a',
      email: 'a@a.com',
      role: 'ADMIN',
      companyId: COMPANY_A,
    }),
    salesA: app.jwt.sign({
      sub: 'sales-a',
      email: 'v@a.com',
      role: 'SALESPERSON',
      companyId: COMPANY_A,
    }),
  }
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue({ active: true })
  prismaMock.userPermission.findMany.mockResolvedValue([])
})

const auth = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })

const p2002 = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  })

const settingsRow = {
  id: 'global',
  overdueBlockDays: 15,
  dueReminderDays: 3,
  autoBlockEnabled: false,
  notifyEmail: null,
  updatedAt: new Date('2026-10-15T12:00:00Z'),
}

const p10 = {
  id: PKG_P10,
  code: 'P10',
  name: 'Pacote 10',
  seats: 10,
  listPriceStandard: null,
  listPriceIntelligence: null,
  listExtraSeatPriceStandard: null,
  listExtraSeatPriceIntelligence: null,
  active: true,
  sortOrder: 10,
  createdAt: new Date('2026-10-15T12:00:00Z'),
  updatedAt: new Date('2026-10-15T12:00:00Z'),
}

function expectNoBillingWrite() {
  expect(prismaMock.$transaction).not.toHaveBeenCalled()
  expect(prismaMock.licensePackage.create).not.toHaveBeenCalled()
  expect(prismaMock.licensePackage.update).not.toHaveBeenCalled()
  expect(prismaMock.billingSettings.update).not.toHaveBeenCalled()
  expect(prismaMock.billingSettings.upsert).not.toHaveBeenCalled()
  expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
}

describe('pacotes e regras — só o SUPERADMIN', () => {
  it.each([
    ['adminA', 'GET', '/admin/billing/packages'],
    ['salesA', 'GET', '/admin/billing/packages'],
    ['adminA', 'PUT', '/admin/billing/settings'],
    ['salesA', 'PUT', '/admin/billing/settings'],
  ] as const)('%s em %s %s → 403', async (who, method, url) => {
    const res = await app.inject({
      method,
      url,
      headers: auth(who),
      payload: method === 'PUT' ? { overdueBlockDays: 20, dueReminderDays: 3 } : undefined,
    })
    expect(res.statusCode).toBe(403)
    expect(prismaMock.licensePackage.findMany).not.toHaveBeenCalled()
    expectNoBillingWrite()
  })

  it('SUPERADMIN lista os pacotes com preço em string de duas casas', async () => {
    prismaMock.licensePackage.findMany.mockResolvedValue([
      { ...p10, listPriceStandard: new Prisma.Decimal('1800') },
    ])
    const res = await app.inject({
      method: 'GET',
      url: '/admin/billing/packages',
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([
      {
        id: PKG_P10,
        code: 'P10',
        name: 'Pacote 10',
        seats: 10,
        listPriceStandard: '1800.00',
        listPriceIntelligence: null,
        listExtraSeatPriceStandard: null,
        listExtraSeatPriceIntelligence: null,
        active: true,
        sortOrder: 10,
      },
    ])
  })
})

describe('POST /admin/billing/packages', () => {
  const body = {
    code: 'P50',
    name: 'Pacote 50',
    seats: 50,
    listPriceStandard: '4000.00',
    listPriceIntelligence: '',
    listExtraSeatPriceStandard: null,
    listExtraSeatPriceIntelligence: null,
    sortOrder: 50,
  }

  it('cria o pacote e grava PACKAGE_CREATED na mesma transação', async () => {
    prismaMock.licensePackage.create.mockImplementation(async ({ data }: { data: object }) => ({
      ...p10,
      ...data,
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }))
    const res = await app.inject({
      method: 'POST',
      url: '/admin/billing/packages',
      headers: auth('super'),
      payload: body,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ code: 'P50', listPriceStandard: '4000.00' })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.licensePackage.create.mock.calls[0][0].data.listPriceIntelligence).toBeNull()
    expect(prismaMock.billingEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'PACKAGE_CREATED',
        companyId: null,
        actorId: 'super-1',
        payload: {
          fields: ['code', 'name', 'seats', 'listPriceStandard', 'sortOrder'],
          packageCode: 'P50',
        },
      },
    })
  })

  it('código repetido → 409 PACKAGE_CODE_TAKEN', async () => {
    prismaMock.licensePackage.create.mockRejectedValue(p2002())
    const res = await app.inject({
      method: 'POST',
      url: '/admin/billing/packages',
      headers: auth('super'),
      payload: body,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({
      message: 'Já existe um pacote com este código',
      code: 'PACKAGE_CODE_TAKEN',
    })
  })

  it('código fora do padrão → 400, sem escrita', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/billing/packages',
      headers: auth('super'),
      payload: { ...body, code: 'p 50' },
    })
    expect(res.statusCode).toBe(400)
    expectNoBillingWrite()
  })
})

describe('PATCH /admin/billing/packages/:id', () => {
  it('grava PACKAGE_UPDATED só com os campos mudados', async () => {
    prismaMock.licensePackage.findUnique.mockResolvedValue({
      ...p10,
      listPriceStandard: new Prisma.Decimal('900.00'),
    })
    prismaMock.licensePackage.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...p10,
      ...data,
    }))
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/billing/packages/${PKG_P10}`,
      headers: auth('super'),
      payload: {
        name: 'Pacote 10',
        seats: 10,
        listPriceStandard: '900',
        listPriceIntelligence: '1200.00',
        listExtraSeatPriceStandard: null,
        listExtraSeatPriceIntelligence: null,
        sortOrder: 10,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.billingEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'PACKAGE_UPDATED',
        companyId: null,
        actorId: 'super-1',
        payload: { fields: ['listPriceIntelligence'], packageCode: 'P10' },
      },
    })
  })

  it('desativar grava PACKAGE_DEACTIVATED', async () => {
    prismaMock.licensePackage.findUnique.mockResolvedValue(p10)
    prismaMock.licensePackage.update.mockResolvedValue({ ...p10, active: false })
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/billing/packages/${PKG_P10}/active`,
      headers: auth('super'),
      payload: { active: false },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().active).toBe(false)
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'PACKAGE_DEACTIVATED',
      payload: { fields: ['active'], packageCode: 'P10' },
    })
  })
})

describe('regras de cobrança', () => {
  it('GET /settings devolve a linha global', async () => {
    prismaMock.billingSettings.findUnique.mockResolvedValue(settingsRow)
    const res = await app.inject({
      method: 'GET',
      url: '/admin/billing/settings',
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      overdueBlockDays: 15,
      dueReminderDays: 3,
      autoBlockEnabled: false,
      notifyEmail: null,
      updatedAt: '2026-10-15T12:00:00.000Z',
    })
  })

  // Até o plano 017 o PUT ignorava o autoBlockEnabled; o 017 põe o switch em
  // Pacotes e regras, e ligar ou desligar fica no histórico com o autor
  it('PUT com autoBlockEnabled grava o valor e o nome do campo no histórico (plano 017)', async () => {
    prismaMock.billingSettings.findUnique.mockResolvedValue(settingsRow)
    prismaMock.billingSettings.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...settingsRow,
      ...data,
    }))
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/billing/settings',
      headers: auth('super'),
      payload: {
        overdueBlockDays: 15,
        dueReminderDays: 3,
        notifyEmail: '',
        autoBlockEnabled: true,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().autoBlockEnabled).toBe(true)
    expect(prismaMock.billingSettings.update.mock.calls[0][0].data.autoBlockEnabled).toBe(true)
    expect(prismaMock.billingEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'SETTINGS_UPDATED',
        companyId: null,
        actorId: 'super-1',
        payload: { fields: ['autoBlockEnabled'] },
      },
    })
  })

  it('PUT sem a chave autoBlockEnabled mantém o valor gravado (plano 017)', async () => {
    prismaMock.billingSettings.findUnique.mockResolvedValue({
      ...settingsRow,
      autoBlockEnabled: true,
    })
    prismaMock.billingSettings.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...settingsRow,
      ...data,
    }))
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/billing/settings',
      headers: auth('super'),
      payload: { overdueBlockDays: 20, dueReminderDays: 3, notifyEmail: null },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.billingSettings.update.mock.calls[0][0].data.autoBlockEnabled).toBe(true)
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data.payload).toEqual({
      fields: ['overdueBlockDays'],
    })
  })

  it('PUT grava SETTINGS_UPDATED com os nomes dos campos', async () => {
    prismaMock.billingSettings.findUnique.mockResolvedValue(settingsRow)
    prismaMock.billingSettings.update.mockImplementation(async ({ data }: { data: object }) => ({
      ...settingsRow,
      ...data,
    }))
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/billing/settings',
      headers: auth('super'),
      payload: { overdueBlockDays: 20, dueReminderDays: 3, notifyEmail: 'Avisos@Addere.com.br' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().notifyEmail).toBe('avisos@addere.com.br')
    expect(prismaMock.billingEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'SETTINGS_UPDATED',
        companyId: null,
        actorId: 'super-1',
        payload: { fields: ['overdueBlockDays', 'notifyEmail'] },
      },
    })
  })

  it('PUT sem mudança não grava evento', async () => {
    prismaMock.billingSettings.findUnique.mockResolvedValue(settingsRow)
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/billing/settings',
      headers: auth('super'),
      payload: { overdueBlockDays: 15, dueReminderDays: 3, notifyEmail: null },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.billingSettings.update).not.toHaveBeenCalled()
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  })
})

// ─── Clientes e contrato em rascunho ─────────────────────────────────────────

const COMPANY_B = '22222222-2222-4222-8222-222222222222'
const PKG_UNLIMITED = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const unlimited = {
  ...p10,
  id: PKG_UNLIMITED,
  code: 'UNLIMITED',
  name: 'Ilimitado',
  seats: null,
  sortOrder: 40,
}

const profileRow = {
  companyId: COMPANY_A,
  legalName: 'Distribuidora Vale Verde Ltda',
  tradeName: 'Vale Verde',
  stateRegistration: null,
  addressStreet: 'Rua das Flores',
  addressNumber: '10',
  addressComplement: null,
  addressDistrict: 'Centro',
  addressCity: 'São Paulo',
  addressState: 'SP',
  addressZip: '01310100',
  legalRepName: 'Maria Souza',
  legalRepCpf: '11144477735',
  legalRepRole: 'Diretora',
  contactName: 'Maria Souza',
  contactEmail: 'maria@vale.com.br',
  contactPhone: null,
  billingContactName: null,
  billingEmail: 'financeiro@vale.com.br',
  billingPhone: null,
  notes: null,
  createdAt: new Date('2026-10-15T12:00:00Z'),
  updatedAt: new Date('2026-10-15T12:00:00Z'),
}

// O mesmo cadastro como o painel manda: CEP com hífen e e-mail com maiúscula
const profileBody = {
  legalName: 'Distribuidora Vale Verde Ltda',
  tradeName: 'Vale Verde',
  stateRegistration: '',
  addressStreet: 'Rua das Flores',
  addressNumber: '10',
  addressComplement: '',
  addressDistrict: 'Centro',
  addressCity: 'São Paulo',
  addressState: 'SP',
  addressZip: '01310-100',
  legalRepName: 'Maria Souza',
  legalRepCpf: '111.444.777-35',
  legalRepRole: 'Diretora',
  contactName: 'Maria Souza',
  contactEmail: 'Maria@Vale.com.br',
  contactPhone: '',
  billingContactName: '',
  billingEmail: 'financeiro@vale.com.br',
  billingPhone: '',
  notes: '',
}

const companyRow = {
  id: COMPANY_A,
  name: 'Distribuidora Vale',
  cnpj: '12.345.678/0001-90',
  idProtheus: '01',
  active: true,
  createdAt: new Date('2026-10-01T12:00:00Z'),
  clientProfile: profileRow,
  contract: null,
}

const clientBody = {
  name: 'Distribuidora Vale',
  cnpj: '12.345.678/0001-90',
  idProtheus: '01',
  profile: profileBody,
}

const termsRow = (over: Record<string, unknown> = {}) => ({
  id: 'terms-1',
  contractId: 'contract-1',
  version: 1,
  status: 'PROPOSED',
  origin: 'CONTRACT',
  proposedEffectiveFrom: null,
  effectiveFrom: null,
  packageId: PKG_P10,
  licenseType: 'STANDARD',
  includedSeats: 10,
  extraSeats: 0,
  packagePrice: new Prisma.Decimal('900.00'),
  extraSeatPrice: new Prisma.Decimal('95.00'),
  reason: null,
  createdById: 'super-1',
  createdAt: new Date('2026-10-15T12:00:00Z'),
  updatedAt: new Date('2026-10-15T12:00:00Z'),
  package: { code: 'P10', name: 'Pacote 10' },
  createdBy: { name: 'Gustavo Costa' },
  ...over,
})

const contractRow = (over: Record<string, unknown> = {}) => ({
  id: 'contract-1',
  companyId: COMPANY_A,
  status: 'DRAFT',
  startDate: null,
  graceMonths: 0,
  firstBilledCompetence: null,
  dueDay: 10,
  overdueBlockDays: null,
  seatGuardVersion: 0,
  createdAt: new Date('2026-10-15T12:00:00Z'),
  updatedAt: new Date('2026-10-15T12:00:00Z'),
  terms: [termsRow()],
  ...over,
})

const draftBody = {
  packageId: PKG_P10,
  licenseType: 'STANDARD',
  includedSeats: 99,
  extraSeats: 0,
  packagePrice: '900.00',
  extraSeatPrice: '95.00',
  graceMonths: 0,
  dueDay: 10,
  overdueBlockDays: null,
  reason: null,
}

function expectNoClientQuery() {
  expect(prismaMock.company.findMany).not.toHaveBeenCalled()
  expect(prismaMock.company.findUnique).not.toHaveBeenCalled()
  expect(prismaMock.company.update).not.toHaveBeenCalled()
  expect(prismaMock.user.groupBy).not.toHaveBeenCalled()
  expect(prismaMock.user.count).not.toHaveBeenCalled()
  expect(prismaMock.clientProfile.upsert).not.toHaveBeenCalled()
  expect(prismaMock.companyContract.findUnique).not.toHaveBeenCalled()
  expect(prismaMock.billingEvent.findMany).not.toHaveBeenCalled()
  expectNoBillingWrite()
}

function expectNoContractWrite() {
  expect(prismaMock.companyContract.create).not.toHaveBeenCalled()
  expect(prismaMock.companyContract.update).not.toHaveBeenCalled()
  expect(prismaMock.contractTerms.create).not.toHaveBeenCalled()
  expect(prismaMock.contractTerms.update).not.toHaveBeenCalled()
  expect(prismaMock.contractTerms.updateMany).not.toHaveBeenCalled()
  expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  // No contrato, só a trava da linha (contract-lock.ts), se houve
  for (const [args] of prismaMock.companyContract.updateMany.mock.calls) {
    expect(args.data).toEqual({ seatGuardVersion: { increment: 1 } })
  }
}

/** A trava da linha do contrato (contract-lock.ts) */
const DRAFT_LOCK = {
  call: 'companyContract.updateMany',
  args: [{ where: { companyId: COMPANY_A }, data: { seatGuardVersion: { increment: 1 } } }],
}

/** As escritas no contrato que não são a trava */
const contractWrites = () =>
  prismaMock.companyContract.updateMany.mock.calls
    .map((c: [{ where: unknown; data: Record<string, unknown> }]) => c[0])
    .filter((a: { data: Record<string, unknown> }) => a.data.seatGuardVersion === undefined)

describe('clientes — só o SUPERADMIN', () => {
  const routes = [
    ['GET', '/admin/billing/clients', undefined],
    ['GET', `/admin/billing/clients/${COMPANY_A}`, undefined],
    ['PUT', `/admin/billing/clients/${COMPANY_A}`, clientBody],
    ['GET', `/admin/billing/clients/${COMPANY_A}/events`, undefined],
    ['PUT', `/admin/billing/clients/${COMPANY_A}/contract`, draftBody],
  ] as const

  it.each(
    (['adminA', 'salesA'] as const).flatMap((who) => routes.map((r) => [who, ...r] as const))
  )('%s em %s %s → 403', async (who, method, url, payload) => {
    const res = await app.inject({ method, url, headers: auth(who), payload })
    expect(res.statusCode).toBe(403)
    expectNoClientQuery()
  })
})

describe('GET /admin/billing/clients', () => {
  it('lista sem dado pessoal, com licenças em uso e o rascunho como proposto', async () => {
    prismaMock.company.findMany.mockResolvedValue([
      {
        id: COMPANY_A,
        name: 'Distribuidora Vale',
        cnpj: '12.345.678/0001-90',
        idProtheus: '01',
        active: true,
        createdAt: new Date('2026-10-01T12:00:00Z'),
        clientProfile: { legalName: 'Distribuidora Vale Verde Ltda', tradeName: 'Vale Verde' },
        contract: {
          status: 'DRAFT',
          graceMonths: 0,
          firstBilledCompetence: null,
          terms: [termsRow({ includedSeats: 20, package: { name: 'Pacote 20' } })],
        },
      },
      {
        id: COMPANY_B,
        name: 'Empresa Demonstração',
        cnpj: '00.000.000/0001-00',
        idProtheus: null,
        active: false,
        createdAt: new Date('2026-01-01T12:00:00Z'),
        clientProfile: null,
        contract: null,
      },
    ])
    prismaMock.user.groupBy.mockResolvedValue([{ companyId: COMPANY_A, _count: { _all: 14 } }])

    const res = await app.inject({
      method: 'GET',
      url: '/admin/billing/clients',
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    const [a, b] = res.json()
    expect(a).toMatchObject({
      id: COMPANY_A,
      legalName: 'Distribuidora Vale Verde Ltda',
      status: 'NO_CONTRACT',
      contractStatus: 'DRAFT',
      current: null,
      proposed: { packageName: 'Pacote 20', licenseType: 'STANDARD' },
      usedSeats: 14,
    })
    // Plano 017: empresa desativada tem o acesso cortado e aparece como bloqueada
    expect(b).toMatchObject({
      id: COMPANY_B,
      status: 'BLOCKED',
      contractStatus: null,
      current: null,
      proposed: null,
      usedSeats: 0,
    })

    // ADMIN não conta licença: só SALESPERSON ativo
    expect(prismaMock.user.groupBy.mock.calls[0][0].where).toEqual({
      role: 'SALESPERSON',
      active: true,
      companyId: { not: null },
    })
    // Nenhum dado pessoal nem credencial, nem na resposta nem no select
    for (const key of ['legalRepCpf', 'contactEmail', 'billingEmail', 'passProtheus']) {
      expect(Object.keys(a)).not.toContain(key)
      expect(res.body).not.toContain(key)
      expect(JSON.stringify(prismaMock.company.findMany.mock.calls[0][0])).not.toContain(key)
    }
  })

  it('termos EFFECTIVE viram o atual, com limite e total mensal', async () => {
    prismaMock.company.findMany.mockResolvedValue([
      {
        ...companyRow,
        clientProfile: null,
        contract: {
          status: 'ACTIVE',
          graceMonths: 0,
          firstBilledCompetence: new Date('2026-09-01T00:00:00Z'),
          terms: [
            termsRow({
              status: 'EFFECTIVE',
              effectiveFrom: new Date('2026-08-15T12:00:00Z'),
              extraSeats: 3,
              packagePrice: new Prisma.Decimal('1800'),
              extraSeatPrice: new Prisma.Decimal('95.5'),
            }),
          ],
        },
      },
    ])
    const res = await app.inject({
      method: 'GET',
      url: '/admin/billing/clients',
      headers: auth('super'),
    })
    expect(res.json()[0]).toMatchObject({
      status: 'CURRENT',
      current: {
        packageName: 'Pacote 10',
        licenseType: 'STANDARD',
        seatLimit: 13,
        monthlyTotal: '2086.50',
      },
    })
  })

  it('situação com fatura vencida e bloqueio reais, numa consulta de faturas só (plano 018)', async () => {
    const COMPANY_C = '33333333-3333-4333-8333-333333333333'
    const activeContract = {
      status: 'ACTIVE',
      graceMonths: 0,
      firstBilledCompetence: new Date('2026-01-01T00:00:00Z'),
      terms: [],
    }
    const row = (id: string, name: string, accessBlockedAt: Date | null) => ({
      ...companyRow,
      id,
      name,
      clientProfile: null,
      accessBlockedAt,
      accessBlockReason: accessBlockedAt ? 'OVERDUE' : null,
      contract: activeContract,
    })
    prismaMock.company.findMany.mockResolvedValue([
      row(COMPANY_A, 'Atacado Ponte Alta', null),
      row(COMPANY_B, 'Casa do Campo', new Date('2026-10-01T12:00:00Z')),
      row(COMPANY_C, 'Mercado Sol', null),
    ])
    // A rota usa o relógio de verdade: uma fatura de 2020 já venceu, uma de 2099 ainda não
    prismaMock.invoice.findMany.mockResolvedValue([
      { companyId: COMPANY_A, dueDate: new Date('2020-01-10T00:00:00Z') },
      { companyId: COMPANY_B, dueDate: new Date('2020-01-10T00:00:00Z') },
      { companyId: COMPANY_C, dueDate: new Date('2099-01-10T00:00:00Z') },
    ])

    const res = await app.inject({
      method: 'GET',
      url: '/admin/billing/clients',
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().map((c: { id: string; status: string }) => [c.id, c.status])).toEqual([
      [COMPANY_A, 'OVERDUE'],
      [COMPANY_B, 'BLOCKED'], // bloqueado vence vencido
      [COMPANY_C, 'CURRENT'],
    ])
    // Uma consulta de faturas para a página inteira, nada por empresa
    expect(prismaMock.invoice.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.invoice.findMany.mock.calls[0][0]).toEqual({
      where: { status: 'OPEN', companyId: { in: [COMPANY_A, COMPANY_B, COMPANY_C] } },
      select: { companyId: true, dueDate: true },
    })
    expect(prismaMock.invoice.findFirst).not.toHaveBeenCalled()
  })
})

describe('GET /admin/billing/clients/:companyId', () => {
  it('cliente inexistente → 404', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/billing/clients/${COMPANY_B}`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().message).toBe('Cliente não encontrado')
  })

  it('ficha com cadastro, rascunho e licenças sem limite', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ ...companyRow, contract: contractRow() })
    prismaMock.user.count.mockResolvedValue(14)
    const res = await app.inject({
      method: 'GET',
      url: `/admin/billing/clients/${COMPANY_A}`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.profile.legalRepCpf).toBe('11144477735')
    expect(body.profile).not.toHaveProperty('createdAt')
    expect(body.status).toBe('NO_CONTRACT')
    expect(body.usedSeats).toBe(14)
    expect(body.seatLimit).toBeNull()
    expect(body.contract.terms[0]).toMatchObject({
      version: 1,
      status: 'PROPOSED',
      packageCode: 'P10',
      packagePrice: '900.00',
      monthlyTotal: '900.00',
      createdByName: 'Gustavo Costa',
    })
    expect(JSON.stringify(prismaMock.company.findUnique.mock.calls[0][0])).not.toContain(
      'passProtheus'
    )
  })

  it('fatura em aberto vencida deixa a ficha em "vencido" (plano 018)', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      ...companyRow,
      contract: contractRow({
        status: 'ACTIVE',
        firstBilledCompetence: new Date('2026-01-01T00:00:00Z'),
      }),
    })
    prismaMock.invoice.findMany.mockResolvedValue([
      { companyId: COMPANY_A, dueDate: new Date('2020-01-10T00:00:00Z') },
    ])
    const res = await app.inject({
      method: 'GET',
      url: `/admin/billing/clients/${COMPANY_A}`,
      headers: auth('super'),
    })
    expect(res.json().status).toBe('OVERDUE')
    expect(prismaMock.invoice.findMany.mock.calls[0][0].where).toEqual({
      status: 'OPEN',
      companyId: { in: [COMPANY_A] },
    })
  })
})

describe('PUT /admin/billing/clients/:companyId', () => {
  beforeEach(() => {
    prismaMock.company.findUnique.mockResolvedValue(companyRow)
  })

  it('trocar só o CPF grava o nome do campo, nunca os dígitos', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/admin/billing/clients/${COMPANY_A}`,
      headers: auth('super'),
      payload: { ...clientBody, profile: { ...profileBody, legalRepCpf: '529.982.247-25' } },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    // Gravado só com dígitos
    expect(prismaMock.clientProfile.upsert.mock.calls[0][0].update.legalRepCpf).toBe('52998224725')
    expect(prismaMock.billingEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'CLIENT_UPDATED',
        companyId: COMPANY_A,
        actorId: 'super-1',
        payload: { fields: ['legalRepCpf'] },
      },
    })
    const eventCall = JSON.stringify(prismaMock.billingEvent.create.mock.calls)
    for (const digits of ['52998224725', '529.982.247-25', '11144477735']) {
      expect(eventCall).not.toContain(digits)
    }
  })

  it('os mesmos valores não gravam evento', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/admin/billing/clients/${COMPANY_A}`,
      headers: auth('super'),
      payload: clientBody,
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  })

  it('empresa sem cadastro ganha o cadastro pelo upsert', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ ...companyRow, clientProfile: null })
    const res = await app.inject({
      method: 'PUT',
      url: `/admin/billing/clients/${COMPANY_A}`,
      headers: auth('super'),
      payload: clientBody,
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.clientProfile.upsert.mock.calls[0][0].create).toMatchObject({
      companyId: COMPANY_A,
      legalName: 'Distribuidora Vale Verde Ltda',
      addressZip: '01310100',
      contactEmail: 'maria@vale.com.br',
      notes: null,
    })
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data.payload.fields).toContain(
      'legalRepCpf'
    )
  })

  it('CNPJ repetido → 409 CNPJ_TAKEN', async () => {
    prismaMock.company.update.mockRejectedValue(p2002())
    const res = await app.inject({
      method: 'PUT',
      url: `/admin/billing/clients/${COMPANY_A}`,
      headers: auth('super'),
      payload: { ...clientBody, cnpj: '99.999.999/0001-99' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({
      message: 'Já existe uma empresa com este CNPJ',
      code: 'CNPJ_TAKEN',
    })
  })

  it('CPF inválido → 400, sem escrita', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/admin/billing/clients/${COMPANY_A}`,
      headers: auth('super'),
      payload: { ...clientBody, profile: { ...profileBody, legalRepCpf: '111.444.777-36' } },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toBe('CPF inválido')
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})

describe('GET /admin/billing/clients/:companyId/events', () => {
  it('devolve os nomes dos campos e o autor', async () => {
    prismaMock.billingEvent.findMany.mockResolvedValue([
      {
        id: 'ev-1',
        type: 'CONTRACT_DRAFT_UPDATED',
        companyId: COMPANY_A,
        actorId: 'super-1',
        payload: { fields: ['packagePrice', 'dueDay'], termsVersion: 1 },
        dedupeKey: null,
        createdAt: new Date('2026-10-15T17:32:00Z'),
        actor: { name: 'Gustavo Costa' },
      },
      {
        id: 'ev-2',
        type: 'CLIENT_CREATED',
        companyId: COMPANY_A,
        actorId: null,
        payload: {},
        dedupeKey: null,
        createdAt: new Date('2026-10-15T17:10:00Z'),
        actor: null,
      },
    ])
    const res = await app.inject({
      method: 'GET',
      url: `/admin/billing/clients/${COMPANY_A}/events`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([
      {
        id: 'ev-1',
        type: 'CONTRACT_DRAFT_UPDATED',
        actorName: 'Gustavo Costa',
        fields: ['packagePrice', 'dueDay'],
        createdAt: '2026-10-15T17:32:00.000Z',
      },
      {
        id: 'ev-2',
        type: 'CLIENT_CREATED',
        actorName: null,
        fields: [],
        createdAt: '2026-10-15T17:10:00.000Z',
      },
    ])
    expect(prismaMock.billingEvent.findMany.mock.calls[0][0]).toMatchObject({
      where: { companyId: COMPANY_A },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
  })
})

describe('PUT /admin/billing/clients/:companyId/contract', () => {
  const url = `/admin/billing/clients/${COMPANY_A}/contract`

  beforeEach(() => {
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A })
    prismaMock.licensePackage.findUnique.mockResolvedValue(p10)
    prismaMock.companyContract.create.mockResolvedValue({ id: 'contract-1' })
  })

  it('sem contrato: cria o DRAFT e os termos v1 PROPOSED; a quantidade vem do pacote', async () => {
    prismaMock.companyContract.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(contractRow())
    const res = await app.inject({ method: 'PUT', url, headers: auth('super'), payload: draftBody })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.companyContract.create).toHaveBeenCalledWith({
      data: {
        companyId: COMPANY_A,
        status: 'DRAFT',
        graceMonths: 0,
        dueDay: 10,
        overdueBlockDays: null,
      },
    })
    expect(prismaMock.contractTerms.create).toHaveBeenCalledWith({
      data: {
        contractId: 'contract-1',
        version: 1,
        status: 'PROPOSED',
        origin: 'CONTRACT',
        createdById: 'super-1',
        packageId: PKG_P10,
        licenseType: 'STANDARD',
        includedSeats: 10, // 99 no corpo, ignorado: o P10 tem 10
        extraSeats: 0,
        packagePrice: '900.00',
        extraSeatPrice: '95.00',
        reason: null,
      },
    })
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'CONTRACT_DRAFT_CREATED',
      companyId: COMPANY_A,
      actorId: 'super-1',
      payload: { termsVersion: 1 },
    })
    expect(res.json()).toMatchObject({
      id: 'contract-1',
      status: 'DRAFT',
      terms: [{ version: 1, status: 'PROPOSED', includedSeats: 10, monthlyTotal: '900.00' }],
    })
  })

  it('Ilimitado sem quantidade → 422 INCLUDED_SEATS_REQUIRED', async () => {
    prismaMock.licensePackage.findUnique.mockResolvedValue(unlimited)
    const res = await app.inject({
      method: 'PUT',
      url,
      headers: auth('super'),
      payload: { ...draftBody, packageId: PKG_UNLIMITED, includedSeats: undefined },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('INCLUDED_SEATS_REQUIRED')
    expectNoContractWrite()
  })

  it('Ilimitado com 100 licenças grava 100', async () => {
    prismaMock.licensePackage.findUnique.mockResolvedValue(unlimited)
    prismaMock.companyContract.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(contractRow())
    const res = await app.inject({
      method: 'PUT',
      url,
      headers: auth('super'),
      payload: { ...draftBody, packageId: PKG_UNLIMITED, includedSeats: 100 },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.contractTerms.create.mock.calls[0][0].data.includedSeats).toBe(100)
  })

  it('total mensal acima do Decimal(14,2) → 422 AMOUNT_TOO_LARGE, sem escrita', async () => {
    const res = await app.inject({
      method: 'PUT',
      url,
      headers: auth('super'),
      payload: {
        ...draftBody,
        extraSeats: 10000,
        packagePrice: '999999999999.99',
        extraSeatPrice: '999999999999.99',
      },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().code).toBe('AMOUNT_TOO_LARGE')
    expectNoContractWrite()
  })

  it('pacote desativado → 422 PACKAGE_INACTIVE', async () => {
    prismaMock.licensePackage.findUnique.mockResolvedValue({ ...p10, active: false })
    const res = await app.inject({ method: 'PUT', url, headers: auth('super'), payload: draftBody })
    expect(res.statusCode).toBe(422)
    expect(res.json()).toEqual({
      message: 'Pacote desativado: escolha outro',
      code: 'PACKAGE_INACTIVE',
    })
    expectNoContractWrite()
  })

  it('contrato fora do rascunho → 409 CONTRACT_NOT_DRAFT, sem escrita', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue(
      contractRow({ status: 'ACTIVE', terms: [] })
    )
    const res = await app.inject({ method: 'PUT', url, headers: auth('super'), payload: draftBody })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('CONTRACT_NOT_DRAFT')
    expectNoContractWrite()
  })

  it('aguardando aceite (plano 014): cancela o documento enviado e edita como rascunho', async () => {
    prismaMock.companyContract.findUnique
      .mockResolvedValueOnce(contractRow({ status: 'PENDING_ACCEPTANCE' }))
      .mockResolvedValueOnce(contractRow())
    prismaMock.contractDocument.findMany.mockResolvedValue([
      { id: 'doc-1', kind: 'CONTRACT', companyId: COMPANY_A },
    ])
    prismaMock.contractDocument.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.companyContract.updateMany.mockResolvedValue({ count: 1 })
    const res = await app.inject({
      method: 'PUT',
      url,
      headers: auth('super'),
      payload: { ...draftBody, dueDay: 5 },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaCallLog({ writesOnly: true })[0]).toEqual(DRAFT_LOCK)
    expect(prismaMock.contractDocument.updateMany.mock.calls[0][0]).toMatchObject({
      where: { contractId: 'contract-1', status: 'SENT' },
      data: { status: 'CANCELLED', cancelReason: 'Rascunho alterado depois do envio' },
    })
    expect(prismaMock.companyContract.updateMany).toHaveBeenCalledWith({
      where: { id: 'contract-1', status: 'PENDING_ACCEPTANCE' },
      data: { status: 'DRAFT' },
    })
    // Segue o fluxo do rascunho: grava a mudança, com o cancelamento antes, e
    // só com o contrato em DRAFT no where
    expect(contractWrites().at(-1)).toMatchObject({
      where: { id: 'contract-1', status: 'DRAFT' },
      data: { dueDay: 5 },
    })
    expect(
      prismaMock.billingEvent.create.mock.calls.map(
        (c: [{ data: { type: string } }]) => c[0].data.type
      )
    ).toEqual(['DOCUMENT_CANCELLED', 'CONTRACT_DRAFT_UPDATED'])
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['dueDay 0', { dueDay: 0 }],
    ['dueDay 11', { dueDay: 11 }],
    ['graceMonths -1', { graceMonths: -1 }],
    ['graceMonths 13', { graceMonths: 13 }],
  ])('%s → 400', async (_label, over) => {
    const res = await app.inject({
      method: 'PUT',
      url,
      headers: auth('super'),
      payload: { ...draftBody, ...over },
    })
    expect(res.statusCode).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it('rascunho existente: edita os mesmos termos e lista só os campos mudados', async () => {
    prismaMock.companyContract.findUnique
      .mockResolvedValueOnce(contractRow())
      .mockResolvedValueOnce(contractRow())
    prismaMock.companyContract.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.contractTerms.updateMany.mockResolvedValue({ count: 1 })
    const res = await app.inject({
      method: 'PUT',
      url,
      headers: auth('super'),
      // '95' é o mesmo valor do banco; mudam o valor do pacote e o vencimento
      payload: { ...draftBody, packagePrice: '950', extraSeatPrice: '95', dueDay: 5 },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.contractTerms.create).not.toHaveBeenCalled()
    // Só termos ainda PROPOSED: os que já valem nunca são reescritos
    expect(prismaMock.contractTerms.updateMany.mock.calls[0][0].where).toEqual({
      id: 'terms-1',
      status: 'PROPOSED',
    })
    expect(contractWrites()[0]).toMatchObject({
      where: { id: 'contract-1', status: 'DRAFT' },
      data: { dueDay: 5 },
    })
    expect(prismaMock.billingEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'CONTRACT_DRAFT_UPDATED',
        companyId: COMPANY_A,
        actorId: 'super-1',
        payload: { fields: ['dueDay', 'packagePrice'], termsVersion: 1 },
      },
    })
  })

  it('rascunho sem mudança não grava evento', async () => {
    prismaMock.companyContract.findUnique
      .mockResolvedValueOnce(contractRow())
      .mockResolvedValueOnce(contractRow())
    const res = await app.inject({ method: 'PUT', url, headers: auth('super'), payload: draftBody })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.contractTerms.updateMany).not.toHaveBeenCalled()
    expect(contractWrites()).toEqual([])
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  })

  it('a trava é a primeira escrita, e o contrato é lido depois dela', async () => {
    prismaMock.companyContract.findUnique
      .mockResolvedValueOnce(contractRow())
      .mockResolvedValueOnce(contractRow())
    prismaMock.companyContract.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.contractTerms.updateMany.mockResolvedValue({ count: 1 })
    const res = await app.inject({
      method: 'PUT',
      url,
      headers: auth('super'),
      payload: { ...draftBody, packagePrice: '950.00' },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaCallLog({ writesOnly: true })[0]).toEqual(DRAFT_LOCK)
    const calls = prismaCallLog()
    const lockAt = calls.findIndex((c) => c.call === 'companyContract.updateMany')
    const readAt = calls.findIndex((c) => c.call === 'companyContract.findUnique')
    expect(readAt).toBeGreaterThan(lockAt)
  })

  it('o aceite confirmou enquanto a edição esperava a trava: ACTIVE na releitura → 409', async () => {
    prismaMock.companyContract.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.companyContract.findUnique.mockResolvedValue(
      contractRow({ status: 'ACTIVE', terms: [] })
    )
    const res = await app.inject({
      method: 'PUT',
      url,
      headers: auth('super'),
      payload: { ...draftBody, packagePrice: '9999.00' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('CONTRACT_NOT_DRAFT')
    expect(prismaCallLog({ writesOnly: true })).toEqual([DRAFT_LOCK])
  })

  it('termos que viraram EFFECTIVE entre a leitura e a escrita → 409 CONTRACT_NOT_DRAFT', async () => {
    // A leitura ainda viu o PROPOSED; o UPDATE com PROPOSED no where não acha a
    // linha: count 0. Nunca 200 com os termos aceitos reescritos
    prismaMock.companyContract.findUnique.mockResolvedValue(contractRow())
    prismaMock.companyContract.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.contractTerms.updateMany.mockResolvedValue({ count: 0 })
    const res = await app.inject({
      method: 'PUT',
      url,
      headers: auth('super'),
      payload: { ...draftBody, packagePrice: '9999.00' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('CONTRACT_NOT_DRAFT')
    expect(prismaMock.contractTerms.updateMany.mock.calls[0][0].where).toEqual({
      id: 'terms-1',
      status: 'PROPOSED',
    })
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  })

  it('"Com Inteligência" no rascunho não mexe na empresa', async () => {
    prismaMock.companyContract.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(contractRow())
    const res = await app.inject({
      method: 'PUT',
      url,
      headers: auth('super'),
      payload: { ...draftBody, licenseType: 'INTELLIGENCE' },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.contractTerms.create.mock.calls[0][0].data.licenseType).toBe('INTELLIGENCE')
    expect(prismaMock.company.update).not.toHaveBeenCalled()
  })
})

// ─── POST /companies com cadastro (plano 013) ────────────────────────────────

describe('POST /companies com cadastro', () => {
  const created = {
    id: COMPANY_A,
    name: 'Distribuidora Vale',
    cnpj: '12.345.678/0001-90',
    idProtheus: '01',
    active: true,
  }

  beforeEach(() => {
    prismaMock.company.create.mockResolvedValue(created)
  })

  it('com cadastro: empresa, cadastro e CLIENT_CREATED na mesma transação', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: auth('super'),
      payload: clientBody,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json()).toMatchObject({ id: COMPANY_A, name: 'Distribuidora Vale' })
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.company.create).toHaveBeenCalledWith({
      data: { name: 'Distribuidora Vale', cnpj: '12.345.678/0001-90', idProtheus: '01' },
    })
    expect(prismaMock.clientProfile.create.mock.calls[0][0].data).toMatchObject({
      companyId: COMPANY_A,
      legalName: 'Distribuidora Vale Verde Ltda',
      legalRepCpf: '11144477735',
      addressZip: '01310100',
    })
    const event = prismaMock.billingEvent.create.mock.calls[0][0].data
    expect(event).toMatchObject({
      type: 'CLIENT_CREATED',
      companyId: COMPANY_A,
      actorId: 'super-1',
    })
    expect(event.payload.fields).toEqual(
      expect.arrayContaining(['legalName', 'legalRepCpf', 'billingEmail'])
    )
    expect(event.payload.fields).not.toContain('notes')
    expect(JSON.stringify(event)).not.toContain('11144477735')
  })

  it('sem cadastro: 201 como antes, sem cadastro e com o evento', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: auth('super'),
      payload: { name: 'Nova', cnpj: '00.000.000/0001-00' },
    })
    expect(res.statusCode).toBe(201)
    expect(prismaMock.company.create).toHaveBeenCalledWith({
      data: { name: 'Nova', cnpj: '00.000.000/0001-00' },
    })
    expect(prismaMock.clientProfile.create).not.toHaveBeenCalled()
    expect(prismaMock.billingEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'CLIENT_CREATED',
        companyId: COMPANY_A,
        actorId: 'super-1',
        payload: { fields: [] },
      },
    })
  })

  it('CNPJ repetido → 409 CNPJ_TAKEN', async () => {
    prismaMock.company.create.mockRejectedValue(p2002())
    const res = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: auth('super'),
      payload: clientBody,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({
      message: 'Já existe uma empresa com este CNPJ',
      code: 'CNPJ_TAKEN',
    })
  })

  it('CPF inválido no cadastro → 400, sem escrita', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: auth('super'),
      payload: { ...clientBody, profile: { ...profileBody, legalRepCpf: '111.111.111-11' } },
    })
    expect(res.statusCode).toBe(400)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.company.create).not.toHaveBeenCalled()
    expect(prismaMock.clientProfile.create).not.toHaveBeenCalled()
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  })

  it('ADMIN → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/companies',
      headers: auth('adminA'),
      payload: clientBody,
    })
    expect(res.statusCode).toBe(403)
    expect(prismaMock.company.create).not.toHaveBeenCalled()
  })
})
