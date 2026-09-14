// Carteira do vendedor (E19) — filtro e textos puros da tela, testados.
import type { CustomerSignalListItem, CustomerStatus, RfmSegment } from '@addere/types'

export interface PortfolioFilter {
  /** Vazio = todos os status */
  statuses: CustomerStatus[]
  /** Vazio = todos os segmentos */
  rfm: RfmSegment[]
}

export const LATE_FILTER: CustomerStatus[] = ['LATE', 'AT_RISK']

/** Interseção dos dois eixos; lista vazia em um eixo não filtra aquele eixo */
export function filterPortfolio(
  items: CustomerSignalListItem[],
  filter: PortfolioFilter
): CustomerSignalListItem[] {
  const byStatus = filter.statuses.length > 0 ? new Set(filter.statuses) : null
  const byRfm = filter.rfm.length > 0 ? new Set(filter.rfm) : null
  return items.filter((item) => {
    if (byStatus && !byStatus.has(item.status)) return false
    if (byRfm && (!item.rfmSegment || !byRfm.has(item.rfmSegment))) return false
    return true
  })
}

/** "R$ 850", "R$ 12 mil", "R$ 1,2 mi" — para o CTA "Só atrasados" */
export function fmtBRLCompact(value: string | number): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return 'R$ —'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) {
    return `${sign}R$ ${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  }
  if (abs >= 1_000) {
    return `${sign}R$ ${Math.round(abs / 1_000).toLocaleString('pt-BR')} mil`
  }
  return `${sign}R$ ${Math.round(abs).toLocaleString('pt-BR')}`
}

/** "R$ 12 mil dá para recuperar" — null quando não há nada a recuperar */
export function lateRecoveryLine(lateAmount: string | null | undefined): string | null {
  const n = Number(lateAmount)
  if (!Number.isFinite(n) || n <= 0) return null
  return `${fmtBRLCompact(n)} dá para recuperar`
}

/** "última compra há 32 dias · ciclo ~20 dias · 14 pedidos/12m" — null sem nada */
export function customerMetaLine(
  item: Pick<CustomerSignalListItem, 'daysSinceLastPurchase' | 'cycleDays' | 'orders12m'>
): string | null {
  const parts: string[] = []
  if (item.daysSinceLastPurchase !== null) {
    parts.push(`última compra há ${item.daysSinceLastPurchase} dias`)
  }
  if (item.cycleDays !== null) parts.push(`ciclo ~${item.cycleDays} dias`)
  if (item.orders12m > 0) parts.push(`${item.orders12m} pedido${item.orders12m === 1 ? '' : 's'}/12m`)
  return parts.length > 0 ? parts.join(' · ') : null
}

export interface TrendModel {
  direction: 'up' | 'down' | 'flat'
  text: string
}

/** Tendência de compra: "+12%" / "-8%" / "estável" — null sem dado */
export function trendModel(trendPct: number | null | undefined): TrendModel | null {
  if (trendPct === null || trendPct === undefined || !Number.isFinite(trendPct)) return null
  const rounded = Math.round(trendPct)
  if (rounded === 0) return { direction: 'flat', text: 'estável' }
  return rounded > 0
    ? { direction: 'up', text: `+${rounded}%` }
    : { direction: 'down', text: `${rounded}%` }
}

/** "3 sugestões de cross-sell" — null quando zero */
export function crossSellLine(count: number): string | null {
  if (!count || count <= 0) return null
  return `${count} sugest${count === 1 ? 'ão' : 'ões'} de cross-sell`
}
