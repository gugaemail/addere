// Prompt "Semana" (E18, doc §5.1): 2-3 frases sobre o plano da semana.
import type { GoalFacts } from '../facts'

export const WEEK_SCHEMA = {
  type: 'object',
  properties: {
    weekText: {
      type: 'string',
      description:
        'Resumo do plano da semana em 2-3 frases: quantas paradas, como os dias se dividem por cidade, quem não pode ficar de fora',
    },
  },
  required: ['weekText'],
  additionalProperties: false,
} as const

export interface WeekOutput {
  weekText: string
}

export interface WeekFacts {
  date: string // segunda-feira YYYYMMDD
  goal: GoalFacts | null
  days: {
    date: string // YYYYMMDD
    grouping: string | null
    count: number
    plan: { position: number; pseudonym: string; status: string; shortReason: string | null }[]
  }[]
  freshness: { lastSyncAt: string | null }
}

export function buildWeekPrompt(facts: WeekFacts): string {
  return [
    'Gere o resumo do plano da SEMANA do vendedor a partir dos fatos abaixo.',
    'weekText: 2-3 frases — total de paradas, como os dias se dividem (cidades) e 1-2 clientes que não podem ficar de fora (pseudônimos).',
    'Não cite números que não estejam nos fatos.',
    '',
    'FATOS:',
    JSON.stringify(facts),
  ].join('\n')
}
