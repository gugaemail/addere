// Textos determinísticos das telas da Inteligência (E13/Fase 2) — puros e
// testados. São o fallback quando o agente LLM não respondeu (ou está desligado).
import type { SignalsSnapshot, StockDto, VisitPlanDto, VisitPlanItemDto } from '@addere/types'
import { rfmLabel } from './customerStatus'

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

const brl = (n: number): string =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const fmtBRL = (value: string | null): string | null => {
  if (value === null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return brl(n)
}

/** Decimal serializado ("1250.00") → número; null/vazio/inválido → null */
const toFinite = (value: string | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
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

export interface GoalCardModel {
  pct: number
  line: string
  hint: string | null
}

/**
 * Card "Meta do mês" da Hoje. Os valores chegam como string decimal — "0.00"
 * é truthy! — então só há card com meta numérica > 0, e gap zerado vira
 * "Meta batida" em vez de "Faltam R$ 0".
 */
export function goalCardModel(goal: VisitPlanDto['goal'] | undefined): GoalCardModel | null {
  if (!goal) return null
  const target = toFinite(goal.goalAmount)
  if (target === null || target <= 0) return null
  const sold = toFinite(goal.soldAmount) ?? 0
  const gap = toFinite(goal.gap) ?? Math.max(0, target - sold)
  const pct = Math.min(100, Math.max(0, Math.round((sold / target) * 100)))
  if (gap <= 0) return { pct, line: `Meta batida · Vendido ${brl(sold)}`, hint: null }
  const perDay = toFinite(goal.perBusinessDay) ?? 0
  const line = `Faltam ${brl(gap)}${perDay > 0 ? ` · ${brl(perDay)} por dia útil` : ''}`
  const late = toFinite(goal.lateCoverage) ?? 0
  const hint = late > 0 ? `Os clientes atrasados da sua carteira cobrem ${brl(late)} disso.` : null
  return { pct, line, hint }
}

/** "850 m" abaixo de 1 km; senão "2,4 km" (sem ",0" em números redondos) */
export function formatDistanceM(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`
}

/** Linha discreta da parada (E16): "08:30 · 2,4 km · 6 min" — null sem hora prevista */
export function stopMetaLine(
  item: Pick<VisitPlanItemDto, 'plannedTime' | 'distFromPrevM' | 'etaMin'>
): string | null {
  if (!item.plannedTime) return null
  const parts = [item.plannedTime]
  if (item.distFromPrevM !== null && item.distFromPrevM !== undefined) {
    parts.push(formatDistanceM(item.distFromPrevM))
  }
  if (item.etaMin !== null && item.etaMin !== undefined) parts.push(`${item.etaMin} min`)
  return parts.join(' · ')
}

/** Sufixo do item do mix sugerido conforme a origem da sugestão */
export function offerSuffix(source: 'usual' | 'ask_about_cut' | 'cross_sell'): string {
  switch (source) {
    case 'ask_about_cut':
      return ' — perguntar (cortado)'
    case 'cross_sell':
      return ' — pares compram'
    default:
      return ''
  }
}

/** "Estoque: 120 (ao vivo)" / "Estoque: 120 (do sync)" — E22 */
export function stockLabel(stock: StockDto): string {
  const n = Number(stock.saldo)
  const qty = Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : stock.saldo
  const local = stock.local ? ` · ${stock.local}` : ''
  return `Estoque: ${qty}${local} (${stock.source === 'live' ? 'ao vivo' : 'do sync'})`
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
  // Fase 2 (E19): snapshots gravados antes não têm os campos — só entram quando existem
  if (signals.rfmSegment) lines.push(`Perfil: ${rfmLabel(signals.rfmSegment)}`)
  if (signals.crossSell && signals.crossSell.length > 0) {
    const names = signals.crossSell.slice(0, 3).map((p) => p.productDesc ?? p.productCode)
    lines.push(`Pares compram: ${names.join(', ')}`)
  }
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
