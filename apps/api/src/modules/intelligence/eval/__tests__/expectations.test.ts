import { describe, it, expect } from 'vitest'
import type { CustomerFacts } from '../../agent/facts'
import { briefingExpectationViolations, evalApproved, situationFor } from '../expectations'

const facts = (over: Partial<CustomerFacts> = {}): CustomerFacts => ({
  pseudonym: 'C1',
  status: 'LATE',
  confidence: 'HIGH',
  cycleDays: 28,
  daysSinceLastPurchase: 41,
  orders12m: 10,
  avgTicket: '1500.00',
  trendPct: null,
  usualMix: [],
  cutMix: [{ productCode: 'PA0002', productDesc: 'Açúcar refinado' }],
  openTitles: { count: 1, totalBalance: '900.00', maxDaysOverdue: 35 },
  reasons: [],
  city: null,
  ...over,
})

const output = (over: Partial<Record<string, string>> = {}) => ({
  whatHappened: 'C1 parou de levar Açúcar refinado.',
  whyItMatters: 'Era item fixo.',
  whatToDo: 'Pergunte pelo açúcar refinado.',
  confidence: 'Alta: 10 pedidos no ano.',
  ...over,
})

describe('briefingExpectationViolations (plano 012)', () => {
  it('caso bom passa', () => {
    expect(briefingExpectationViolations(output(), facts(), { status: 'LATE', hasCutMix: true })).toEqual([])
  })

  it('bloqueado sem falar da pendência reprova', () => {
    const v = briefingExpectationViolations(
      output({ whatToDo: 'Faça uma visita de relacionamento.' }),
      facts({ status: 'BLOCKED' }),
      { status: 'BLOCKED', hasCutMix: false }
    )
    expect(v).toEqual(['bloqueado sem orientação de resolver a pendência'])
  })

  it('bloqueado que manda resolver o título passa', () => {
    const v = briefingExpectationViolations(
      output({ whatToDo: 'Resolva o título vencido com o financeiro antes de entrar.' }),
      facts({ status: 'BLOCKED' }),
      { status: 'BLOCKED', hasCutMix: false }
    )
    expect(v).toEqual([])
  })

  it('mix cortado não citado reprova; citar o código também vale', () => {
    expect(
      briefingExpectationViolations(
        output({ whatHappened: 'Compra caiu.', whatToDo: 'Visite.' }),
        facts(),
        { status: 'LATE', hasCutMix: true }
      )
    ).toEqual(['mix cortado não citado'])
    expect(
      briefingExpectationViolations(
        output({ whatHappened: 'Saiu o PA0002.', whatToDo: 'Visite.' }),
        facts(),
        { status: 'LATE', hasCutMix: true }
      )
    ).toEqual([])
  })

  it('novo com confiança alta reprova; "baixa" passa', () => {
    const newFacts = facts({ status: 'NEW', cutMix: [] })
    expect(
      briefingExpectationViolations(output(), newFacts, { status: 'NEW', hasCutMix: false })
    ).toEqual(['confiança alta para cliente novo'])
    expect(
      briefingExpectationViolations(output({ confidence: 'Baixa: 2 pedidos.' }), newFacts, {
        status: 'NEW',
        hasCutMix: false,
      })
    ).toEqual([])
  })
})

describe('situationFor', () => {
  it('situação coerente com o status', () => {
    expect(situationFor('INACTIVE', 0)).toBe('REACTIVATE')
    expect(situationFor('LATE', 0)).toBe('WENT_QUIET')
    expect(situationFor('ON_CYCLE', 0)).toBe('STALLED_PROPOSAL')
  })
})

describe('evalApproved', () => {
  const base = { total: 10, passedFirst: 10, passedRetry: 0, failed: 0, skipped: 0, blockedFailed: 0 }

  it('tudo de primeira aprova', () => {
    expect(evalApproved(base)).toBe(true)
  })

  it('uma falha em BLOCKED reprova, mesmo com o resto perfeito', () => {
    expect(evalApproved({ ...base, passedFirst: 9, failed: 1, blockedFailed: 1 })).toBe(false)
  })

  it('menos de 90 % de primeira reprova', () => {
    expect(evalApproved({ ...base, passedFirst: 8, passedRetry: 2 })).toBe(false)
    expect(evalApproved({ ...base, passedFirst: 9, passedRetry: 1 })).toBe(true)
  })

  it('tudo SKIPPED não aprova — não testou nada', () => {
    expect(evalApproved({ ...base, passedFirst: 0, skipped: 10 })).toBe(false)
  })
})
