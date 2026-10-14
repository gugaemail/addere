// Versão do prompt do agente (plano 012): hash de TUDO o que muda a resposta —
// skill, schemas, o texto de cada um dos seis prompts sobre um fixture fixo e
// o modelo. Era hash só do skill: trocar INTEL_LLM_MODEL, buildBriefingPrompt
// ou um schema dava a mesma versão, e o eval rodava como se nada tivesse mudado.
import { createHash } from 'node:crypto'
import { env } from '../../../lib/env'
import type { CustomerFacts, MessageFacts, TodayFacts } from './facts'
import { AGENT_SKILL } from './skill-prompt'
import { buildBriefingPrompt, BRIEFING_SCHEMA } from './prompts/briefing'
import { buildLossesPrompt, LOSSES_SCHEMA } from './prompts/losses'
import { buildMessagePrompt, MESSAGE_SCHEMA } from './prompts/message'
import { buildPortfolioPrompt, PORTFOLIO_SCHEMA } from './prompts/portfolio'
import { buildTodayPrompt, TODAY_SCHEMA } from './prompts/today'
import { buildWeekPrompt, WEEK_SCHEMA } from './prompts/week'

// Fixture fixo: só serve para pôr o texto de cada prompt no hash
const CUSTOMER: CustomerFacts = {
  pseudonym: 'C1',
  status: 'LATE',
  confidence: 'HIGH',
  cycleDays: 28,
  daysSinceLastPurchase: 41,
  orders12m: 10,
  avgTicket: '1500.00',
  trendPct: -30,
  usualMix: [{ productCode: 'P1', productDesc: 'Produto' }],
  cutMix: [],
  openTitles: { count: 0, totalBalance: '0.00', maxDaysOverdue: null },
  reasons: ['motivo'],
  city: 'Cidade',
}
const FRESHNESS = { lastSyncAt: '00:00' }
const TODAY: TodayFacts = {
  date: '20260101',
  grouping: null,
  goal: null,
  plan: [{ position: 1, pseudonym: 'C1', status: 'LATE', shortReason: null, expectedAmount: null }],
  freshness: FRESHNESS,
}
const MESSAGE: MessageFacts = {
  situation: 'WENT_QUIET',
  tone: 'informal',
  customers: [CUSTOMER],
  lastOrderDays: 41,
  freshness: FRESHNESS,
}

export function promptVersion(): string {
  const parts = [
    AGENT_SKILL,
    env.INTEL_LLM_MODEL,
    JSON.stringify([BRIEFING_SCHEMA, LOSSES_SCHEMA, MESSAGE_SCHEMA, PORTFOLIO_SCHEMA, TODAY_SCHEMA, WEEK_SCHEMA]),
    buildTodayPrompt(TODAY),
    buildWeekPrompt({ date: '20260101', goal: null, days: [], freshness: FRESHNESS }),
    buildBriefingPrompt({ customers: [CUSTOMER], freshness: FRESHNESS }),
    buildMessagePrompt(MESSAGE),
    buildPortfolioPrompt({ date: '20260101', goal: null, counts: [], customers: [CUSTOMER], freshness: FRESHNESS }),
    buildLossesPrompt({
      date: '20260101',
      totals: { baselineAmount: '0', currentAmount: '0', diffAmount: '0', diffPct: null },
      components: [],
      customers: [],
      products: [],
      freshness: FRESHNESS,
    }),
  ]
  return createHash('sha256').update(parts.join('\n\u0000\n')).digest('hex').slice(0, 8)
}
