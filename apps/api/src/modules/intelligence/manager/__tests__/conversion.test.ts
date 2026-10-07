// Conversão em reais por origem da visita (plano 004).
// Duas camadas: o cálculo puro (buildConversionReport, sobre fixtures) e a
// rota (GET /intel/manager/conversion, com prismaMock), porque a tradução de
// Order.status === 'CANCELLED' para orderTotal: null e a conciliação por
// data acontecem em conversion.service.ts, não dentro da função pura.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildConversionReport, type VisitValueFact } from '../conversion'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { buildApp } from '../../../../app'

// ───────────────────────── Cálculo puro (passo 5) ─────────────────────────

const fact = (over: Partial<VisitValueFact> = {}): VisitValueFact => ({
  ymd: '20261005',
  vendorCode: 'V1',
  planned: true,
  orderTotal: 1000,
  expectedAmount: 500,
  link: 'strong',
  ...over,
})

describe('buildConversionReport', () => {
  it('pedido CANCELLED (já traduzido para orderTotal: null) não entra em withOrder nem em soldAmount', () => {
    const report = buildConversionReport({
      fromYmd: '20261001',
      toYmd: '20261031',
      facts: [fact({ orderTotal: null })],
    })
    expect(report.total.withOrder).toBe(0)
    expect(report.total.soldAmount).toBe(0)
  })

  it('avgTicket é null quando withOrder é 0 — nunca 0, nunca NaN', () => {
    const report = buildConversionReport({
      fromYmd: '20261001',
      toYmd: '20261031',
      facts: [fact({ orderTotal: null })],
    })
    expect(report.total.avgTicket).toBeNull()
    expect(report.total.avgTicket).not.toBe(0)
  })

  it('valuePerVisitDiff é null quando um dos lados (plano ou fora do plano) tem visits 0', () => {
    const report = buildConversionReport({
      fromYmd: '20261001',
      toYmd: '20261031',
      facts: [fact({ planned: true })], // nenhuma visita fora do plano nesta janela
    })
    expect(report.outOfPlan.visits).toBe(0)
    expect(report.valuePerVisitDiff).toBeNull()
  })

  it('parada com expectedAmount: null fica fora dos dois lados de "expected"', () => {
    const report = buildConversionReport({
      fromYmd: '20261001',
      toYmd: '20261031',
      facts: [
        fact({ expectedAmount: null, orderTotal: 300 }), // fora do plano (sem expectedAmount) — não entra
        fact({ expectedAmount: 200, orderTotal: 400 }),
      ],
    })
    expect(report.expected.expectedAmount).toBe(200)
    expect(report.expected.soldAmount).toBe(400)
  })

  it('ratioPct é null quando o expectedAmount somado é 0 (nenhuma parada com expectedAmount)', () => {
    const report = buildConversionReport({
      fromYmd: '20261001',
      toYmd: '20261031',
      facts: [fact({ expectedAmount: null })],
    })
    expect(report.expected.expectedAmount).toBe(0)
    expect(report.expected.ratioPct).toBeNull()
  })
})

// ───────────────────────── Rota (prismaMock + buildApp) ─────────────────────────

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

const url = '/intel/manager/conversion?from=2026-10-01&to=2026-10-31'

