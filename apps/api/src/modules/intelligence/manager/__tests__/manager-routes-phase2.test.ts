// Rotas do gerente — fase 2: mapa da equipe (E20) e "Onde estou perdendo" (E21).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { buildApp } from '../../../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const companyRow = { id: COMPANY_A, name: 'Empresa A', intelligenceEnabled: true }

const PERMISSIONS_BY_SUB: Record<string, string[]> = {
  'admin-a': ['intel.admin'],
  'manager-a': ['intel.manager'],
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
  prismaMock.user.findMany.mockResolvedValue([])
})

const auth = (sub: string) => ({ authorization: `Bearer ${tokens[sub]}` })

describe('GET /intel/manager/team-map', () => {
  it('vendedor sem intel.* → 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/intel/manager/team-map', headers: auth('sales-a') })
    expect(res.statusCode).toBe(403)
  })

  it('empresa sem vendedores devolve lista vazia com a data pedida', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/team-map?date=2026-09-14',
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ date: '2026-09-14', sellers: [] })
  })

  it('paradas com coordenada viram pino e o check-in marca visited', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u1', name: 'Ana', idVendProt: 'V1' }])
    prismaMock.visitPlan.findMany.mockResolvedValue([
      {
        vendorCode: 'V1',
        grouping: 'Campinas',
        items: [
          { id: 'i1', position: 1, customerCode: 'A', loja: '01', statusAtTime: 'LATE', lat: -22.9, lng: -47.06, plannedTime: '08:00', removedAt: null },
          { id: 'i2', position: 2, customerCode: 'B', loja: '01', statusAtTime: 'NEW', lat: null, lng: null, plannedTime: null, removedAt: null },
        ],
      },
    ])
    prismaMock.visit.findMany.mockResolvedValue([
      { vendorCode: 'V1', planItemId: 'i1', customerCode: 'A', loja: '01', arrivedAt: new Date('2026-09-14T12:00:00Z'), lat: -22.9, lng: -47.06 },
    ])
    prismaMock.customer.findMany.mockResolvedValue([{ protheusCode: 'A', loja: '01', name: 'Cliente A' }])

    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/team-map?date=2026-09-14',
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(200)
    const seller = res.json().sellers[0]
    expect(seller.stops).toHaveLength(1)
    expect(seller.stops[0]).toMatchObject({ customerName: 'Cliente A', visited: true })
    expect(seller.withoutPin).toBe(1)
    expect(seller.lastCheckIn.customerName).toBe('Cliente A')
  })
})

describe('GET /intel/manager/losses', () => {
  it('vendedor sem intel.* → 403; gerente pedindo vendedor de outra equipe → 403', async () => {
    const forbidden = await app.inject({ method: 'GET', url: '/intel/manager/losses', headers: auth('sales-a') })
    expect(forbidden.statusCode).toBe(403)

    prismaMock.user.findFirst.mockResolvedValue({ id: 'u9', managerId: 'manager-b' })
    const other = await app.inject({
      method: 'GET',
      url: '/intel/manager/losses?vendorCode=V9',
      headers: auth('manager-a'),
    })
    expect(other.statusCode).toBe(403)
  })

  it('gerente que vende consulta as próprias perdas pelo código dele', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: 'manager-a', managerId: null })
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/losses?vendorCode=123',
      headers: auth('manager-a'),
    })
    expect(res.statusCode).toBe(200)
  })

  it('sem vendas devolve relatório vazio com o período certo', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ idVendProt: 'V1' }])
    prismaMock.customer.findMany.mockResolvedValue([
      { protheusCode: 'A', loja: '01', name: 'Cliente A', vendorCode: 'V1' },
    ])
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/losses?date=2026-09-15&baselineMonths=3',
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.period).toEqual({ fromYmd: '20260901', toYmd: '20260915', baselineMonths: 3 })
    expect(body.customers).toEqual([])
    expect(body.text).toBeNull()
  })

  it('cliente que parou aparece com a perda, o status e se já está no plano', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ idVendProt: 'V1' }])
    prismaMock.customer.findMany.mockResolvedValue([
      { protheusCode: 'A', loja: '01', name: 'Cliente A', vendorCode: 'V1' },
    ])
    prismaMock.salesItem.findMany.mockResolvedValue(
      ['2026-06-10', '2026-07-10', '2026-08-10'].map((day) => ({
        customerCode: 'A', loja: '01', productCode: 'P1', productDesc: 'Produto 1',
        date: new Date(`${day}T00:00:00Z`), amount: 300,
      }))
    )
    prismaMock.customerSignal.findMany.mockResolvedValue([{ customerCode: 'A', loja: '01', status: 'AT_RISK' }])
    prismaMock.visitPlanItem.findMany.mockResolvedValue([{ customerCode: 'A', loja: '01' }])

    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/losses?date=2026-09-30&baselineMonths=3',
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.customers).toHaveLength(1)
    expect(body.customers[0]).toMatchObject({ customerName: 'Cliente A', status: 'AT_RISK', inPlanToday: true })
    expect(Number(body.customers[0].diffAmount)).toBeLessThan(0)
    const stopped = body.components.find((c: { kind: string }) => c.kind === 'STOPPED')
    expect(stopped.count).toBe(1)
  })
})
