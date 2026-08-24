import {
  activeAddresses,
  beforeEnterLines,
  confidenceLabel,
  localMessageFallback,
  planFallbackLine,
} from '../intelText'
import type { SignalsSnapshot, VisitPlanDto } from '@addere/types'

const baseSignals: SignalsSnapshot = {
  status: 'LATE',
  confidence: 'HIGH',
  cycleDays: 20,
  daysSinceLastPurchase: 32,
  orders12m: 14,
  avgTicket: '1850.00',
  trendPct: -12,
  usualMix: [{ productCode: 'P1', productDesc: 'Produto 1' }],
  cutMix: [{ productCode: 'P9', productDesc: 'Produto 9' }],
  openTitles: { count: 2, totalBalance: '3200.00', maxDaysOverdue: 12 },
  reasons: ['atrasado no ciclo'],
}

describe('planFallbackLine', () => {
  it('monta a frase determinística com os pedaços disponíveis', () => {
    const line = planFallbackLine({ itemsCount: 8, lateCount: 3, expectedAmount: '12500.00' })
    expect(line).toContain('8 visita(s)')
    expect(line).toContain('3 cliente(s) atrasados')
    expect(line).toContain('esperados se nada mudar')
  })

  it('omite pedaços sem dado', () => {
    const line = planFallbackLine({ itemsCount: 5, lateCount: 0, expectedAmount: null })
    expect(line).toBe('5 visita(s) sugeridas para hoje')
  })
})

describe('beforeEnterLines', () => {
  it('cobre compra, ticket com tendência, títulos e mix cortado', () => {
    const lines = beforeEnterLines(baseSignals)
    expect(lines[0]).toContain('32 dias')
    expect(lines[0]).toContain('~20 dias')
    expect(lines[1]).toContain('14 pedido(s)')
    expect(lines[1]).toContain('12% menos')
    expect(lines[2]).toContain('2 título(s)')
    expect(lines[2]).toContain('vencido há 12 dias')
    expect(lines[3]).toContain('Produto 9')
  })

  it('cliente sem histórico ganha linha padrão', () => {
    const lines = beforeEnterLines({
      ...baseSignals,
      daysSinceLastPurchase: null,
      avgTicket: null,
      cutMix: [],
      openTitles: { count: 0, totalBalance: '0', maxDaysOverdue: null },
    })
    expect(lines).toEqual(['Cliente novo na carteira — ainda sem histórico calculado.'])
  })
})

describe('confidenceLabel / localMessageFallback', () => {
  it('rótulos de confiança em PT', () => {
    expect(confidenceLabel('HIGH')).toContain('alta')
    expect(confidenceLabel('MEDIUM')).toContain('média')
    expect(confidenceLabel('LOW')).toContain('baixa')
  })

  it('fallback local usa o primeiro nome e os sinais quando há', () => {
    const text = localMessageFallback('WENT_QUIET', 'Maria Silva', {
      daysSinceLastPurchase: 40,
      cycleDays: 21,
    })
    expect(text).toContain('Maria')
    expect(text).toContain('40 dias')
    expect(text).toContain('a cada 21 dias')
    expect(localMessageFallback('REACTIVATE', 'João Souza', null)).toContain('João')
  })
})

describe('activeAddresses', () => {
  it('só paradas ativas com endereço, na ordem', () => {
    const plan = {
      items: [
        { removedAt: null, customerAddress: 'Rua A' },
        { removedAt: '2026-08-23', customerAddress: 'Rua B' },
        { removedAt: null, customerAddress: null },
        { removedAt: null, customerAddress: 'Rua C' },
      ],
    } as unknown as VisitPlanDto
    expect(activeAddresses(plan)).toEqual(['Rua A', 'Rua C'])
    expect(activeAddresses(null)).toEqual([])
  })
})
