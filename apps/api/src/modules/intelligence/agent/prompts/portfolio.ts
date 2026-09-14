// Prompt "Carteira" (E19, doc §5.1): 3 ações para a carteira do vendedor.
import type { CustomerFacts, GoalFacts } from '../facts'

export const PORTFOLIO_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description: 'Leitura da carteira em 2-3 frases (quem sustenta a meta, quem está escorregando)',
    },
    actions: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 3,
      description: 'Até 3 ações concretas para esta semana, cada uma citando o pseudônimo do cliente',
    },
  },
  required: ['summary', 'actions'],
  additionalProperties: false,
} as const

export interface PortfolioOutput {
  summary: string
  actions: string[]
}

export interface PortfolioFacts {
  date: string
  goal: GoalFacts | null
  /** Contagem por status e por segmento RFM (só chaves permitidas) */
  counts: { status: string; count: number }[]
  /** Os clientes que mais pesam: maiores atrasados/em risco por ticket, até 12 */
  customers: CustomerFacts[]
  freshness: { lastSyncAt: string | null }
}

export function buildPortfolioPrompt(facts: PortfolioFacts): string {
  return [
    'Leia a carteira do vendedor a partir dos fatos abaixo.',
    'summary: 2-3 frases — o que sustenta a meta do mês e o que está escorregando (use as contagens).',
    'actions: até 3 ações para esta semana, cada uma citando o pseudônimo (C1, C2…) e o motivo dos fatos.',
    'Cliente BLOCKED nunca recebe ação de venda; a ação é resolver a pendência.',
    'Não cite números que não estejam nos fatos.',
    '',
    'FATOS:',
    JSON.stringify(facts),
  ].join('\n')
}
