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
