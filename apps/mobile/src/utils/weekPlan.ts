// Plano da semana (E18) — agrupamento por dia e alvos do "Mover", puros.
import type { VisitPlanDto, VisitPlanItemDto } from '@addere/types'
import { addDays, dayLabel, mondayOf, weekdayOf } from './calendar'

export interface WeekDaySection {
  ymd: string
  title: string
  data: VisitPlanItemDto[]
}

/** Valor mais frequente (empate: o primeiro a chegar); ignora vazios */
export function mostFrequent(values: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

/**
 * Seções por dia (só dias >= hoje), itens ativos ordenados por posição.
 * `cityOf` resolve a cidade da parada (lista de clientes em cache) para o
 * cabeçalho "Seg 15/09 · 6 paradas · Campinas" — sem ela, fica sem cidade.
 */
export function weekSections(
  plan: VisitPlanDto | null | undefined,
  todayYmd: string,
  cityOf?: (item: VisitPlanItemDto) => string | null | undefined
): WeekDaySection[] {
  if (!plan) return []
  const byDay = new Map<string, VisitPlanItemDto[]>()
  for (const item of plan.items) {
    if (item.removedAt || !item.plannedDate || item.plannedDate < todayYmd) continue
    const list = byDay.get(item.plannedDate) ?? []
    list.push(item)
    byDay.set(item.plannedDate, list)
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([ymd, items]) => {
      const data = [...items].sort((a, b) => a.position - b.position)
      const city = cityOf ? mostFrequent(data.map((i) => cityOf(i))) : null
      const count = `${data.length} parada${data.length === 1 ? '' : 's'}`
      return { ymd, title: `${dayLabel(ymd)} · ${count}${city ? ` · ${city}` : ''}`, data }
    })
}

/**
 * Dias para onde uma parada pode ir: segunda a sexta da semana do plano
 * (sábado só se o plano já tem parada no sábado), >= hoje e != dia atual.
 */
export function moveTargets(
  plan: Pick<VisitPlanDto, 'date' | 'items'>,
  todayYmd: string,
  currentYmd: string | null
): string[] {
  const monday = mondayOf(plan.date)
  const hasSaturday = plan.items.some(
    (i) => !i.removedAt && i.plannedDate && weekdayOf(i.plannedDate) === 6
  )
  const days: string[] = []
  for (let offset = 0; offset < (hasSaturday ? 6 : 5); offset++) {
    const ymd = addDays(monday, offset)
    if (ymd < todayYmd || ymd === currentYmd) continue
    days.push(ymd)
  }
  return days
}
