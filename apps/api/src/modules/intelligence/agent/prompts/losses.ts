// Prompt "Onde estou perdendo" (E21, W2): leitura da decomposição para o gerente.
export const LOSSES_SCHEMA = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      description:
        'Leitura em 3-4 frases: onde está a maior parte da queda (clientes que pararam, compraram menos ou produtos), 2 clientes a agir primeiro (pseudônimos) e uma ação',
    },
  },
  required: ['text'],
  additionalProperties: false,
} as const

export interface LossesOutput {
  text: string
}

export interface LossesFacts {
  date: string
  totals: { baselineAmount: string; currentAmount: string; diffAmount: string; diffPct: number | null }
  components: { status: string; count: number; expectedAmount: string }[] // status = tipo do componente
  customers: { pseudonym: string; status: string; expectedAmount: string; reasons: string[] }[]
  products: { productCode: string; productDesc: string | null; trendPct: number | null }[]
  freshness: { lastSyncAt: string | null }
}

export function buildLossesPrompt(facts: LossesFacts): string {
  return [
    'Explique ao gerente comercial ONDE a receita está caindo, a partir dos fatos abaixo.',
    'text: 3-4 frases. Diga qual componente pesa mais (clientes que pararam, que compraram menos ou produtos em queda),',
    'aponte até 2 clientes por pseudônimo (C1, C2…) para agir primeiro e proponha UMA ação para o plano da semana.',
    'Cliente BLOCKED: a ação é resolver a pendência, nunca vender. Não cite números fora dos fatos.',
    '',
    'FATOS:',
    JSON.stringify(facts),
  ].join('\n')
}