describe('GET /intel/manager/conversion', () => {
  it('vendedor sem intel.* → 403', async () => {
    const res = await app.inject({ method: 'GET', url, headers: auth('sales-a') })
    expect(res.statusCode).toBe(403)
  })

  it('empresa sem vendedores devolve relatório vazio, sem consultar visita', async () => {
    const res = await app.inject({ method: 'GET', url, headers: auth('admin-a') })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      total: { visits: 0, withOrder: 0, soldAmount: 0, avgTicket: null },
      reconciliation: { strong: 0, byDate: 0 },
    })
    expect(prismaMock.visit.findMany).not.toHaveBeenCalled()
  })

  // O teste mais importante do plano inteiro: esta rota expõe faturamento
  // por vendedor, então o recorte de equipe (sellerWhere/loadSellers, plano
  // 007) não pode vazar. Mesma técnica de manager-visits.test.ts — o mock
  // filtra pelo `where.vendorCode` que a própria rota monta a partir de
  // loadSellers, não por um acaso do teste: se a rota um dia parar de
  // filtrar, o teste passa a ver o pedido de V9 e falha.
  it('gerente A nunca recebe faturamento de vendedor de outra equipe (manager-b)', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u-ana', name: 'Ana', idVendProt: 'V1', managerId: 'manager-a' },
    ])
    prismaMock.visit.findMany.mockImplementation(
      async (args: { where: { vendorCode: string | { in: string[] } } }) => {
        const want = args.where.vendorCode
        const codes = typeof want === 'string' ? [want] : want.in
        const all = [
          {
            vendorCode: 'V1', // equipe de manager-a
            arrivedAt: new Date('2026-10-05T14:00:00Z'),
            customerCode: 'A',
            loja: '01',
            planItemId: null,
            orderId: 'o1',
          },
          {
            vendorCode: 'V9', // equipe de manager-b — nunca deve aparecer para A
            arrivedAt: new Date('2026-10-05T14:00:00Z'),
            customerCode: 'B',
            loja: '01',
            planItemId: null,
            orderId: 'o9',
          },
        ]
        return all.filter((v) => codes.includes(v.vendorCode))
      }
    )
    prismaMock.order.findMany.mockImplementation(async (args: { where: { id?: { in: string[] } } }) => {
      const wanted = args.where.id?.in ?? []
      const all = [
        { id: 'o1', total: 1000, status: 'SYNCED' },
        { id: 'o9', total: 9999, status: 'SYNCED' }, // pedido da equipe de B
      ]
      return all.filter((o) => wanted.includes(o.id))
    })

    const res = await app.inject({ method: 'GET', url, headers: auth('manager-a') })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total.visits).toBe(1)
    expect(body.total.soldAmount).toBe(1000)
    expect(body.reconciliation).toEqual({ strong: 1, byDate: 0 })
  })

  it('pedido CANCELLED vinculado por orderId conta como não convertido', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u-ana', name: 'Ana', idVendProt: 'V1', managerId: 'manager-a' },
    ])
    prismaMock.visit.findMany.mockResolvedValue([
      {
        vendorCode: 'V1',
        arrivedAt: new Date('2026-10-05T14:00:00Z'),
        customerCode: 'A',
        loja: '01',
        planItemId: null,
        orderId: 'o1',
      },
    ])
    prismaMock.order.findMany.mockResolvedValue([{ id: 'o1', total: 1000, status: 'CANCELLED' }])

    const res = await app.inject({ method: 'GET', url, headers: auth('manager-a') })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total.withOrder).toBe(0)
    expect(body.total.soldAmount).toBe(0)
  })

  it('visita sem orderId concilia por cliente+vendedor+mesmo dia civil e marca byDate', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u-ana', name: 'Ana', idVendProt: 'V1', managerId: 'manager-a' },
    ])
    prismaMock.visit.findMany.mockResolvedValue([
      {
        vendorCode: 'V1',
        arrivedAt: new Date('2026-10-05T14:00:00Z'), // 11h em São Paulo
        customerCode: 'A',
        loja: '01',
        planItemId: null,
        orderId: null,
      },
    ])
    prismaMock.order.findMany.mockResolvedValue([
      {
        id: 'o2',
        total: 850,
        status: 'SYNCED',
        createdAt: new Date('2026-10-05T16:00:00Z'), // 13h em São Paulo — mesmo dia civil
        user: { idVendProt: 'V1' },
        customer: { protheusCode: 'A', loja: '01' },
      },
    ])

    const res = await app.inject({ method: 'GET', url, headers: auth('manager-a') })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total.soldAmount).toBe(850)
    expect(body.reconciliation).toEqual({ strong: 0, byDate: 1 })
  })
})
