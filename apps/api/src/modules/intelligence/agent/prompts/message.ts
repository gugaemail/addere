// Prompt "Mensagem" (E6, doc §5.1): WhatsApp curto com motivo real + pergunta.
import type { MessageFacts } from '../facts'

export const MESSAGE_SCHEMA = {
  type: 'object',
  properties: {
    text: {
      type: 'string',
      description:
        'Mensagem de WhatsApp curta (máx. 400 caracteres), com motivo real do contato e UMA pergunta no fim',
    },
  },
  required: ['text'],
  additionalProperties: false,
} as const

export interface MessageOutput {
  text: string
}

const SITUATION_PT: Record<MessageFacts['situation'], string> = {
  STALLED_PROPOSAL: 'proposta parada — retomar sem pressionar',
  WENT_QUIET: 'cliente sumiu — reabrir conversa citando o padrão de compra',
  REACTIVATE: 'reativação — cliente inativo há tempo, reapresentar-se',
}

export function buildMessagePrompt(facts: MessageFacts): string {
  return [
    `Escreva UMA mensagem de WhatsApp (${facts.tone === 'formal' ? 'tom formal, "senhor/senhora"' : 'tom informal, "você"'}).`,
    `Situação: ${SITUATION_PT[facts.situation]}.`,
    'Use o motivo real dos fatos (ciclo, mix cortado, tempo sem compra). Sem "passando para lembrar".',
    'A mensagem é PARA o cliente: fale com ele em segunda pessoa ("você", "seu pedido").',
    'Use o pseudônimo (C1) só na saudação ("Oi, C1!") — o app troca pelo nome depois. Nunca "o C1" no meio do texto.',
    'Produto: pode reescrever a descrição em letra normal, mas nunca mude medida, número ou código.',
    'Nada de termo interno (ticket, ciclo de compra, status, segmento). Termine com uma pergunta.',
    'Não inclua a linha de frescor nesta mensagem (vai por fora).',
    '',
    'FATOS:',
    JSON.stringify(facts),
  ].join('\n')
}
