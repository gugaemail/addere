// Prompt "Hoje" (E6, doc §5.1): 1 frase para a home + texto do plano.
import type { TodayFacts } from '../facts'

export const TODAY_SCHEMA = {
  type: 'object',
  properties: {
    homeLine: {
      type: 'string',
      description: 'Uma frase para a home: o que importa hoje (meta + plano), máx. 140 caracteres',
    },
    planText: {
      type: 'string',
      description:
        'Resumo do plano do dia em 2-4 frases: por onde começar e por quê, terminando com a linha de frescor',
    },
  },
  required: ['homeLine', 'planText'],
  additionalProperties: false,
} as const

export interface TodayOutput {
  homeLine: string
  planText: string
}

export function buildTodayPrompt(facts: TodayFacts): string {
  return [
    'Gere o resumo "Hoje" do vendedor a partir dos fatos abaixo.',
    'homeLine: 1 frase com o essencial (gap da meta e/ou primeira visita).',
    'planText: 2-4 frases sobre o plano do dia (agrupamento, quem priorizar e por quê).',
    `A última linha de planText deve ser exatamente: "Dados sincronizados: ${facts.freshness.lastSyncAt ?? 'sem sincronização ainda'}".`,
    '',
    'FATOS:',
    JSON.stringify(facts),
  ].join('\n')
}
