// Datas civis no fuso de São Paulo (Fase 2) — o plano é do dia do vendedor,
// não do UTC do aparelho. Tudo em 'YYYY-MM-DD'; nenhum Date vaza para a UI.
const SP_TZ = 'America/Sao_Paulo'

/** Dia civil de São Paulo em 'YYYY-MM-DD' (en-CA já formata nessa ordem) */
export function saoPauloYmd(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: SP_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    // Runtime sem dados de fuso (Intl reduzido): cai no relógio local
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
}

const toUtc = (ymd: string): Date => new Date(`${ymd}T00:00:00Z`)

export function addDays(ymd: string, days: number): string {
  const date = toUtc(ymd)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** 0=dom … 6=sáb (mesma convenção de CustomerWindowDto.weekday) */
export function weekdayOf(ymd: string): number {
  return toUtc(ymd).getUTCDay()
}

/** Segunda-feira da semana do dia informado (semana começa na segunda) */
export function mondayOf(ymd: string): string {
  return addDays(ymd, -((weekdayOf(ymd) + 6) % 7))
}

export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

/** "Seg 15/09" */
export function dayLabel(ymd: string): string {
  const [, month, day] = ymd.split('-')
  return `${WEEKDAY_SHORT[weekdayOf(ymd)]} ${day}/${month}`
}
