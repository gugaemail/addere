// Prompt "Antes de entrar" (E6, doc §5.1): ficha de 3 linhas + confiança.
import type { CustomerFacts } from '../facts'

export const BRIEFING_SCHEMA = {
  type: 'object',
  properties: {
    whatHappened: { type: 'string', description: 'O que aconteceu — 1 frase com o fato central' },
    whyItMatters: { type: 'string', description: 'Por que importa — 1 frase' },
    whatToDo: { type: 'string', description: 'O que fazer na visita — 1 frase acionável' },
    confidence: {
      type: 'string',
      description: 'Confiança dos sinais em 1 frase curta (alta/média/baixa e por quê)',
    },
  },
  required: ['whatHappened', 'whyItMatters', 'whatToDo', 'confidence'],
  additionalProperties: false,
} as const

export interface BriefingOutput {
  whatHappened: string
  whyItMatters: string
  whatToDo: string
  confidence: string
}

export function buildBriefingPrompt(facts: {
  customers: CustomerFacts[]
  freshness: { lastSyncAt: string | null }
}): string {
  return [
    'Gere a ficha "antes de entrar" do cliente abaixo no formato fixo',
    'O que aconteceu / Por que importa / O que fazer / Confiança.',
    'Uma frase por campo. Se houver mix cortado, mencione o produto.',
    'Se o status for BLOCKED, o "o que fazer" é resolver a pendência — nunca vender.',
    '',
    'FATOS:',
    JSON.stringify(facts),
  ].join('\n')
}
