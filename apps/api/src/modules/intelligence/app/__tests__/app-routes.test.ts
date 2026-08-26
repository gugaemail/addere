// Testes de integração das rotas do app do vendedor (E7) — posse por
// {companyId, vendorCode} e portões de acesso (idVendProt, empresa desligada).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { buildApp } from '../../../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '33333333-3333-4333-8333-333333333333'
const ITEM_ID = '44444444-4444-4444-8444-444444444444'
const CLIENT_ID = '55555555-5555-4555-8555-555555555555'
const ORDER_ID = '66666666-6666-4666-8666-666666666666'

let app: FastifyInstance

// idVendProt/empresa por usuário — requireVendorCode consulta user.findUnique
const USER_ROWS: Record<string, object> = {
  'seller-a': { active: true, idVendProt: 'V1', company: { intelligenceEnabled: true } },
  'seller-no-code': { active: true, idVendProt: null, company: { intelligenceEnabled: true } },
  'seller-off': { active: true, idVendProt: 'V9', company: { intelligenceEnabled: false } },
}

const fakePlan = (over: Record<string, unknown> = {}) => ({
  id: PLAN_ID,
  companyId: COMPANY_A,
  vendorCode: 'V1',
  date: new Date('2026-08-21T00:00:00Z'),
  kind: 'DAY',
  generatedAt: new Date(),
  engineVersion: 'engine-v1',
  goalGap: null,
  expectedAmount: 1500,
  grouping: 'Campinas',
  llmSummary: 'Comece por Campinas',
  status: 'GENERATED',
  items: [
    {
      id: ITEM_ID,
      planId: PLAN_ID,
      position: 1,
      customerCode: 'A',
      loja: '01',
      statusAtTime: 'LATE',
      scoreAtTime: 0.7,
      shortReason: 'motivo',
      suggestedOffer: null,
      expectedAmount: 750,
      origin: 'ENGINE',
      signalsSnapshot: { status: 'LATE', reasons: ['r'] },
      removedAt: null,
      movedToPlanId: null,
      lat: null,
      lng: null,
      distFromPrevM: null,
      etaMin: null,
      plannedTime: null,
      createdAt: new Date(),
    },
  ],
  ...over,
})

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockImplementation(
    async (args: { where: { id: string } }) => USER_ROWS[args.where.id] ?? null
  )
})

const auth = (sub = 'seller-a') => ({
  authorization: `Bearer ${app.jwt.sign({ sub, email: 'x@a.com', role: 'SALESPERSON', companyId: COMPANY_A })}`,
})

describe('portões de acesso (require-vendor-code)', () => {
  it('sem idVendProt → 422 com orientação', async () => {
    const res = await app.inject({ method: 'GET', url: '/intel/app/home', headers: auth('seller-no-code') })
    expect(res.statusCode).toBe(422)
    expect(res.json().message).toContain('vendedor')
  })

  it('empresa com Inteligência desligada → 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/intel/app/home', headers: auth('seller-off') })
    expect(res.statusCode).toBe(403)
  })

  it('sem token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/intel/app/home' })
    expect(res.statusCode).toBe(401)
  })
})

describe('GET /intel/app/home e /plan', () => {
  it('home devolve resumo com carteira e frescor', async () => {
    prismaMock.visitPlan.findUnique.mockResolvedValue(fakePlan())
    prismaMock.customer.findMany.mockResolvedValue([{ protheusCode: 'A', loja: '01' }])
    prismaMock.customerSignal.findMany.mockResolvedValue([
      { customerCode: 'A', loja: '01', status: 'LATE' },
    ])
    const res = await app.inject({ method: 'GET', url: '/intel/app/home', headers: auth() })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.llmSummary).toBe('Comece por Campinas')
    expect(body.plan.itemsCount).toBe(1)
    expect(body.portfolio).toEqual({ total: 1, byStatus: { LATE: 1 } })
    expect(body.freshness.stale).toBe(true) // sem run OK mockado
  })

  it('plan devolve DTO com itens, sinais e meta nula sem snapshot', async () => {
    prismaMock.visitPlan.findUnique.mockResolvedValue(fakePlan())
    prismaMock.customer.findMany.mockResolvedValue([
      { protheusCode: 'A', loja: '01', name: 'Cliente A', address: 'Rua X', municipio: 'Campinas', phone: null },
    ])
    const res = await app.inject({ method: 'GET', url: '/intel/app/plan', headers: auth() })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items[0].customerName).toBe('Cliente A')
    expect(body.items[0].signals.status).toBe('LATE')
    expect(body.goal).toBeNull()
  })

  it('sem plano do dia → 404 com mensagem amigável', async () => {
    const res = await app.inject({ method: 'GET', url: '/intel/app/plan', headers: auth() })
    expect(res.statusCode).toBe(404)
  })
})

