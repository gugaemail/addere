// Textos determinísticos das telas da Inteligência (E13) — puros e testados.
// São o fallback quando o agente LLM não respondeu (ou está desligado).
import type { SignalsSnapshot, VisitPlanDto } from '@addere/types'

export function confidenceLabel(confidence: SignalsSnapshot['confidence']): string {
  switch (confidence) {
    case 'HIGH':
      return 'alta confiança (histórico consistente)'
    case 'MEDIUM':
      return 'confiança média (poucos pedidos no histórico)'
    case 'LOW':
      return 'baixa confiança (cliente com pouco histórico)'
  }
}

const fmtBRL = (value: string | null): string | null => {
  if (value === null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

/** Frase do card do plano quando não há llmSummary (fallback só-motor) */
export function planFallbackLine(plan: {
  itemsCount: number
  lateCount: number
  expectedAmount: string | null
}): string {
  const parts = [`${plan.itemsCount} visita(s) sugeridas para hoje`]
  if (plan.lateCount > 0) parts.push(`${plan.lateCount} cliente(s) atrasados ou em risco`)
  const expected = fmtBRL(plan.expectedAmount)
  if (expected) parts.push(`${expected} esperados se nada mudar`)
  return parts.join(' · ')
}

/** Linhas do "Antes de entrar" montadas do snapshot (sempre disponível offline) */
export function beforeEnterLines(signals: SignalsSnapshot): string[] {
  const lines: string[] = []
  if (signals.daysSinceLastPurchase !== null) {
    const cycle = signals.cycleDays !== null ? ` (ciclo de ~${signals.cycleDays} dias)` : ''
    lines.push(`Última compra há ${signals.daysSinceLastPurchase} dias${cycle}.`)
  }
  const ticket = fmtBRL(signals.avgTicket)
  if (ticket) {
    const trend =
      signals.trendPct !== null && signals.trendPct !== 0
        ? signals.trendPct > 0
          ? `, comprando ${signals.trendPct}% mais que a média do ano`
          : `, comprando ${Math.abs(signals.trendPct)}% menos que a média do ano`
        : ''
    lines.push(`Ticket médio de ${ticket} em ${signals.orders12m} pedido(s) nos últimos 12 meses${trend}.`)
  }
  if (signals.openTitles.count > 0) {
    const overdue =
      signals.openTitles.maxDaysOverdue !== null && signals.openTitles.maxDaysOverdue > 0
        ? ` — o mais antigo vencido há ${signals.openTitles.maxDaysOverdue} dias`
        : ''
    lines.push(
      `${signals.openTitles.count} título(s) em aberto somando ${fmtBRL(signals.openTitles.totalBalance) ?? signals.openTitles.totalBalance}${overdue}.`
    )
  }
  if (signals.cutMix.length > 0) {
    const names = signals.cutMix.slice(0, 3).map((p) => p.productDesc ?? p.productCode)
    lines.push(`Parou de levar: ${names.join(', ')} — vale perguntar o motivo.`)
  }
  if (lines.length === 0) lines.push('Cliente novo na carteira — ainda sem histórico calculado.')
  return lines
}

/** Fallback local da mensagem quando a API está inacessível (offline) */
export function localMessageFallback(
  template: 'STALLED_PROPOSAL' | 'WENT_QUIET' | 'REACTIVATE',
  customerName: string,
  signals?: Pick<SignalsSnapshot, 'daysSinceLastPurchase' | 'cycleDays'> | null
): string {
  const first = customerName.split(' ')[0]
  switch (template) {
    case 'STALLED_PROPOSAL':
      return `Oi, ${first}! Ficou alguma dúvida sobre a última proposta que te mandei? Consigo ajustar o que precisar — me diz o que achou.`
    case 'WENT_QUIET': {
      const days = signals?.daysSinceLastPurchase
      const cycle = signals?.cycleDays
      return `Oi, ${first}! ${days ? `Sua última compra foi há ${days} dias` : 'Faz um tempo desde seu último pedido'}${cycle ? ` — normalmente você repõe a cada ${cycle} dias` : ''}. Precisa repor algo? Posso montar o pedido. Que dia fica bom?`
    }
    case 'REACTIVATE':
      return `Oi, ${first}! Aqui é da equipe comercial — sentimos sua falta por aqui. Temos novidades no mix que costumava levar. Posso passar aí essa semana para retomarmos?`
  }
}

/** Endereços das paradas ativas, na ordem do ranking (rota completa) */
export function activeAddresses(plan: VisitPlanDto | null | undefined): string[] {
  if (!plan) return []
  return plan.items
    .filter((i) => !i.removedAt && i.customerAddress)
    .map((i) => i.customerAddress as string)
}
