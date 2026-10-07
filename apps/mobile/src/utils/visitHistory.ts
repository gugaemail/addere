// Histórico de visitas (E24, plano 003) — agrupamento por dia e formatação
// de meta, puros. Hora sempre em America/Sao_Paulo (nunca o fuso do
// aparelho): no campo quase sempre coincidem, mas não é garantido.
import type { VisitHistoryItemDto } from '@addere/types'
import { weekdayOf } from './calendar'

const WEEKDAY_FULL = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO'] as const

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