describe('PATCH /intel/app/plans/:id/items — posse', () => {
  it('plano de OUTRO vendedor → 403', async () => {
    prismaMock.visitPlan.findFirst.mockResolvedValue(fakePlan({ vendorCode: 'V2' }))
    const res = await app.inject({
      method: 'PATCH',
      url: `/intel/app/plans/${PLAN_ID}/items`,
      headers: auth(),
      payload: { ops: [{ opId: '1', type: 'remove', itemId: ITEM_ID }] },
    })
    expect(res.statusCode).toBe(403)
  })

  it('edição própria aplica ops e marca EDITED', async () => {
    prismaMock.visitPlan.findFirst.mockResolvedValue(fakePlan())
    prismaMock.visitPlan.findUnique.mockResolvedValue(fakePlan())
    prismaMock.customer.findMany.mockResolvedValue([])
    const res = await app.inject({
      method: 'PATCH',
      url: `/intel/app/plans/${PLAN_ID}/items`,
      headers: auth(),
      payload: { ops: [{ opId: 'op1', type: 'remove', itemId: ITEM_ID }] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().applied).toEqual(['op1'])
    // persistiu removedAt + status EDITED na transação
    expect(prismaMock.visitPlanItem.update).toHaveBeenCalled()
    expect(prismaMock.visitPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'EDITED' }) })
    )
  })
})

