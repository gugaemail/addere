// Testes de integração das rotas do gerente (E8) — portões de acesso, recorte
// por tenant e as validações do "pôr no plano".
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { buildApp } from '../../../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'

const companyRow = { id: COMPANY_A, name: 'Empresa A', intelligenceEnabled: true }

const PERMISSIONS_BY_SUB: Record<string, string[]> = {
  'admin-a': ['intel.admin'],
  'manager-a': ['intel.manager'],
  'manager-b': ['intel.manager'],
  'sales-a': [],
}

let app: FastifyInstance
let tokens: Record<string, string>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  const sign = (sub: string, role: string) =>
    app.jwt.sign({ sub, email: `${sub}@a.com`, role, companyId: COMPANY_A })
  tokens = {
    'admin-a': sign('admin-a', 'ADMIN'),
    'manager-a': sign('manager-a', 'ADMIN'),
    'manager-b': sign('manager-b', 'ADMIN'),
    'sales-a': sign('sales-a', 'SALESPERSON'),
  }
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue({ active: true })
  prismaMock.userPermission.findMany.mockImplementation(
    async (args: { where: { userId: string } }) =>
      (PERMISSIONS_BY_SUB[args.where.userId] ?? []).map((key) => ({ permission: { key } }))
  )
  prismaMock.company.findUnique.mockResolvedValue({ ...companyRow })
  prismaMock.user.count.mockResolvedValue(1)
  prismaMock.user.findMany.mockResolvedValue([])
})

const auth = (sub: string) => ({ authorization: `Bearer ${tokens[sub]}` })

describe('acesso', () => {
  it('sem token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/intel/manager/team' })
    expect(res.statusCode).toBe(401)
  })

  it('vendedor sem intel.* → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/team',
      headers: auth('sales-a'),
    })
    expect(res.statusCode).toBe(403)
  })

  it('gerente e admin entram', async () => {
    for (const sub of ['manager-a', 'admin-a']) {
      const res = await app.inject({
        method: 'GET',
        url: '/intel/manager/team',
        headers: auth(sub),
      })
      expect(res.statusCode, sub).toBe(200)
    }
  })

  it('ADMIN da empresa A pedindo a empresa B → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/intel/manager/team?companyId=${COMPANY_B}`,
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /intel/manager/team', () => {
  it('empresa sem vendedores devolve relatório vazio', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/team?date=2026-08-25&range=day',
      headers: auth('manager-a'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.totals.sellers).toBe(0)
    expect(body.range).toEqual({ fromYmd: '20260825', toYmd: '20260825' })
  })

  it('range week devolve a semana da data pedida', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/team?date=2026-08-25&range=week',
      headers: auth('manager-a'),
    })
    expect(res.json().range).toEqual({ fromYmd: '20260824', toYmd: '20260830' })
  })

  it('data em formato inválido → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/team?date=25/08/2026',
      headers: auth('manager-a'),
    })
    expect(res.statusCode).toBe(400)
  })

  it('com dois gerentes, a consulta filtra pelo managerId de quem pediu', async () => {
    prismaMock.user.count.mockResolvedValue(2)
    await app.inject({ method: 'GET', url: '/intel/manager/team', headers: auth('manager-a') })

    const where = prismaMock.user.findMany.mock.calls[0][0].where
    expect(where.managerId).toBe('manager-a')
  })

  it('com um gerente só, não filtra por managerId', async () => {
    prismaMock.user.count.mockResolvedValue(1)
    await app.inject({ method: 'GET', url: '/intel/manager/team', headers: auth('manager-a') })

    expect(prismaMock.user.findMany.mock.calls[0][0].where.managerId).toBeUndefined()
  })
})

describe('GET /intel/manager/pilot-metrics', () => {
  it('período invertido → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/pilot-metrics?from=2026-08-31&to=2026-08-01',
      headers: auth('manager-a'),
    })
    expect(res.statusCode).toBe(400)
  })

  it('sem from/to → 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/pilot-metrics',
      headers: auth('manager-a'),
    })
    expect(res.statusCode).toBe(400)
  })

  it('devolve as três métricas', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/pilot-metrics?from=2026-08-01&to=2026-08-31',
      headers: auth('manager-a'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toHaveProperty('portfolioPositivation')
    expect(body).toHaveProperty('suggestionConversion')
    expect(body).toHaveProperty('atRiskRecovery')
    expect(body.conversionDays).toBe(7)
  })
})

