import { describe, it, expect } from 'vitest'
import { engineShareAlarm, summarizeAgentCalls, type CallRow } from '../call-stats'

const NOW = new Date('2026-10-14T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000)
const row = (over: Partial<CallRow>): CallRow => ({
  kind: 'briefing',
  source: 'llm',
  reason: null,
  createdAt: hoursAgo(1),
  ...over,
})

describe('summarizeAgentCalls', () => {
  it('separa 24 h de 7 dias e descarta o que é mais velho', () => {
    const [briefing] = summarizeAgentCalls(
      [
        row({}),
        row({ source: 'cache' }),
        row({ source: 'engine', reason: 'daily_cap', createdAt: hoursAgo(48) }),
        row({ createdAt: hoursAgo(24 * 8) }), // fora da janela
      ],
      NOW
    )
    expect(briefing.last24h).toEqual({ calls: 2, llm: 1, cache: 1, engine: 0 })
    expect(briefing.last7d).toEqual({ calls: 3, llm: 1, cache: 1, engine: 1 })
    expect(briefing.topReasons).toEqual([{ reason: 'daily_cap', count: 1 }])
  })

  it('um bloco por tipo, em ordem alfabética, até 3 motivos do mais comum ao menos', () => {
    const rows = [
      row({ kind: 'today', source: 'engine', reason: 'a' }),
      row({ kind: 'today', source: 'engine', reason: 'b' }),
      row({ kind: 'today', source: 'engine', reason: 'b' }),
      row({ kind: 'today', source: 'engine', reason: 'c' }),
      row({ kind: 'today', source: 'engine', reason: 'd' }),
      row({ kind: 'message' }),
    ]
    const result = summarizeAgentCalls(rows, NOW)
    expect(result.map((r) => r.kind)).toEqual(['message', 'today'])
    expect(result[1].topReasons).toEqual([
      { reason: 'b', count: 2 },
      { reason: 'a', count: 1 },
      { reason: 'c', count: 1 },
    ])
  })
})

describe('engineShareAlarm', () => {
  const many = (n: number, over: Partial<CallRow>) => Array.from({ length: n }, () => row(over))

  it('poucas chamadas não disparam, mesmo todas em só-motor', () => {
    expect(engineShareAlarm(many(9, { source: 'engine', reason: 'x' }), NOW)).toBeNull()
  })

  it('mais da metade em só-motor nas 24 h dispara, com os motivos', () => {
    const alarm = engineShareAlarm(
      [...many(8, { source: 'engine', reason: 'facts_leak' }), ...many(4, {})],
      NOW
    )
    expect(alarm).toEqual({ calls: 12, engine: 8, reasons: { facts_leak: 8 } })
  })

  it('metade exata não dispara; chamadas de ontem não contam', () => {
    expect(
      engineShareAlarm([...many(6, { source: 'engine', reason: 'x' }), ...many(6, {})], NOW)
    ).toBeNull()
    expect(
      engineShareAlarm(many(20, { source: 'engine', reason: 'x', createdAt: hoursAgo(30) }), NOW)
    ).toBeNull()
  })

  it('LLM desligado de propósito (llm_off) não é alarme', () => {
    expect(engineShareAlarm(many(20, { source: 'engine', reason: 'llm_off' }), NOW)).toBeNull()
  })

  it('orçamento do mês atingido é pausa de propósito, não alarme', () => {
    expect(
      engineShareAlarm(many(20, { source: 'engine', reason: 'monthly_budget' }), NOW)
    ).toBeNull()
  })
})
