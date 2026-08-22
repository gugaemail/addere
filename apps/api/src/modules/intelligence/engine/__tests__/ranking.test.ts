import { describe, it, expect } from 'vitest'
import { resolveParameters } from '../parameters'
import { rankCustomers, selectWithDiversity, type RankableCustomer } from '../ranking'
import type { CustomerSignalResult } from '../signals'
import { PURCHASE_PROB } from '../signals'
import { computeVendorGoal } from '../goal'
import { businessDaysRemaining, isBusinessDay } from '../business-days'

const params = resolveParameters([])

const signal = (over: Partial<CustomerSignalResult> = {}): CustomerSignalResult => ({
  status: 'ON_CYCLE',
  confidence: 'HIGH',
  cycleDays: 28,
  daysSinceLastPurchase: 20,
  orders12m: 10,
  avgTicket: 1000,
  trendPct: null,
  purchaseProb: PURCHASE_PROB[over.status ?? 'ON_CYCLE'],
  usualMix: [],
  cutMix: [],
  reasons: ['motivo'],
  degraded: false,
  ...over,
})

const rankable = (
  code: string,
  over: Partial<RankableCustomer> = {},
  sig: Partial<CustomerSignalResult> = {}
): RankableCustomer => ({
  customerCode: code,
  loja: '01',
  city: 'Campinas',
  district: null,
  signal: signal(sig),
  visitedRecently: false,
  ...over,
})

describe('rankCustomers — filtros', () => {
  it('remove visitado no cooldown e inativo > 12m; separa bloqueados', () => {
    const result = rankCustomers(
      [
        rankable('A'),
        rankable('B', { visitedRecently: true }),
        rankable('C', {}, { daysSinceLastPurchase: 400, status: 'INACTIVE' }),
        rankable('D', {}, { status: 'BLOCKED' }),
      ],
      8,
      params
    )
    expect(result.selected.map((i) => i.customerCode)).toEqual(['A'])
    expect(result.blocked.map((i) => i.customerCode)).toEqual(['D'])
  })
})

describe('rankCustomers — scores (doc §4.3)', () => {
  it('valor normalizado pelo máximo; urgência satura em 2×; risco por status', () => {
    const result = rankCustomers(
      [
        rankable('BIG', {}, { avgTicket: 2000, daysSinceLastPurchase: 28 }), // urg 0.5
        rankable('URG', {}, { avgTicket: 1000, daysSinceLastPurchase: 70, status: 'AT_RISK' }), // urg satura 1
      ],
      8,
      params
    )
    const big = result.selected.find((i) => i.customerCode === 'BIG')!
    const urg = result.selected.find((i) => i.customerCode === 'URG')!
    expect(big.scoreValue).toBe(1) // 2000×0.8 é o máximo
    expect(big.scoreUrgency).toBe(0.5)
    expect(urg.scoreUrgency).toBe(1) // 70/28 = 2.5 satura em 2×
    expect(urg.scoreRisk).toBe(1)
    // total = (40×v + 35×u + 25×r)/100
    expect(urg.scoreTotal).toBeCloseTo((40 * urg.scoreValue + 35 * 1 + 25 * 1) / 100, 3)
  })
})

describe('selectWithDiversity — máx. 60% do mesmo status', () => {
  const item = (code: string, status: 'ON_CYCLE' | 'LATE', score: number) => ({
    customerCode: code,
    loja: '01',
    status: status as CustomerSignalResult['status'],
    scoreValue: score,
    scoreUrgency: 0,
    scoreRisk: 0,
    scoreTotal: score,
    shortReason: null,
    expectedAmount: null,
  })

  it('mistura status mesmo quando um domina o topo', () => {
    const sorted = [
      item('A', 'ON_CYCLE', 0.9),
      item('B', 'ON_CYCLE', 0.8),
      item('C', 'ON_CYCLE', 0.7),
      item('D', 'ON_CYCLE', 0.6),
      item('E', 'LATE', 0.5),
      item('F', 'LATE', 0.4),
    ]
    const selected = selectWithDiversity(sorted, 5, 60)
    // teto = ceil(5×0.6)=3 ON_CYCLE; entra E/F; sobra 1 vaga → volta D
    expect(selected.map((i) => i.customerCode)).toEqual(['A', 'B', 'C', 'E', 'F'])
  })

  it('um status só: preenche a capacidade mesmo acima do teto', () => {
    const sorted = [item('A', 'ON_CYCLE', 0.9), item('B', 'ON_CYCLE', 0.8), item('C', 'ON_CYCLE', 0.7)]
    expect(selectWithDiversity(sorted, 3, 60)).toHaveLength(3)
  })
})

