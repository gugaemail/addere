// Escolha dos casos congelados do eval (E14a) — puro.
//
// Pegar os N primeiros sinais ordenados por status dava uma suíte inteira do
// mesmo status: com 41 clientes NEW e 2 BLOCKED, os 10 casos eram 10 vezes a
// mesma situação, e o eval passava sem exercitar o prompt. A escolha aqui é
// estratificada — cada status presente entra no rodízio — e determinística,
// porque congelar duas vezes tem de dar a mesma suíte.

export interface SelectableSignal {
  status: string
  customerCode: string
  loja: string
  /** Casos com mix cortado exercitam mais do prompt — entram primeiro. */
  hasCutMix: boolean
}

function sortWithinStatus<T extends SelectableSignal>(a: T, b: T): number {
  if (a.hasCutMix !== b.hasCutMix) return a.hasCutMix ? -1 : 1
  if (a.customerCode !== b.customerCode) return a.customerCode < b.customerCode ? -1 : 1
  return a.loja < b.loja ? -1 : a.loja > b.loja ? 1 : 0
}

/**
 * Rodízio entre os status presentes até completar `limit`. Um status com poucos
 * casos não bloqueia os demais: quando esgota, os outros seguem preenchendo.
 */
export function selectEvalCases<T extends SelectableSignal>(signals: T[], limit: number): T[] {
  if (limit <= 0) return []

  const byStatus = new Map<string, T[]>()
  for (const signal of signals) {
    const group = byStatus.get(signal.status)
    if (group) group.push(signal)
    else byStatus.set(signal.status, [signal])
  }
  for (const group of byStatus.values()) group.sort(sortWithinStatus)

  const groups = [...byStatus.values()]
  const selected: T[] = []
  for (let round = 0; selected.length < limit; round++) {
    let tookAny = false
    for (const group of groups) {
      if (selected.length >= limit) break
      const next = group[round]
      if (!next) continue
      selected.push(next)
      tookAny = true
    }
    if (!tookAny) break // todos os grupos esgotaram
  }
  return selected
}
