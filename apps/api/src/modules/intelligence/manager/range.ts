// Janela de datas da tela Equipe em campo (E8) — puro.
// O dia civil é sempre o de São Paulo: as visitas entram na janela pelo
// `ymdSaoPaulo` do `arrivedAt`, nunca por um offset UTC fixo — quem sabe o fuso
// é o Intl, não este módulo.
import { isBusinessDay } from '../engine/business-days'

export type TeamRange = 'day' | 'week' | 'month'

export interface DateWindow {
  fromYmd: string
  toYmd: string
}

function partsOf(ymd: string): [number, number, number] {
  return [Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)), Number(ymd.slice(6, 8))]
}

/** 'YYYY-MM-DD' → 'YYYYMMDD' (formato interno). */
export function compactYmd(iso: string): string {
  return iso.replace(/-/g, '')
}

/** Meia-noite UTC do dia civil — mesma convenção de VisitPlan.date (@db.Date). */
export function ymdToUtcDate(ymd: string): Date {
  const [year, month, day] = partsOf(ymd)
  return new Date(Date.UTC(year, month - 1, day))
}

export function addDays(ymd: string, days: number): string {
  const next = new Date(ymdToUtcDate(ymd).getTime() + days * 86_400_000)
  return next.toISOString().slice(0, 10).replace(/-/g, '')
}

/**
 * Janela do toggle Hoje/Semana/Mês (E11).
 * - `day`: o próprio dia
 * - `week`: segunda a domingo que contêm o dia
 * - `month`: primeiro ao último dia do mês
 */
export function rangeWindow(anchorYmd: string, range: TeamRange): DateWindow {
  const [year, month] = partsOf(anchorYmd)

  if (range === 'day') return { fromYmd: anchorYmd, toYmd: anchorYmd }

  if (range === 'week') {
    // getUTCDay: 0=dom … 6=sáb. Semana começa na segunda.
    const weekday = ymdToUtcDate(anchorYmd).getUTCDay()
    const backToMonday = weekday === 0 ? 6 : weekday - 1
    const fromYmd = addDays(anchorYmd, -backToMonday)
    return { fromYmd, toYmd: addDays(fromYmd, 6) }
  }

  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const prefix = anchorYmd.slice(0, 6)
  return { fromYmd: `${prefix}01`, toYmd: `${prefix}${String(lastDay).padStart(2, '0')}` }
}

export function eachYmd(window: DateWindow): string[] {
  const days: string[] = []
  for (let ymd = window.fromYmd; ymd <= window.toYmd; ymd = addDays(ymd, 1)) days.push(ymd)
  return days
}

export function businessDaysIn(window: DateWindow, saturdayWorkday: boolean): number {
  return eachYmd(window).filter((ymd) => isBusinessDay(ymd, saturdayWorkday)).length
}
