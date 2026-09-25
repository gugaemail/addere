// RFM e cross-sell (E19, doc §4.1) — puro, dentro da carteira do vendedor.
// Quintis só fazem sentido com carteira grande: abaixo de RFM_MIN_CUSTOMERS
// tudo sai null e o app mostra a carteira só por status.
import type { RfmSegment } from '@addere/types'

export const RFM_MIN_CUSTOMERS = 30

export interface RfmInput {
  key: string // `${customerCode}|${loja}`
  daysSinceLastPurchase: number | null // null = nunca comprou nos 12m
  orders12m: number
  amount12m: number
}

export interface RfmScore {
  key: string
  r: number // 1..5 (5 = mais recente)
  f: number // 1..5 (5 = mais frequente)
  m: number // 1..5 (5 = mais valor)
  segment: RfmSegment
}

/** Quintil 1..5 de `value` dentro de `sorted` (ascendente). Empates recebem o mesmo quintil. */
export function quintile(value: number, sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 1
  // Posição do primeiro elemento maior que o valor (rank estável para empates)
  let below = 0
  for (const v of sortedAsc) {
    if (v < value) below++
    else break
  }
  const pct = below / sortedAsc.length
  return Math.min(5, Math.floor(pct * 5) + 1)
}

export function segmentFor(r: number, f: number, m: number): RfmSegment {
  const fm = (f + m) / 2
  if (r >= 4 && fm >= 4) return 'CHAMPION'
  if (r >= 3 && fm >= 4) return 'LOYAL'
  if (r >= 4 && fm < 3) return 'PROMISING'
  if (r <= 2 && fm >= 4) return 'AT_RISK'
  if (r <= 2 && fm >= 2) return 'HIBERNATING'
  if (r <= 1 && fm < 2) return 'LOST'
  return 'NEED_ATTENTION'
}

export function computeRfm(customers: RfmInput[]): Map<string, RfmScore> {
  const result = new Map<string, RfmScore>()
  const buyers = customers.filter((c) => c.orders12m > 0 && c.daysSinceLastPurchase !== null)
  if (buyers.length < RFM_MIN_CUSTOMERS) return result

  // Recência: menos dias = melhor → invertemos para o quintil alto ser o recente
  const recencyAsc = buyers.map((c) => -(c.daysSinceLastPurchase as number)).sort((a, b) => a - b)
  const frequencyAsc = buyers.map((c) => c.orders12m).sort((a, b) => a - b)
  const amountAsc = buyers.map((c) => c.amount12m).sort((a, b) => a - b)

  for (const customer of buyers) {
    const r = quintile(-(customer.daysSinceLastPurchase as number), recencyAsc)
    const f = quintile(customer.orders12m, frequencyAsc)
    const m = quintile(customer.amount12m, amountAsc)
    result.set(customer.key, { key: customer.key, r, f, m, segment: segmentFor(r, f, m) })
  }
  return result
}

// ─── Cross-sell ───

export interface CrossSellInput {
  key: string
  /** Grupo de pares: segmento do cadastro ou, sem ele, o segmento RFM */
  peerGroup: string | null
  products: Set<string> // códigos comprados em 12m
}

export interface CrossSellSuggestion {
  productCode: string
  productDesc: string | null
  peersPct: number // % dos pares que compram o produto
}

const CROSS_SELL_MAX = 3
const PEER_GROUP_MIN = 5

/**
 * Para cada cliente: produtos que ≥ minPct% dos pares do mesmo grupo compram e
 * ele nunca comprou (12m). Grupos pequenos (< 5) não geram sugestão — a
 * "penetração" de 2 em 3 não diz nada.
 */
export function computeCrossSell(
  customers: CrossSellInput[],
  productDesc: Map<string, string | null>,
  minPct: number
): Map<string, CrossSellSuggestion[]> {
  const result = new Map<string, CrossSellSuggestion[]>()
  const groups = new Map<string, CrossSellInput[]>()
  for (const customer of customers) {
    if (!customer.peerGroup) continue
    const list = groups.get(customer.peerGroup) ?? []
    list.push(customer)
    groups.set(customer.peerGroup, list)
  }

  for (const members of groups.values()) {
    if (members.length < PEER_GROUP_MIN) continue
    const penetration = new Map<string, number>()
    for (const member of members) {
      for (const code of member.products) penetration.set(code, (penetration.get(code) ?? 0) + 1)
    }
    const popular = [...penetration.entries()]
      .map(([code, count]) => ({ code, pct: Math.round((count / members.length) * 100) }))
      .filter((p) => p.pct >= minPct)
      .sort((a, b) => b.pct - a.pct || a.code.localeCompare(b.code))

    for (const member of members) {
      const suggestions = popular
        .filter((p) => !member.products.has(p.code))
        .slice(0, CROSS_SELL_MAX)
        .map((p) => ({
          productCode: p.code,
          productDesc: productDesc.get(p.code) ?? null,
          peersPct: p.pct,
        }))
      if (suggestions.length > 0) result.set(member.key, suggestions)
    }
  }
  return result
}

export const RFM_SEGMENT_LABELS: Record<RfmSegment, string> = {
  CHAMPION: 'Campeão',
  LOYAL: 'Fiel',
  PROMISING: 'Promissor',
  NEED_ATTENTION: 'Precisa de atenção',
  AT_RISK: 'Valioso em risco',
  HIBERNATING: 'Hibernando',
  LOST: 'Perdido',
}
