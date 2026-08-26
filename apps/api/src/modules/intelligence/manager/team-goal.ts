// Meta da equipe para a home do gerente no app (decisão 1 do teste geral):
// a soma das metas dos vendedores associados a ele. Puro — os snapshots vêm
// de manager.service (GoalSnapshot, o mais recente de cada vendedor no mês).

export interface GoalSellerInput {
  userId: string
  name: string
  vendorCode: string
}

export interface GoalSnapshotInput {
  vendorCode: string
  goalAmount: number | null
  soldAmount: number | null
  capturedAt: Date
}

export interface SellerGoal {
  userId: string
  name: string
  vendorCode: string
  goalAmount: string | null
  soldAmount: string | null
  pct: number | null
}

export interface TeamGoal {
  goalAmount: string | null
  soldAmount: string | null
  gap: string | null
  pct: number | null
  /** Quantos vendedores têm meta capturada no mês — sem nenhum, o card some. */
  sellersWithGoal: number
  sellers: SellerGoal[]
}

const money = (value: number | null): string | null => (value === null ? null : value.toFixed(2))

function pct(sold: number, goal: number): number | null {
  if (goal <= 0) return null
  return Math.min(100, Math.round((sold / goal) * 100))
}

export function buildTeamGoal(
  sellers: GoalSellerInput[],
  snapshots: GoalSnapshotInput[]
): TeamGoal {
  // O snapshot mais recente por vendedor — a captura é append-only
  const latest = new Map<string, GoalSnapshotInput>()
  for (const snap of snapshots) {
    const current = latest.get(snap.vendorCode)
    if (!current || snap.capturedAt > current.capturedAt) latest.set(snap.vendorCode, snap)
  }

  let goalTotal: number | null = null
  let soldTotal = 0
  let sellersWithGoal = 0

  const rows = sellers.map((seller): SellerGoal => {
    const snap = latest.get(seller.vendorCode)
    const goal = snap?.goalAmount ?? null
    const sold = snap?.soldAmount ?? null
    if (goal !== null) {
      goalTotal = (goalTotal ?? 0) + goal
      sellersWithGoal += 1
    }
    soldTotal += sold ?? 0
    return {
      userId: seller.userId,
      name: seller.name,
      vendorCode: seller.vendorCode,
      goalAmount: money(goal),
      soldAmount: money(sold),
      pct: goal === null || sold === null ? null : pct(sold, goal),
    }
  })

  const hasSold = rows.some((r) => r.soldAmount !== null)
  return {
    goalAmount: money(goalTotal),
    soldAmount: hasSold ? money(soldTotal) : null,
    gap: goalTotal === null ? null : money(Math.max(0, goalTotal - soldTotal)),
    pct: goalTotal === null ? null : pct(soldTotal, goalTotal),
    sellersWithGoal,
    sellers: rows,
  }
}
