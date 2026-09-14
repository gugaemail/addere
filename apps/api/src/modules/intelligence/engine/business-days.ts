// Dias úteis no fuso America/Sao_Paulo (E5) — puro. Feriados = backlog (doc §4.4).

const SP_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 'YYYYMMDD' do instante em São Paulo. */
export function ymdSaoPaulo(date: Date): string {
  return SP_FMT.format(date).replace(/-/g, '')
}

function weekdayUtc(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() // 0=dom … 6=sáb
}

export function isBusinessDay(ymd: string, saturdayWorkday: boolean): boolean {
  const weekday = weekdayUtc(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)), Number(ymd.slice(6, 8)))
  if (weekday === 0) return false
  if (weekday === 6) return saturdayWorkday
  return true
}

/** Dias úteis restantes no mês corrente, incluindo hoje (gap ÷ por dia, doc §4.2). */
export function businessDaysRemaining(now: Date, saturdayWorkday: boolean): number {
  const today = ymdSaoPaulo(now)
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(4, 6))
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()

  let count = 0
  for (let day = Number(today.slice(6, 8)); day <= lastDay; day++) {
    const ymd = `${today.slice(0, 6)}${String(day).padStart(2, '0')}`
    if (isBusinessDay(ymd, saturdayWorkday)) count++
  }
  return count
}

/** Diferença em dias entre duas datas YYYYMMDD (b − a). */
export function diffDays(a: string, b: string): number {
  const toUtc = (ymd: string) =>
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)))
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000)
}

/** Soma dias a uma data YYYYMMDD (negativo volta no tempo). */
export function addDaysYmd(ymd: string, days: number): string {
  const date = new Date(
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)))
  )
  date.setUTCDate(date.getUTCDate() + days)
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
}

/** Dia da semana de YYYYMMDD: 0=dom … 6=sáb. */
export function weekdayOf(ymd: string): number {
  return weekdayUtc(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)), Number(ymd.slice(6, 8)))
}

/** Segunda-feira da semana que contém o dia (semana começa na segunda). */
export function mondayOf(ymd: string): string {
  const weekday = weekdayOf(ymd)
  return addDaysYmd(ymd, weekday === 0 ? -6 : 1 - weekday)
}

/**
 * Dias úteis restantes da semana a partir de `ymd` (inclusive), até sábado.
 * Domingo nunca entra; sábado só quando é dia de trabalho (E18).
 */
export function businessDaysLeftInWeek(ymd: string, saturdayWorkday: boolean): string[] {
  const days: string[] = []
  const monday = mondayOf(ymd)
  for (let offset = 0; offset < 7; offset++) {
    const day = addDaysYmd(monday, offset)
    if (day < ymd) continue
    if (isBusinessDay(day, saturdayWorkday)) days.push(day)
  }
  return days
}

/** 'YYYYMMDD' → Date UTC à meia-noite (convenção de VisitPlan.date @db.Date). */
export function ymdToDate(ymd: string): Date {
  return new Date(
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)))
  )
}

/** Date (meia-noite UTC) → 'YYYYMMDD'. */
export function dateToYmdUtc(date: Date): string {
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
}
