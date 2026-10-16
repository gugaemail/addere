// Rotas da Gestão Addere (plano 013): só o SUPERADMIN entra, o histórico
// guarda nomes de campo (nunca valores) e autoBlockEnabled nunca é escrito.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
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

  it('PUT ignora autoBlockEnabled do corpo: o update nunca o recebe', async () => {
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
        overdueBlockDays: 20,
        dueReminderDays: 3,
        notifyEmail: '',
        autoBlockEnabled: true,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().autoBlockEnabled).toBe(false)
    expect(prismaMock.billingSettings.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.billingSettings.update.mock.calls[0][0].data).not.toHaveProperty(
      'autoBlockEnabled'
    )
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
