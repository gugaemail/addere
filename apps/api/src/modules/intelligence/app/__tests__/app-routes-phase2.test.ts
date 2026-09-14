// Rotas do app do vendedor — fase 2: carteira (E19), janelas (E16) e estoque (E22).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { buildApp } from '../../../../app'
import { clearStockCache } from '../stock.routes'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  clearStockCache()
  prismaMock.user.findUnique.mockResolvedValue({
    active: true,
    idVendProt: 'V1',
    company: { intelligenceEnabled: true },
  })
})

const auth = () => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'seller-a', email: 'x@a.com', role: 'SALESPERSON', companyId: COMPANY_A })}`,
})

describe('GET /intel/app/portfolio', () => {
  it('devolve contagens por status/RFM, valor dos atrasados e texto nulo sem LLM', async () => {
    prismaMock.customer.findMany.mockResolvedValue([
      { protheusCode: 'A', loja: '01', name: 'Cliente A', municipio: 'Campinas' },
      { protheusCode: 'B', loja: '01', name: 'Cliente B', municipio: 'Valinhos' },
    ])
    prismaMock.customerSignal.findMany.mockResolvedValue([
      {
        customerCode: 'A', loja: '01', status: 'LATE', daysSinceLastPurchase: 41, avgTicket: 1500,
        reasons: ['r'], cycleDays: 28, orders12m: 10, trendPct: -10, rfmSegment: 'AT_RISK',
        crossSell: [{ productCode: 'P1' }], purchaseProb: 0.5,
      },
      {
        customerCode: 'B', loja: '01', status: 'ON_CYCLE', daysSinceLastPurchase: 5, avgTicket: 800,
        reasons: [], cycleDays: 20, orders12m: 12, trendPct: 3, rfmSegment: 'CHAMPION',
        crossSell: [], purchaseProb: 0.8,
      },
    ])
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A, intelligenceConfig: null })

    const res = await app.inject({ method: 'GET', url: '/intel/app/portfolio', headers: auth() })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total).toBe(2)
    expect(body.byStatus).toEqual({ LATE: 1, ON_CYCLE: 1 })
    expect(body.byRfm).toEqual({ AT_RISK: 1, CHAMPION: 1 })
    expect(body.rfmAvailable).toBe(true)
    expect(body.items[0]).toMatchObject({ customerName: 'Cliente A', crossSellCount: 1, city: 'Campinas' })
    expect(Number(body.lateAmount)).toBeGreaterThan(0)
    expect(body.text).toBeNull() // sem ANTHROPIC_API_KEY → só-motor
  })
})

describe('janelas de atendimento', () => {
  it('cliente fora da carteira → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/intel/app/customers/X/01/windows', headers: auth() })
    expect(res.statusCode).toBe(404)
  })

  it('PUT válido substitui as janelas do vendedor e devolve a lista', async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: 'c1' })
    prismaMock.customerWindow.findMany.mockResolvedValue([
      { weekday: 1, startTime: '08:00', endTime: '12:00', source: 'SELLER' },
    ])
    const res = await app.inject({
      method: 'PUT',
      url: '/intel/app/customers/A/01/windows',
      headers: auth(),
      payload: { windows: [{ weekday: 1, startTime: '08:00', endTime: '12:00' }] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().windows).toEqual([
      { weekday: 1, startTime: '08:00', endTime: '12:00', source: 'SELLER' },
    ])
    expect(prismaMock.customerWindow.deleteMany).toHaveBeenCalled()
    expect(prismaMock.customerWindow.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ weekday: 1, source: 'SELLER' }) })
    )
  })

  it('fim antes do início → 400; dois horários no mesmo dia → 400', async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: 'c1' })
    const inverted = await app.inject({
      method: 'PUT',
      url: '/intel/app/customers/A/01/windows',
      headers: auth(),
      payload: { windows: [{ weekday: 1, startTime: '12:00', endTime: '08:00' }] },
    })
    expect(inverted.statusCode).toBe(400)

    const duplicated = await app.inject({
      method: 'PUT',
      url: '/intel/app/customers/A/01/windows',
      headers: auth(),
      payload: {
        windows: [
          { weekday: 2, startTime: '08:00', endTime: '10:00' },
          { weekday: 2, startTime: '14:00', endTime: '16:00' },
        ],
      },
    })
    expect(duplicated.statusCode).toBe(400)
  })
})

describe('GET /intel/app/stock/:productCode', () => {
  it('produto desconhecido → 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/intel/app/stock/P999', headers: auth() })
    expect(res.statusCode).toBe(404)
  })

  it('sem contrato STOCK publicado cai no saldo do sync, marcado como tal', async () => {
    prismaMock.product.findFirst.mockResolvedValue({ saldo: 12.5 })
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A, apiSql: null })
    const res = await app.inject({ method: 'GET', url: '/intel/app/stock/P001', headers: auth() })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ productCode: 'P001', saldo: '12.50', source: 'sync' })
  })
})
