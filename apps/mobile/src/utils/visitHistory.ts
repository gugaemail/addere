// Histórico de visitas (E24, plano 003) — agrupamento por dia, seletor de
// mês civil e formatação de meta, puros. Hora sempre em America/Sao_Paulo
// (nunca o fuso do aparelho): no campo quase sempre coincidem, mas não é
// garantido.
//
// Unidade de apuração: mês civil, nunca janela de N dias corridos (revisão
// do plano 003) — a meta do vendedor é mensal e a do gerente é a soma das
// metas da equipe, e meses têm 28/29/30/31 dias, então uma janela móvel
// nunca fecha com o período pelo qual a pessoa é cobrada. Por isso só duas
// opções (Este mês / Mês passado), nunca uma janela de dias: um mês civil
// isolado nunca passa de 31 dias, bem dentro do teto de 90 da API.
import type { VisitHistoryItemDto } from '@addere/types'
import { weekdayOf } from './calendar'

const WEEKDAY_FULL = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'] as const

export interface MonthRange {
  from: string // 'YYYY-MM-DD'
  to: string
}

/**
 * Último dia de `month` (1-12) em `year`, sempre do calendário — nunca
 * `dia1 + 30`. `Date.UTC(year, month, 0)` pede o "dia 0" do mês seguinte
 * (índice 0 do JS Date já é 1-indexado aqui de propósito), que o próprio
 * JS resolve como o último dia do mês anterior — cobre fevereiro bissexto
 * (29), fevereiro comum (28) e os meses de 31 sem precisar de tabela.
 */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Mês anterior ao de `ymd` — janeiro vira dezembro do ano anterior (virada explícita). */
export function previousMonthOf(ymd: string): { year: number; month: number } {
  const year = Number(ymd.slice(0, 4))
  const month = Number(ymd.slice(5, 7))
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

/** "Este mês": do dia 1 até `todayYmd` — o mês ainda não fechou, não vai até o fim dele. */
export function currentMonthToDate(todayYmd: string): MonthRange {
  return { from: `${todayYmd.slice(0, 7)}-01`, to: todayYmd }
}

/** "Mês passado": o mês civil anterior inteiro, do dia 1 ao último dia do calendário. */
export function previousMonthRange(todayYmd: string): MonthRange {
  const { year, month } = previousMonthOf(todayYmd)
  const mm = String(month).padStart(2, '0')
  const lastDay = String(lastDayOfMonth(year, month)).padStart(2, '0')
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${lastDay}` }
}

export type HistoryPeriod = 'current' | 'previous'

export function historyPeriodRange(period: HistoryPeriod, todayYmd: string): MonthRange {
  return period === 'current' ? currentMonthToDate(todayYmd) : previousMonthRange(todayYmd)
}

export function historyPeriodLabel(period: HistoryPeriod): string {
  return period === 'current' ? 'Este mês' : 'Mês passado'
}

export interface VisitHistoryDaySection {
  ymd: string
  title: string
  data: VisitHistoryItemDto[]
}

/** "SEXTA, 06/10" — cabeçalho de dia do esboço do plano 003 (dia cheio, maiúsculo). */
export function dayHeaderLabel(ymd: string): string {
  const [, month, day] = ymd.split('-')
  return `${WEEKDAY_FULL[weekdayOf(ymd)]}, ${day}/${month}`
}

/**
 * Agrupa por dia civil (campo `ymd` do DTO, 'YYYY-MM-DD' de São Paulo),
 * preservando a ordem dos itens dentro do dia — a API já devolve arrivedAt
 * desc, então não ordena de novo aqui (mesma convenção de weekSections).
 */
export function sectionsByDay(items: VisitHistoryItemDto[]): VisitHistoryDaySection[] {
  const byDay = new Map<string, VisitHistoryItemDto[]>()
  for (const item of items) {
    const list = byDay.get(item.ymd) ?? []
    list.push(item)
    byDay.set(item.ymd, list)
  }
  return [...byDay.entries()].map(([ymd, data]) => ({ ymd, title: dayHeaderLabel(ymd), data }))
}

/** "24 min" sob uma hora; "1h05min" acima (ou só "1h" quando exato). */
export function durationLabel(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}min`
}

/**
 * "08:12 · 24 min" — hora de chegada (São Paulo) + duração. Sem leftAt, só a
 * hora: nunca inventa duração. Visita nascida do pedido (source ORDER, plano
 * 006) não tem GPS nem duração por desenho — mostra "registrada pelo
 * pedido" no lugar do tempo, nunca "0 min".
 */
export function visitMetaLine(item: VisitHistoryItemDto): string {
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(item.arrivedAt))
  if (item.source === 'ORDER') return `${time} · registrada pelo pedido`
  if (item.durationMin === null) return time
  return `${time} · ${durationLabel(item.durationMin)}`
}