describe('POST /intel/manager/plan-items', () => {
  const payload = { vendorCode: 'V1', customerCode: 'C1', loja: '01', date: '2026-08-25' }

  it('vendedor inexistente na empresa → 404', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null)
    const res = await app.inject({
      method: 'POST',
      url: '/intel/manager/plan-items',
      headers: auth('manager-a'),
      payload,
    })
    expect(res.statusCode).toBe(404)
  })

  it('cliente inexistente na empresa → 404', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1', managerId: 'manager-a' })
    prismaMock.customer.findFirst.mockResolvedValue(null)
    const res = await app.inject({
      method: 'POST',
      url: '/intel/manager/plan-items',
      headers: auth('manager-a'),
      payload,
    })
    expect(res.statusCode).toBe(404)
  })

  it('gerente com recorte próprio não mexe no plano de outra equipe → 403', async () => {
    prismaMock.user.count.mockResolvedValue(2)
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1', managerId: 'manager-b' })
    const res = await app.inject({
      method: 'POST',
      url: '/intel/manager/plan-items',
      headers: auth('manager-a'),
      payload,
    })
    expect(res.statusCode).toBe(403)
  })

  it('cria o item no fim da fila, com origem MANAGER e o status do sinal', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1', managerId: 'manager-a' })
    prismaMock.customer.findFirst.mockResolvedValue({ id: 'c1' })
    prismaMock.visitPlan.upsert.mockResolvedValue({ id: 'plan-1' })
    prismaMock.visitPlanItem.findFirst.mockResolvedValue(null)
    prismaMock.customerSignal.findUnique.mockResolvedValue({ status: 'AT_RISK', scoreTotal: 9.5 })
    prismaMock.visitPlanItem.create.mockResolvedValue({ id: 'item-1' })

    const res = await app.inject({
      method: 'POST',
      url: '/intel/manager/plan-items',
      headers: auth('manager-a'),
      payload,
    })

    expect(res.statusCode).toBe(201)
    const data = prismaMock.visitPlanItem.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      planId: 'plan-1',
      position: 1,
      origin: 'MANAGER',
      statusAtTime: 'AT_RISK',
    })
  })

  it('sem sinal calculado, o item entra como NEW em vez de quebrar', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1', managerId: 'manager-a' })
    prismaMock.customer.findFirst.mockResolvedValue({ id: 'c1' })
    prismaMock.visitPlan.upsert.mockResolvedValue({ id: 'plan-1' })
    prismaMock.visitPlanItem.findFirst.mockResolvedValue(null)
    prismaMock.customerSignal.findUnique.mockResolvedValue(null)
    prismaMock.visitPlanItem.create.mockResolvedValue({ id: 'item-1' })

    const res = await app.inject({
      method: 'POST',
      url: '/intel/manager/plan-items',
      headers: auth('manager-a'),
      payload,
    })

    expect(res.statusCode).toBe(201)
    expect(prismaMock.visitPlanItem.create.mock.calls[0][0].data.statusAtTime).toBe('NEW')
  })

  it('repetir o pedido devolve o item existente e desfaz a remoção', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'u1', managerId: 'manager-a' })
    prismaMock.customer.findFirst.mockResolvedValue({ id: 'c1' })
    prismaMock.visitPlan.upsert.mockResolvedValue({ id: 'plan-1' })
    prismaMock.visitPlanItem.findFirst.mockResolvedValue({ id: 'item-1', removedAt: new Date() })
    prismaMock.visitPlanItem.update.mockResolvedValue({ id: 'item-1', removedAt: null })

    const res = await app.inject({
      method: 'POST',
      url: '/intel/manager/plan-items',
      headers: auth('manager-a'),
      payload,
    })

    expect(res.statusCode).toBe(200)
    expect(prismaMock.visitPlanItem.update.mock.calls[0][0].data).toMatchObject({
      removedAt: null,
      origin: 'MANAGER',
    })
    expect(prismaMock.visitPlanItem.create).not.toHaveBeenCalled()
  })

  it('campo desconhecido no corpo → 400 (não passa despercebido)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/intel/manager/plan-items',
      headers: auth('manager-a'),
      payload: { ...payload, enabled: true },
    })
    expect(res.statusCode).toBe(400)
  })
})
