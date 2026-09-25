// As 3 métricas de sucesso do piloto (E8) — puro, sobre fatos já carregados.
// Servem para responder, no fim do dry-run, se a Inteligência mudou o resultado:
//   1. positivação da carteira — quantos clientes compraram no período
//   2. conversão sugestão→pedido em N dias, comparada com a visita fora do plano
//   3. recuperação de AT_RISK — quantos dos que estavam em risco voltaram
import { addDays } from './range'

export interface SuggestionFact {
  ymd: string // dia do plano
  customerKey: string // `${customerCode}|${loja}`
  statusAtTime: string
}

export interface OutOfPlanVisitFact {
  ymd: string
  customerKey: string
}

export interface PurchaseFact {
  ymd: string
  customerKey: string
}

export interface PilotMetricsInput {
  fromYmd: string
  toYmd: string
  portfolioKeys: string[]
  suggestions: SuggestionFact[]
  outOfPlanVisits: OutOfPlanVisitFact[]
  purchases: PurchaseFact[]
  /** Janela de conversão em dias corridos a partir da sugestão/visita. */
  conversionDays: number
}

export interface Ratio {
  total: number
  hits: number
  pct: number | null
}

export interface PilotMetrics {
  range: { fromYmd: string; toYmd: string }
  conversionDays: number
  portfolioPositivation: Ratio
  suggestionConversion: Ratio
  outOfPlanConversion: Ratio
  /** Diferença em pontos percentuais (sugestão − fora do plano). */
  liftPp: number | null
  atRiskRecovery: Ratio
}

function ratio(hits: number, total: number): Ratio {
  return { total, hits, pct: total > 0 ? Math.round((hits / total) * 1000) / 10 : null }
}

/** Primeira ocorrência de cada cliente — o denominador é cliente, não sugestão. */
function firstByCustomer<T extends { ymd: string; customerKey: string }>(
  facts: T[]
): Map<string, T> {
  const earliest = new Map<string, T>()
  for (const fact of facts) {
    const current = earliest.get(fact.customerKey)
    if (!current || fact.ymd < current.ymd) earliest.set(fact.customerKey, fact)
  }
  return earliest
}

export function buildPilotMetrics(input: PilotMetricsInput): PilotMetrics {
  const purchasesBy = new Map<string, string[]>()
  for (const purchase of input.purchases) {
    const list = purchasesBy.get(purchase.customerKey)
    if (list) list.push(purchase.ymd)
    else purchasesBy.set(purchase.customerKey, [purchase.ymd])
  }

  const boughtWithin = (customerKey: string, startYmd: string): boolean => {
    const deadline = addDays(startYmd, input.conversionDays)
    return (purchasesBy.get(customerKey) ?? []).some((ymd) => ymd >= startYmd && ymd <= deadline)
  }

  const boughtInWindow = (customerKey: string): boolean =>
    (purchasesBy.get(customerKey) ?? []).some((ymd) => ymd >= input.fromYmd && ymd <= input.toYmd)

  const portfolio = [...new Set(input.portfolioKeys)]
  const positivated = portfolio.filter(boughtInWindow).length

  const suggested = firstByCustomer(input.suggestions)
  let suggestionHits = 0
  for (const [customerKey, fact] of suggested) {
    if (boughtWithin(customerKey, fact.ymd)) suggestionHits++
  }

  // Grupo de comparação: cliente visitado sem estar no plano. Quem também foi
  // sugerido sai daqui — senão a mesma conversão contaria dos dois lados.
  const outOfPlan = firstByCustomer(
    input.outOfPlanVisits.filter((visit) => !suggested.has(visit.customerKey))
  )
  let outOfPlanHits = 0
  for (const [customerKey, fact] of outOfPlan) {
    if (boughtWithin(customerKey, fact.ymd)) outOfPlanHits++
  }

  const atRisk = [...suggested.values()].filter((fact) => fact.statusAtTime === 'AT_RISK')
  const recovered = atRisk.filter((fact) => boughtWithin(fact.customerKey, fact.ymd)).length

  const suggestionRatio = ratio(suggestionHits, suggested.size)
  const outOfPlanRatio = ratio(outOfPlanHits, outOfPlan.size)
  const liftPp =
    suggestionRatio.pct !== null && outOfPlanRatio.pct !== null
      ? Math.round((suggestionRatio.pct - outOfPlanRatio.pct) * 10) / 10
      : null

  return {
    range: { fromYmd: input.fromYmd, toYmd: input.toYmd },
    conversionDays: input.conversionDays,
    portfolioPositivation: ratio(positivated, portfolio.length),
    suggestionConversion: suggestionRatio,
    outOfPlanConversion: outOfPlanRatio,
    liftPp,
    atRiskRecovery: ratio(recovered, atRisk.length),
  }
}