describe('visitas — idempotência offline e posse', () => {
  const visitPayload = {
    clientId: CLIENT_ID,
    customerCode: 'A',
    loja: '01',
    arrivedAt: '2026-08-21T14:00:00.000Z',
  }

  it('check-in novo → 201; retry do mesmo clientId → atualiza (200)', async () => {
    prismaMock.visit.create.mockResolvedValue({ id: 'visit-1' })
    const first = await app.inject({ method: 'POST', url: '/intel/app/visits', headers: auth(), payload: visitPayload })
    expect(first.statusCode).toBe(201)

    prismaMock.visit.findUnique.mockResolvedValue({ id: 'visit-1', vendorCode: 'V1' })
    const retry = await app.inject({ method: 'POST', url: '/intel/app/visits', headers: auth(), payload: visitPayload })
    expect(retry.statusCode).toBe(200)
    expect(retry.json().updated).toBe(true)
  })

  it('check-in com planItemId promove o plano GENERATED → IN_PROGRESS', async () => {
    const PLAN_ITEM_ID = '7c1f9c0e-6d0e-4d8a-9f3b-2a1b3c4d5e6f'
    prismaMock.visitPlanItem.findFirst.mockResolvedValue({ id: PLAN_ITEM_ID, planId: 'plan-1' })
    prismaMock.visit.create.mockResolvedValue({ id: 'visit-3' })
    const res = await app.inject({
      method: 'POST',
      url: '/intel/app/visits',
      headers: auth(),
      payload: { ...visitPayload, planItemId: PLAN_ITEM_ID },
    })
    expect(res.statusCode).toBe(201)
    // Só GENERATED vira IN_PROGRESS — EDITED/IN_PROGRESS ficam como estão
    expect(prismaMock.visitPlan.updateMany).toHaveBeenCalledWith({
      where: { id: 'plan-1', status: 'GENERATED' },
      data: { status: 'IN_PROGRESS' },
    })
  })

  it('check-in sem planItemId (fora do plano) não mexe em plano nenhum', async () => {
    prismaMock.visit.create.mockResolvedValue({ id: 'visit-4' })
    const res = await app.inject({ method: 'POST', url: '/intel/app/visits', headers: auth(), payload: visitPayload })
    expect(res.statusCode).toBe(201)
    expect(prismaMock.visitPlan.updateMany).not.toHaveBeenCalled()
  })

  it('clientId de OUTRO vendedor → 409', async () => {
    prismaMock.visit.findUnique.mockResolvedValue({ id: 'visit-2', vendorCode: 'V2' })
    const res = await app.inject({ method: 'POST', url: '/intel/app/visits', headers: auth(), payload: visitPayload })
    expect(res.statusCode).toBe(409)
  })

  it('orderId de outro usuário → 422', async () => {
    prismaMock.order.findFirst.mockResolvedValue(null)
    const res = await app.inject({
      method: 'POST',
      url: '/intel/app/visits',
      headers: auth(),
      payload: { ...visitPayload, orderId: ORDER_ID },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().message).toContain('Pedido')
  })

  it('PATCH fecha a visita própria; de outro vendedor → 404', async () => {
    prismaMock.visit.findFirst.mockResolvedValue({ id: 'visit-1' })
    const ok = await app.inject({
      method: 'PATCH',
      url: `/intel/app/visits/${CLIENT_ID}`,
      headers: auth(),
      payload: { result: 'NO_ORDER', noOrderReason: 'sem verba' },
    })
    expect(ok.statusCode).toBe(200)

    resetPrismaMock()
    prismaMock.user.findUnique.mockResolvedValue(USER_ROWS['seller-a'])
    prismaMock.visit.findFirst.mockResolvedValue(null) // filtro por vendorCode não achou
    const denied = await app.inject({
      method: 'PATCH',
      url: `/intel/app/visits/${CLIENT_ID}`,
      headers: auth(),
      payload: { result: 'ORDER' },
    })
    expect(denied.statusCode).toBe(404)
  })
})

describe('mensagens e feedback', () => {
  it('mensagem sem LLM usa o template determinístico e registra', async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ name: 'Padaria Central', municipio: 'Campinas' })
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A, intelligenceConfig: null })
    prismaMock.customerSignal.findUnique.mockResolvedValue({
      status: 'LATE', confidence: 'HIGH', cycleDays: 28, daysSinceLastPurchase: 41,
      orders12m: 10, avgTicket: 1500, trendPct: null, usualMix: [], cutMix: [], reasons: [],
    })
    prismaMock.customerMessage.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => ({
        id: 'msg-1', generatedAt: new Date(), ...args.data,
      })
    )
    const res = await app.inject({
      method: 'POST',
      url: '/intel/app/messages',
      headers: auth(),
      payload: { customerCode: 'A', loja: '01', template: 'WENT_QUIET' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.text).toContain('Padaria Central')
    expect(body.text).toContain('41 dias')
    expect(body.text).toContain('28 dias')
  })

  it('cliente fora da carteira → 404 (não revela existência)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/intel/app/messages',
      headers: auth(),
      payload: { customerCode: 'DE-OUTRO', loja: '01', template: 'REACTIVATE' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('feedback em item de plano de outro vendedor → 404', async () => {
    prismaMock.visitPlanItem.findFirst.mockResolvedValue(null)
    const res = await app.inject({
      method: 'POST',
      url: '/intel/app/feedback',
      headers: auth(),
      payload: { targetType: 'ITEM', targetId: ITEM_ID, rating: -1 },
    })
    expect(res.statusCode).toBe(404)
  })

  it('feedback válido em plano próprio → 201', async () => {
    prismaMock.visitPlan.findFirst.mockResolvedValue({ id: PLAN_ID })
    prismaMock.intelFeedback.create.mockResolvedValue({ id: 'fb-1' })
    const res = await app.inject({
      method: 'POST',
      url: '/intel/app/feedback',
      headers: auth(),
      payload: { targetType: 'PLAN', targetId: PLAN_ID, rating: 1, comment: 'plano bom' },
    })
    expect(res.statusCode).toBe(201)
  })
})

describe('briefing', () => {
  it('cliente da carteira sem sinais → 404 amigável; com sinais → DTO com fallback', async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ name: 'Cliente A', municipio: 'Campinas' })
    const noSignals = await app.inject({
      method: 'GET', url: '/intel/app/customers/A/01/briefing', headers: auth(),
    })
    expect(noSignals.statusCode).toBe(404)
    expect(noSignals.json().message).toContain('Sinais')

    prismaMock.customerSignal.findUnique.mockResolvedValue({
      status: 'LATE', confidence: 'HIGH', cycleDays: 28, daysSinceLastPurchase: 41,
      orders12m: 10, avgTicket: 1500, trendPct: -10, usualMix: [], cutMix: [],
      reasons: ['Compra a cada 28 dias, está no dia 41'],
    })
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A, intelligenceConfig: null })
    const res = await app.inject({
      method: 'GET', url: '/intel/app/customers/A/01/briefing', headers: auth(),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.signals.status).toBe('LATE')
    expect(body.text).toBeNull() // sem ANTHROPIC_API_KEY → fallback só-motor
  })
})
