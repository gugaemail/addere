import { describe, it, expect } from 'vitest'
import { resolveParameters } from '../parameters'
import {
  computeCustomerSignal,
  distinctOrders,
  median,
  shiftDays,
  type CustomerInput,
  type SaleRecord,
} from '../signals'

const params = resolveParameters([])
const TODAY = '20260821'

const customer = (over: Partial<CustomerInput> = {}): CustomerInput => ({
  customerCode: 'C001',
  loja: '01',
  msblql: null,
  creditLimit: null,
  ultcom: null,
  segment: null,
  city: 'Campinas',
  district: null,
  ...over,
})

const sale = (
  orderRef: string,
  date: string,
  productCode = 'P1',
  amount = 100,
  productDesc: string | null = null
): SaleRecord => ({ orderRef, date, productCode, productDesc, amount })

/** N pedidos com intervalo fixo, terminando `lastGap` dias atrás de TODAY. */
function ordersEvery(cycleDays: number, count: number, daysSinceLast: number): SaleRecord[] {
  const sales: SaleRecord[] = []
  for (let i = 0; i < count; i++) {
    const date = shiftDays(TODAY, -daysSinceLast - (count - 1 - i) * cycleDays)
    sales.push(sale(`PED${i}`, date))
  }
  return sales
}

describe('median / distinctOrders', () => {
  it('mediana ímpar e par', () => {
    expect(median([30, 10, 20])).toBe(20)
    expect(median([10, 20, 30, 50])).toBe(25)
    expect(median([])).toBeNull()
  })

  it('agrupa itens no mesmo pedido (total somado, data mínima)', () => {
    const orders = distinctOrders([
      sale('A', '20260810', 'P1', 100),
      sale('A', '20260810', 'P2', 50),
      sale('B', '20260801', 'P1', 70),
    ])
    expect(orders.map((o) => o.orderRef)).toEqual(['B', 'A'])
    expect(orders[1].total).toBe(150)
  })
})

describe('status — régua de dias × ciclo (doc §4.1)', () => {
  it('no ciclo: d ≤ 1,3×ciclo', () => {
    // ciclo 28, última compra há 30 dias (30 ≤ 36,4)
    const s = computeCustomerSignal(customer(), ordersEvery(28, 6, 30), [], TODAY, params)
    expect(s.cycleDays).toBe(28)
    expect(s.status).toBe('ON_CYCLE')
    expect(s.purchaseProb).toBe(0.8)
    expect(s.reasons[0]).toBe('Compra a cada 28 dias, está no dia 30')
  })

  it('atrasado: 1,3×ciclo < d ≤ 2×ciclo', () => {
    const s = computeCustomerSignal(customer(), ordersEvery(28, 6, 40), [], TODAY, params)
    expect(s.status).toBe('LATE')
    expect(s.purchaseProb).toBe(0.5)
  })

  it('risco: d > 2×ciclo', () => {
    const s = computeCustomerSignal(customer(), ordersEvery(28, 6, 57), [], TODAY, params)
    expect(s.status).toBe('AT_RISK')
  })

  it('risco também por risk_days (ciclo longo, 90 < d ≤ 120)', () => {
    const s = computeCustomerSignal(customer(), ordersEvery(60, 5, 100), [], TODAY, params)
    expect(s.status).toBe('AT_RISK')
  })

  it('inativo: d > active_days', () => {
    const s = computeCustomerSignal(customer(), ordersEvery(28, 6, 121), [], TODAY, params)
    expect(s.status).toBe('INACTIVE')
    expect(s.purchaseProb).toBe(0.05)
  })

  it('novo: menos de cycle_min_orders pedidos', () => {
    const s = computeCustomerSignal(customer(), ordersEvery(28, 2, 10), [], TODAY, params)
    expect(s.status).toBe('NEW')
    expect(s.confidence).toBe('LOW')
  })
})

describe('bloqueio sobrepõe tudo (doc §4.1)', () => {
  it('título vencido > blocked_days', () => {
    const s = computeCustomerSignal(
      customer(),
      ordersEvery(28, 6, 10),
      [{ balance: 500, daysOverdue: 6 }],
      TODAY,
      params
    )
    expect(s.status).toBe('BLOCKED')
    expect(s.purchaseProb).toBe(0)
    expect(s.reasons[0]).toBe('Título vencido há 6 dias')
  })

  it('título vencido dentro do prazo não bloqueia', () => {
    const s = computeCustomerSignal(
      customer(),
      ordersEvery(28, 6, 10),
      [{ balance: 500, daysOverdue: 5 }],
      TODAY,
      params
    )
    expect(s.status).toBe('ON_CYCLE')
  })

  it('limite de crédito estourado', () => {
    const s = computeCustomerSignal(
      customer({ creditLimit: 1000 }),
      ordersEvery(28, 6, 10),
      [{ balance: 1500, daysOverdue: 0 }],
      TODAY,
      params
    )
    expect(s.status).toBe('BLOCKED')
    expect(s.reasons[0]).toBe('Limite de crédito estourado')
  })

  it('MSBLQL=1 do cadastro', () => {
    const s = computeCustomerSignal(customer({ msblql: '1' }), ordersEvery(28, 6, 10), [], TODAY, params)
    expect(s.status).toBe('BLOCKED')
  })
})

