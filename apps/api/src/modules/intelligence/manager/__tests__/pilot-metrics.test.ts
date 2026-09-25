// As 3 métricas do piloto (E8) sobre fixtures.
import { describe, expect, it } from 'vitest'
import { buildPilotMetrics, type PilotMetricsInput } from '../pilot-metrics'

const base = (over: Partial<PilotMetricsInput> = {}): PilotMetricsInput => ({
  fromYmd: '20260801',
  toYmd: '20260831',
  portfolioKeys: ['C1|01', 'C2|01', 'C3|01', 'C4|01'],
  suggestions: [],
  outOfPlanVisits: [],
  purchases: [],
  conversionDays: 7,
  ...over,
})

describe('positivação da carteira', () => {
  it('conta cliente que comprou dentro da janela', () => {
    const metrics = buildPilotMetrics(
      base({
        purchases: [
          { ymd: '20260805', customerKey: 'C1|01' },
          { ymd: '20260820', customerKey: 'C2|01' },
        ],
      })
    )
    expect(metrics.portfolioPositivation).toEqual({ total: 4, hits: 2, pct: 50 })
  })

  it('compra fora da janela não positiva', () => {
    const metrics = buildPilotMetrics(
      base({ purchases: [{ ymd: '20260731', customerKey: 'C1|01' }] })
    )
    expect(metrics.portfolioPositivation.hits).toBe(0)
  })

  it('carteira duplicada não infla o denominador', () => {
    const metrics = buildPilotMetrics(base({ portfolioKeys: ['C1|01', 'C1|01', 'C2|01'] }))
    expect(metrics.portfolioPositivation.total).toBe(2)
  })

  it('carteira vazia devolve percentual nulo, não zero', () => {
    expect(buildPilotMetrics(base({ portfolioKeys: [] })).portfolioPositivation.pct).toBeNull()
  })
})

describe('conversão sugestão→pedido', () => {
  it('conta compra dentro dos 7 dias e descarta a de fora', () => {
    const metrics = buildPilotMetrics(
      base({
        suggestions: [
          { ymd: '20260803', customerKey: 'C1|01', statusAtTime: 'LATE' },
          { ymd: '20260803', customerKey: 'C2|01', statusAtTime: 'LATE' },
        ],
        purchases: [
          { ymd: '20260810', customerKey: 'C1|01' }, // 7º dia — entra
          { ymd: '20260811', customerKey: 'C2|01' }, // 8º dia — fica de fora
        ],
      })
    )
    expect(metrics.suggestionConversion).toEqual({ total: 2, hits: 1, pct: 50 })
  })

  it('cliente sugerido duas vezes conta uma, pela sugestão mais antiga', () => {
    const metrics = buildPilotMetrics(
      base({
        suggestions: [
          { ymd: '20260820', customerKey: 'C1|01', statusAtTime: 'LATE' },
          { ymd: '20260803', customerKey: 'C1|01', statusAtTime: 'LATE' },
        ],
        purchases: [{ ymd: '20260806', customerKey: 'C1|01' }],
      })
    )
    expect(metrics.suggestionConversion).toEqual({ total: 1, hits: 1, pct: 100 })
  })

  it('compra anterior à sugestão não conta como conversão', () => {
    const metrics = buildPilotMetrics(
      base({
        suggestions: [{ ymd: '20260810', customerKey: 'C1|01', statusAtTime: 'LATE' }],
        purchases: [{ ymd: '20260809', customerKey: 'C1|01' }],
      })
    )
    expect(metrics.suggestionConversion.hits).toBe(0)
  })
})

describe('comparação com a visita fora do plano', () => {
  it('cliente que também foi sugerido sai do grupo de comparação', () => {
    const metrics = buildPilotMetrics(
      base({
        suggestions: [{ ymd: '20260803', customerKey: 'C1|01', statusAtTime: 'LATE' }],
        outOfPlanVisits: [
          { ymd: '20260804', customerKey: 'C1|01' }, // já é sugerido — não conta duas vezes
          { ymd: '20260804', customerKey: 'C3|01' },
        ],
        purchases: [
          { ymd: '20260805', customerKey: 'C1|01' },
          { ymd: '20260806', customerKey: 'C3|01' },
        ],
      })
    )
    expect(metrics.suggestionConversion).toEqual({ total: 1, hits: 1, pct: 100 })
    expect(metrics.outOfPlanConversion).toEqual({ total: 1, hits: 1, pct: 100 })
  })

  it('lift é a diferença em pontos percentuais', () => {
    const metrics = buildPilotMetrics(
      base({
        suggestions: [
          { ymd: '20260803', customerKey: 'C1|01', statusAtTime: 'LATE' },
          { ymd: '20260803', customerKey: 'C2|01', statusAtTime: 'LATE' },
        ],
        outOfPlanVisits: [
          { ymd: '20260803', customerKey: 'C3|01' },
          { ymd: '20260803', customerKey: 'C4|01' },
        ],
        purchases: [
          { ymd: '20260804', customerKey: 'C1|01' },
          { ymd: '20260804', customerKey: 'C2|01' },
          { ymd: '20260804', customerKey: 'C3|01' },
        ],
      })
    )
    expect(metrics.suggestionConversion.pct).toBe(100)
    expect(metrics.outOfPlanConversion.pct).toBe(50)
    expect(metrics.liftPp).toBe(50)
  })

  it('sem grupo de comparação, o lift é nulo em vez de enganoso', () => {
    const metrics = buildPilotMetrics(
      base({
        suggestions: [{ ymd: '20260803', customerKey: 'C1|01', statusAtTime: 'LATE' }],
        purchases: [{ ymd: '20260804', customerKey: 'C1|01' }],
      })
    )
    expect(metrics.outOfPlanConversion.pct).toBeNull()
    expect(metrics.liftPp).toBeNull()
  })
})

describe('recuperação de AT_RISK', () => {
  it('só conta quem estava em risco na hora da sugestão', () => {
    const metrics = buildPilotMetrics(
      base({
        suggestions: [
          { ymd: '20260803', customerKey: 'C1|01', statusAtTime: 'AT_RISK' },
          { ymd: '20260803', customerKey: 'C2|01', statusAtTime: 'AT_RISK' },
          { ymd: '20260803', customerKey: 'C3|01', statusAtTime: 'LATE' },
        ],
        purchases: [
          { ymd: '20260805', customerKey: 'C1|01' },
          { ymd: '20260805', customerKey: 'C3|01' },
        ],
      })
    )
    expect(metrics.atRiskRecovery).toEqual({ total: 2, hits: 1, pct: 50 })
  })

  it('sem ninguém em risco, o percentual é nulo', () => {
    expect(buildPilotMetrics(base()).atRiskRecovery.pct).toBeNull()
  })
})
