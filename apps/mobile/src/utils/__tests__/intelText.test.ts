import {
  activeAddresses,
  beforeEnterLines,
  confidenceLabel,
  formatDistanceM,
  goalCardModel,
  localMessageFallback,
  offerSuffix,
  planFallbackLine,
  stockLabel,
  stopMetaLine,
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

describe('goalCardModel', () => {
  const goal = (over: Partial<NonNullable<VisitPlanDto['goal']>>): VisitPlanDto['goal'] => ({
    goalAmount: '50000.00',
    soldAmount: '20000.00',
    gap: '30000.00',
    perBusinessDay: '2500.00',
    lateCoverage: '8000.00',
    ...over,
  })

  it('meta "0.00" (string truthy) não gera card', () => {
    expect(goalCardModel(goal({ goalAmount: '0.00', gap: '0.00', perBusinessDay: '0.00' }))).toBeNull()
    expect(goalCardModel(goal({ goalAmount: null }))).toBeNull()
    expect(goalCardModel(goal({ goalAmount: 'abc' }))).toBeNull()
    expect(goalCardModel(null)).toBeNull()
    expect(goalCardModel(undefined)).toBeNull()
  })

  it('meta em andamento: percentual, faltam e por dia útil', () => {
    const model = goalCardModel(goal({}))
    expect(model?.pct).toBe(40)
    expect(model?.line).toContain('Faltam')
    expect(model?.line).toContain('30.000')
    expect(model?.line).toContain('por dia útil')
    expect(model?.hint).toContain('8.000')
  })

  it('por dia útil zerado some da linha; lateCoverage zerada some do hint', () => {
    const model = goalCardModel(goal({ perBusinessDay: '0.00', lateCoverage: '0.00' }))
    expect(model?.line).not.toContain('por dia útil')
    expect(model?.hint).toBeNull()
  })

  it('gap zerado vira "Meta batida" com o vendido', () => {
    const model = goalCardModel(goal({ soldAmount: '52000.00', gap: '0.00' }))
    expect(model?.pct).toBe(100)
    expect(model?.line).toContain('Meta batida')
    expect(model?.line).toContain('52.000')
    expect(model?.hint).toBeNull()
  })

  it('sem gap informado, calcula a diferença', () => {
    const model = goalCardModel(goal({ gap: null, perBusinessDay: null, lateCoverage: null }))
    expect(model?.line).toContain('30.000')
  })
})

describe('stopMetaLine / formatDistanceM', () => {
  it('formata metros e quilômetros em PT', () => {
    expect(formatDistanceM(850)).toBe('850 m')
    expect(formatDistanceM(2400)).toBe('2,4 km')
    expect(formatDistanceM(2000)).toBe('2 km')
  })

  it('monta "08:30 · 2,4 km · 6 min" e omite o que falta', () => {
    expect(stopMetaLine({ plannedTime: '08:30', distFromPrevM: 2400, etaMin: 6 })).toBe(
      '08:30 · 2,4 km · 6 min'
    )
    expect(stopMetaLine({ plannedTime: '08:00', distFromPrevM: null, etaMin: null })).toBe('08:00')
  })

  it('sem hora prevista não há linha', () => {
    expect(stopMetaLine({ plannedTime: null, distFromPrevM: 500, etaMin: 3 })).toBeNull()
  })
})

describe('offerSuffix / stockLabel', () => {
  it('sufixo por origem da sugestão', () => {
    expect(offerSuffix('usual')).toBe('')
    expect(offerSuffix('ask_about_cut')).toContain('perguntar')
    expect(offerSuffix('cross_sell')).toContain('pares compram')
  })

  it('rótulo do estoque diz a origem', () => {
    expect(
      stockLabel({ productCode: 'P1', saldo: '120.000', local: null, source: 'live', checkedAt: '' })
    ).toBe('Estoque: 120 (ao vivo)')
    expect(
      stockLabel({ productCode: 'P1', saldo: '7.5', local: '01', source: 'sync', checkedAt: '' })
    ).toBe('Estoque: 7,5 · 01 (do sync)')
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
    // Snapshot da Fase 1: sem perfil nem cross-sell
    expect(lines).toHaveLength(4)
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

  it('perfil RFM e cross-sell entram no fim quando o snapshot os tem', () => {
    const lines = beforeEnterLines({
      ...baseSignals,
      rfmSegment: 'CHAMPION',
      crossSell: [
        { productCode: 'A', productDesc: 'Produto A', peersPct: 62 },
        { productCode: 'B', productDesc: null, peersPct: 45 },
      ],
    })
    expect(lines[4]).toBe('Perfil: Campeão')
    expect(lines[5]).toBe('Pares compram: Produto A, B')
  })

  it('rfmSegment null e crossSell vazio não geram linhas', () => {
    const lines = beforeEnterLines({ ...baseSignals, rfmSegment: null, crossSell: [] })
    expect(lines).toHaveLength(4)
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
