// Pipeline de ranking do plano do dia (E5, doc §4.3):
// Source → Hydrator → Filter → Scorer → Selector. Puro e determinístico —
// empates quebram por customerCode para o mesmo input gerar o mesmo plano.
import type { CustomerStatus } from '@addere/types'
import type { EngineParameters } from './parameters'
import type { CustomerSignalResult } from './signals'

export interface RankableCustomer {
  customerCode: string
  loja: string
  city: string | null
  district: string | null
  signal: CustomerSignalResult
  /** Visitado nos últimos visited_cooldown_days (D8a) */
  visitedRecently: boolean
}

export interface RankedItem {
  customerCode: string
  loja: string
  status: CustomerStatus
  scoreValue: number
  scoreUrgency: number
  scoreRisk: number
  scoreTotal: number
  shortReason: string | null
  expectedAmount: number | null
  grouping: string | null
}

export interface RankingResult {
  /** Top-K do dia, já com diversidade e agrupamento aplicados */
  selected: RankedItem[]
  /** Seção "resolver": bloqueados relevantes (vão ao FIM do plano — DTO E7) */
  blocked: RankedItem[]
  grouping: string | null
}

const INACTIVE_REMOVAL_DAYS = 365 // filtro do doc: inativo > 12m sai do ranking
const round3 = (n: number) => Math.round(n * 1000) / 1000

function groupKey(customer: RankableCustomer, groupBy: 'city' | 'district'): string | null {
  const value = groupBy === 'district' ? (customer.district ?? customer.city) : customer.city
  return value?.trim() || null
}

function score(
  customer: RankableCustomer,
  maxTicketProb: number,
  params: EngineParameters
): Omit<RankedItem, 'grouping'> {
  const signal = customer.signal
  const ticketProb = (signal.avgTicket ?? 0) * signal.purchaseProb

  const scoreValue = maxTicketProb > 0 ? round3(ticketProb / maxTicketProb) : 0

  // Urgência: d/ciclo saturando em 2× (0..1); sem ciclo, não há urgência mensurável
  const scoreUrgency =
    signal.cycleDays !== null && signal.cycleDays > 0 && signal.daysSinceLastPurchase !== null
      ? round3(Math.min(signal.daysSinceLastPurchase / signal.cycleDays, 2) / 2)
      : 0

  const scoreRisk = signal.status === 'AT_RISK' ? 1 : signal.status === 'LATE' ? 0.5 : 0

  const scoreTotal = round3(
    (params.weight_value * scoreValue +
      params.weight_urgency * scoreUrgency +
      params.weight_risk * scoreRisk) /
      100
  )

  return {
    customerCode: customer.customerCode,
    loja: customer.loja,
    status: signal.status,
    scoreValue,
    scoreUrgency,
    scoreRisk,
    scoreTotal,
    shortReason: signal.reasons[0] ?? null,
    expectedAmount:
      signal.avgTicket === null ? null : Math.round(ticketProb * 100) / 100,
  }
}

const byScoreThenCode = (a: Omit<RankedItem, 'grouping'>, b: Omit<RankedItem, 'grouping'>) =>
  b.scoreTotal - a.scoreTotal || a.customerCode.localeCompare(b.customerCode)

/** Seleção top-K com diversidade: no máx. max_same_status_pct% do mesmo status. */
export function selectWithDiversity(
  sorted: Omit<RankedItem, 'grouping'>[],
  capacity: number,
  maxSameStatusPct: number
): Omit<RankedItem, 'grouping'>[] {
  const cap = Math.max(1, Math.ceil((capacity * maxSameStatusPct) / 100))
  const selected: Omit<RankedItem, 'grouping'>[] = []
  const byStatus = new Map<CustomerStatus, number>()
  const deferred: Omit<RankedItem, 'grouping'>[] = []

  for (const item of sorted) {
    if (selected.length >= capacity) break
    const count = byStatus.get(item.status) ?? 0
    if (count >= cap) {
      deferred.push(item)
      continue
    }
    selected.push(item)
    byStatus.set(item.status, count + 1)
  }
  // Sobrou vaga e só há candidatos além do teto? Melhor encher do que sair vazio
  for (const item of deferred) {
    if (selected.length >= capacity) break
    selected.push(item)
  }
  return selected
}

export function rankCustomers(
  customers: RankableCustomer[],
  capacity: number,
  params: EngineParameters
): RankingResult {
  // ─── Filter ───
  const blockedInput = customers.filter((c) => c.signal.status === 'BLOCKED')
  const eligible = customers.filter(
    (c) =>
      c.signal.status !== 'BLOCKED' &&
      !c.visitedRecently &&
      (c.signal.daysSinceLastPurchase === null ||
        c.signal.daysSinceLastPurchase <= INACTIVE_REMOVAL_DAYS)
  )

  // ─── Scorer (normalização de valor dentro da carteira) ───
  const maxTicketProb = eligible.reduce(
    (max, c) => Math.max(max, (c.signal.avgTicket ?? 0) * c.signal.purchaseProb),
    0
  )
  const scored = eligible.map((c) => ({
    item: score(c, maxTicketProb, params),
    group: groupKey(c, params.group_by),
  }))

  // ─── Agrupamento geográfico: dia = grupo com maior Σscore (doc §4.3/4.4) ───
  const sumByGroup = new Map<string, number>()
  for (const { item, group } of scored) {
    if (!group) continue
    sumByGroup.set(group, (sumByGroup.get(group) ?? 0) + item.scoreTotal)
  }
  let grouping: string | null = null
  for (const [group, sum] of [...sumByGroup.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  )) {
    grouping = group
    void sum
    break
  }

  // Prioriza o grupo do dia; preenche vagas restantes com o resto da carteira
  const inGroup = scored.filter((s) => grouping !== null && s.group === grouping).map((s) => s.item)
  const outGroup = scored.filter((s) => grouping === null || s.group !== grouping).map((s) => s.item)
  inGroup.sort(byScoreThenCode)
  outGroup.sort(byScoreThenCode)

  const selected = selectWithDiversity(inGroup, capacity, params.max_same_status_pct)
  if (selected.length < capacity) {
    const fill = selectWithDiversity(outGroup, capacity - selected.length, params.max_same_status_pct)
    selected.push(...fill)
  }

  // ─── Bloqueados relevantes (seção "resolver", no fim do plano) ───
  const blocked = blockedInput
    .map((c) => score(c, maxTicketProb, params))
    .sort((a, b) => (b.expectedAmount ?? 0) - (a.expectedAmount ?? 0) || a.customerCode.localeCompare(b.customerCode))
    .slice(0, 5)

  return {
    selected: selected.map((item) => ({ ...item, grouping })),
    blocked: blocked.map((item) => ({ ...item, grouping: null })),
    grouping,
  }
}