describe('confiança pelo nº de pedidos', () => {
  it('alta ≥ 8, média 3–7', () => {
    expect(computeCustomerSignal(customer(), ordersEvery(20, 8, 10), [], TODAY, params).confidence).toBe('HIGH')
    expect(computeCustomerSignal(customer(), ordersEvery(20, 5, 10), [], TODAY, params).confidence).toBe('MEDIUM')
  })
})

describe('ticket, tendência e mix', () => {
  it('ticket médio por pedido e tendência de queda > 25% vira motivo', () => {
    // 5 pedidos antigos de 200 + 2 recentes de 100 → ticket cai
    const sales = [
      ...[0, 1, 2, 3, 4].map((i) => sale(`OLD${i}`, shiftDays(TODAY, -300 + i * 30), 'P1', 200)),
      sale('NEW1', shiftDays(TODAY, -40), 'P1', 100),
      sale('NEW2', shiftDays(TODAY, -10), 'P1', 100),
    ]
    const s = computeCustomerSignal(customer(), sales, [], TODAY, params)
    expect(s.avgTicket).toBeCloseTo((5 * 200 + 2 * 100) / 7, 1)
    expect(s.trendPct).toBeLessThan(-25)
    expect(s.reasons.some((r) => r.includes('Ticket caiu'))).toBe(true)
  })

  it('mix habitual (≥2 dos últimos 3 pedidos) e cortado (fora do último)', () => {
    const sales = [
      sale('O1', '20260601', 'CAFE', 50, 'Café torrado'),
      sale('O1', '20260601', 'ACUCAR', 30, 'Açúcar'),
      sale('O2', '20260701', 'CAFE', 50, 'Café torrado'),
      sale('O2', '20260701', 'ACUCAR', 30, 'Açúcar'),
      sale('O2', '20260701', 'SAL', 10, 'Sal'),
      sale('O3', '20260801', 'CAFE', 50, 'Café torrado'),
    ]
    const s = computeCustomerSignal(customer(), sales, [], TODAY, params)
    expect(s.usualMix.map((p) => p.productCode)).toEqual(['ACUCAR', 'CAFE'])
    expect(s.cutMix.map((p) => p.productCode)).toEqual(['ACUCAR'])
    expect(s.reasons.some((r) => r.includes('Deixou de levar Açúcar'))).toBe(true)
  })
})

describe('modo degradado (sem SalesItem — §2.7)', () => {
  it('classifica por ultcom com confiança baixa', () => {
    const s = computeCustomerSignal(
      customer({ ultcom: shiftDays(TODAY, -100) }),
      [],
      [],
      TODAY,
      params
    )
    expect(s.degraded).toBe(true)
    expect(s.status).toBe('AT_RISK') // 100 > risk_days 90
    expect(s.confidence).toBe('LOW')
    expect(s.cycleDays).toBeNull()
    expect(s.reasons.at(-1)).toContain('Sinais limitados')
  })

  it('sem ultcom → NEW; muito antigo → INACTIVE; bloqueio ainda sobrepõe', () => {
    expect(computeCustomerSignal(customer(), [], [], TODAY, params).status).toBe('NEW')
    expect(
      computeCustomerSignal(customer({ ultcom: shiftDays(TODAY, -200) }), [], [], TODAY, params)
        .status
    ).toBe('INACTIVE')
    expect(
      computeCustomerSignal(customer({ msblql: '1', ultcom: shiftDays(TODAY, -10) }), [], [], TODAY, params)
        .status
    ).toBe('BLOCKED')
  })
})

describe('premissas por segmento (doc §4.5)', () => {
  it('override de segmento muda a régua só para o segmento', () => {
    const overrides = [
      { key: 'late_factor', value: 1.1, segment: 'atacado' },
    ]
    const atacado = resolveParameters(overrides, 'atacado')
    const varejo = resolveParameters(overrides, 'varejo')
    // ciclo 28, d=32: 32 > 1,1×28=30,8 (atrasado no atacado) mas ≤ 1,3×28 (no ciclo no varejo)
    const sales = ordersEvery(28, 6, 32)
    expect(computeCustomerSignal(customer(), sales, [], TODAY, atacado).status).toBe('LATE')
    expect(computeCustomerSignal(customer(), sales, [], TODAY, varejo).status).toBe('ON_CYCLE')
  })

  it('valor inválido no banco cai no default', () => {
    const p = resolveParameters([{ key: 'risk_days', value: 'banana', segment: '' }])
    expect(p.risk_days).toBe(90)
  })
})

describe('determinismo', () => {
  it('mesmo input → mesmo output', () => {
    const sales = ordersEvery(21, 7, 25)
    const a = computeCustomerSignal(customer(), sales, [], TODAY, params)
    const b = computeCustomerSignal(customer(), [...sales].reverse(), [], TODAY, params)
    expect(a).toEqual(b)
  })
})
