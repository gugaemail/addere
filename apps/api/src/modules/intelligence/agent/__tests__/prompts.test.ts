import { describe, it, expect } from 'vitest'
import { buildTodayPrompt, TODAY_SCHEMA } from '../prompts/today'
import { buildBriefingPrompt, BRIEFING_SCHEMA } from '../prompts/briefing'
import { buildMessagePrompt, MESSAGE_SCHEMA } from '../prompts/message'
import { AGENT_SKILL } from '../skill-prompt'
import { promptVersion } from '../tenant-context'

const customer = {
  pseudonym: 'C1',
  status: 'LATE',
  cycleDays: 28,
  daysSinceLastPurchase: 41,
  orders12m: 10,
  avgTicket: '1500.00',
  trendPct: -30,
  usualMix: [{ productCode: 'CAFE', productDesc: 'Café torrado' }],
  cutMix: [{ productCode: 'ACUCAR', productDesc: 'Açúcar' }],
  openTitles: { count: 0, totalBalance: '0.00', maxDaysOverdue: null },
  reasons: ['Compra a cada 28 dias, está no dia 41'],
  city: 'Campinas',
}

describe('montagem de prompts (snapshot)', () => {
  it('today: instruções + fatos serializados + linha de frescor exigida', () => {
    const prompt = buildTodayPrompt({
      date: '20260821',
      grouping: 'Campinas',
      goal: { goalAmount: null, soldAmount: null, gap: '6000.00', perBusinessDay: null, lateCoverage: null },
      plan: [{ position: 1, pseudonym: 'C1', status: 'LATE', shortReason: 'motivo', expectedAmount: '750.00' }],
      freshness: { lastSyncAt: '03:12' },
    })
    expect(prompt).toMatchSnapshot()
    expect(prompt).toContain('"gap":"6000.00"')
    expect(prompt).toContain('Dados sincronizados: 03:12')
  })

  it('briefing: formato fixo de 4 campos', () => {
    const prompt = buildBriefingPrompt({ customers: [customer], freshness: { lastSyncAt: '03:12' } })
    expect(prompt).toMatchSnapshot()
    expect(BRIEFING_SCHEMA.required).toEqual(['whatHappened', 'whyItMatters', 'whatToDo', 'confidence'])
  })

  it('message: tom e situação em PT', () => {
    const prompt = buildMessagePrompt({
      situation: 'WENT_QUIET',
      tone: 'informal',
      customers: [customer],
      lastOrderDays: 41,
      freshness: { lastSyncAt: null },
    })
    expect(prompt).toMatchSnapshot()
    expect(prompt).toContain('sumiu')
    expect(prompt).toContain('informal')
  })

  it('schemas proíbem campos extras', () => {
    expect(TODAY_SCHEMA.additionalProperties).toBe(false)
    expect(MESSAGE_SCHEMA.additionalProperties).toBe(false)
  })

  it('promptVersion é hash estável do skill', () => {
    expect(promptVersion()).toMatch(/^[0-9a-f]{8}$/)
    expect(AGENT_SKILL).toContain('BLOCKED')
    expect(AGENT_SKILL).toContain('C1')
  })
})
