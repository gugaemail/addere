// Sinais por vendedor (E5, doc §4.2) — gap, por dia útil e coberturas. Puro.
import type { CustomerSignalResult } from './signals'

export interface VendorGoalInput {
  goalAmount: number | null
  soldAmount: number | null
  businessDaysLeft: number
  portfolio: CustomerSignalResult[] // sinais da carteira do vendedor
}

export interface VendorGoalResult {
  gap: number | null
  perBusinessDay: number | null
  /** Σ ticket×prob dos atrasados+risco — quanto dá para recuperar */
  lateCoverage: number
  /** carteira ativa × ticket médio / meta (saudável ≈ 3×) */
  funnelCoverage: number | null
}

const round2 = (n: number) => Math.round(n * 100) / 100

export function computeVendorGoal(input: VendorGoalInput): VendorGoalResult {
  const gap =
    input.goalAmount === null
      ? null
      : round2(Math.max(0, input.goalAmount - (input.soldAmount ?? 0)))

  const perBusinessDay =
    gap === null || input.businessDaysLeft <= 0 ? null : round2(gap / input.businessDaysLeft)

  const lateCoverage = round2(
    input.portfolio
      .filter((s) => s.status === 'LATE' || s.status === 'AT_RISK')
      .reduce((sum, s) => sum + (s.avgTicket ?? 0) * s.purchaseProb, 0)
  )

  const active = input.portfolio.filter((s) => s.status !== 'INACTIVE' && s.status !== 'BLOCKED')
  const avgTicketActive =
    active.length === 0
      ? 0
      : active.reduce((sum, s) => sum + (s.avgTicket ?? 0), 0) / active.length
  const funnelCoverage =
    input.goalAmount === null || input.goalAmount <= 0
      ? null
      : round2((active.length * avgTicketActive) / input.goalAmount)

  return { gap, perBusinessDay, lateCoverage, funnelCoverage }
}