describe('agrupamento geográfico do dia', () => {
  it('escolhe a cidade com maior Σscore e preenche o resto com as demais', () => {
    const result = rankCustomers(
      [
        rankable('A1', { city: 'Campinas' }, { avgTicket: 1000 }),
        rankable('A2', { city: 'Campinas' }, { avgTicket: 900 }),
        rankable('B1', { city: 'Valinhos' }, { avgTicket: 500 }),
      ],
      3,
      params
    )
    expect(result.grouping).toBe('Campinas')
    expect(result.selected.map((i) => i.customerCode)).toEqual(['A1', 'A2', 'B1'])
  })
})

describe('determinismo do ranking', () => {
  it('mesmo input (em outra ordem) → mesma seleção', () => {
    const customers = [
      rankable('C3', {}, { avgTicket: 500 }),
      rankable('C1', {}, { avgTicket: 1000 }),
      rankable('C2', {}, { avgTicket: 1000 }), // empate com C1 → desempata por código
    ]
    const a = rankCustomers(customers, 2, params)
    const b = rankCustomers([...customers].reverse(), 2, params)
    expect(a.selected.map((i) => i.customerCode)).toEqual(['C1', 'C2'])
    expect(a).toEqual(b)
  })
})

describe('computeVendorGoal (doc §4.2)', () => {
  it('gap, por dia útil e coberturas', () => {
    const portfolio = [
      signal({ status: 'LATE', avgTicket: 1000 }), // 1000×0.5 = 500
      signal({ status: 'AT_RISK', avgTicket: 2000 }), // 2000×0.2 = 400
      signal({ status: 'ON_CYCLE', avgTicket: 3000 }),
      signal({ status: 'BLOCKED', avgTicket: 9000 }),
    ]
    const goal = computeVendorGoal({
      goalAmount: 50_000,
      soldAmount: 30_000,
      businessDaysLeft: 8,
      portfolio,
    })
    expect(goal.gap).toBe(20_000)
    expect(goal.perBusinessDay).toBe(2_500)
    expect(goal.lateCoverage).toBe(900)
    // ativos: LATE+AT_RISK+ON_CYCLE (3 clientes, ticket médio 2000) → 6000/50000
    expect(goal.funnelCoverage).toBeCloseTo(0.12, 2)
  })

  it('sem meta → gap/porDia/funil nulos, cobertura de atrasados sai mesmo assim', () => {
    const goal = computeVendorGoal({
      goalAmount: null,
      soldAmount: null,
      businessDaysLeft: 10,
      portfolio: [signal({ status: 'LATE', avgTicket: 100 })],
    })
    expect(goal.gap).toBeNull()
    expect(goal.perBusinessDay).toBeNull()
    expect(goal.funnelCoverage).toBeNull()
    expect(goal.lateCoverage).toBe(50)
  })
})

describe('business-days (BRT)', () => {
  it('sábado conta só com saturday_workday', () => {
    expect(isBusinessDay('20260822', false)).toBe(false) // sábado
    expect(isBusinessDay('20260822', true)).toBe(true)
    expect(isBusinessDay('20260823', true)).toBe(false) // domingo nunca
  })

  it('dias úteis restantes de agosto/2026 a partir do dia 21 (sex)', () => {
    // 21(sex), 24-28(seg-sex), 31(seg) = 7 dias úteis; +2 sábados (22 e 29) se úteis
    const now = new Date('2026-08-21T12:00:00Z')
    expect(businessDaysRemaining(now, false)).toBe(7)
    expect(businessDaysRemaining(now, true)).toBe(9)
  })
})
