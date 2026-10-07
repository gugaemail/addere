// Histórico de visitas da equipe do gerente (plano 003) — GET /intel/manager/visits.
// Este é o teste mais importante do plano: sem ele, a rota é um vazamento de
// carteira esperando acontecer. vendorCode é filtro DENTRO do escopo do
// gerente, nunca ampliação dele — código fora da equipe → 403, nunca lista
// vazia.
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
  prismaMock.user.findMany.mockResolvedValue([])
})

const auth = (sub: string) => ({ authorization: `Bearer ${tokens[sub]}` })

// Visitas "no banco" de dois vendedores de equipes diferentes — o mock
// simula o filtro do `where.vendorCode` (string ou {in:[...]}), para provar
// que é a query montada a partir de loadSellers, e não um acaso do mock, que
// isola por equipe (mesma técnica de app/__tests__/app-routes.test.ts).
function mockVisitsFilteredByVendorCode(
  all: Array<{ vendorCode: string } & Record<string, unknown>>
): void {
  prismaMock.visit.findMany.mockImplementation(
    async (args: { where: { vendorCode: string | { in: string[] } } }) => {
      const want = args.where.vendorCode
      const codes = typeof want === 'string' ? [want] : want.in
      return all.filter((v) => codes.includes(v.vendorCode))
    }
  )
}

const visitRow = (over: Record<string, unknown>) => ({
  id: 'v1',
  customerCode: 'A',
  loja: '01',
  arrivedAt: new Date('2026-08-21T14:00:00.000Z'),
  leftAt: new Date('2026-08-21T14:20:00.000Z'),
  planItemId: null,
  result: 'ORDER',
  noOrderReason: null,
  orderId: null,
  source: 'CHECKIN',
  ...over,
})

describe('GET /intel/manager/visits', () => {
  it('vendedor sem intel.* → 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/intel/manager/visits', headers: auth('sales-a') })
    expect(res.statusCode).toBe(403)
  })

  it('gerente A recebe só visitas de vendedores com managerId = A', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u-ana', name: 'Ana', idVendProt: 'V1', managerId: 'manager-a' },
    ])
    mockVisitsFilteredByVendorCode([
      visitRow({ id: 'v1', vendorCode: 'V1', customerCode: 'A' }),
      visitRow({ id: 'v9', vendorCode: 'V9', customerCode: 'B' }), // de outro gerente
    ])
    prismaMock.customer.findMany.mockResolvedValue([{ protheusCode: 'A', loja: '01', name: 'Cliente A' }])

    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/visits?from=2026-08-01&to=2026-08-31',
      headers: auth('manager-a'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].customerCode).toBe('A')
    expect(body.items[0].sellerName).toBe('Ana')
    expect(body.items.find((i: { customerCode: string }) => i.customerCode === 'B')).toBeUndefined()
  })

  // O teste mais importante do plano inteiro.
  it('gerente A pedindo vendorCode de vendedor da equipe B → 403, não lista vazia', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u-ana', name: 'Ana', idVendProt: 'V1', managerId: 'manager-a' },
    ])
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/visits?vendorCode=V9',
      headers: auth('manager-a'),
    })
    expect(res.statusCode).toBe(403)
    // O 403 corta antes de qualquer consulta de visita
    expect(prismaMock.visit.findMany).not.toHaveBeenCalled()
  })

  it('usuário com intel.admin recebe a empresa inteira (scope.managerId === null)', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u-ana', name: 'Ana', idVendProt: 'V1', managerId: 'manager-a' },
      { id: 'u-bruno', name: 'Bruno', idVendProt: 'V2', managerId: null },
    ])
    mockVisitsFilteredByVendorCode([
      visitRow({ id: 'v1', vendorCode: 'V1', customerCode: 'A' }),
      visitRow({ id: 'v2', vendorCode: 'V2', customerCode: 'B' }),
    ])
    prismaMock.customer.findMany.mockResolvedValue([
      { protheusCode: 'A', loja: '01', name: 'Cliente A' },
      { protheusCode: 'B', loja: '01', name: 'Cliente B' },
    ])

    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/visits?from=2026-08-01&to=2026-08-31',
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().items).toHaveLength(2)
    // loadSellers não filtra por gerente nem usa OR — vê a empresa inteira
    const where = prismaMock.user.findMany.mock.calls[0][0].where
    expect(where.managerId).toBeUndefined()
    expect(where.OR).toBeUndefined()
  })

  it('gerente que também vende aparece com as próprias visitas uma vez só', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'manager-a', name: 'Gustavo Gerente', idVendProt: '123', managerId: null },
    ])
    prismaMock.visit.findMany.mockResolvedValue([visitRow({ id: 'v-self', vendorCode: '123' })])
    prismaMock.customer.findMany.mockResolvedValue([{ protheusCode: 'A', loja: '01', name: 'Cliente A' }])

    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/visits?from=2026-08-01&to=2026-08-31',
      headers: auth('manager-a'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].sellerName).toBe('Gustavo Gerente')
    // um código só, não duplicado — mesmo o gerente entrando na equipe por
    // dois ramos do OR (managerId e id)
    const where = prismaMock.visit.findMany.mock.calls[0][0].where
    expect(where.vendorCode).toBe('123')
  })

  it('janela maior que 90 dias → 400', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u-ana', name: 'Ana', idVendProt: 'V1', managerId: 'manager-a' },
    ])
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/visits?from=2026-01-01&to=2026-08-01',
      headers: auth('manager-a'),
    })
    expect(res.statusCode).toBe(400)
  })

  it('sem vendedor na equipe devolve lista vazia sem consultar visitas', async () => {
    prismaMock.user.findMany.mockResolvedValue([])
    const res = await app.inject({
      method: 'GET',
      url: '/intel/manager/visits',
      headers: auth('manager-a'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().items).toEqual([])
    expect(prismaMock.visit.findMany).not.toHaveBeenCalled()
  })
})
