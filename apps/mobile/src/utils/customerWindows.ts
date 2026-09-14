// Janelas de atendimento do cliente (E16) — validação e rótulos, puros.
import type { CustomerWindowDto } from '@addere/types'
import { WEEKDAY_SHORT } from './calendar'

export const TIME_RE = /^\d{2}:\d{2}$/

export interface WindowInput {
  weekday: number
  startTime: string
  endTime: string
}

export type WindowValidation = { ok: true } | { ok: false; error: string }

const toMinutes = (time: string): number | null => {
  if (!TIME_RE.test(time)) return null
  const [h, m] = time.split(':').map(Number)
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/** Formato HH:MM válido nos dois campos e fim depois do início */
export function validateWindow(window: { startTime: string; endTime: string }): WindowValidation {
  const start = toMinutes(window.startTime.trim())
  if (start === null) return { ok: false, error: 'Início inválido — use HH:MM (ex.: 08:00).' }
  const end = toMinutes(window.endTime.trim())
  if (end === null) return { ok: false, error: 'Fim inválido — use HH:MM (ex.: 12:00).' }
  if (end <= start) return { ok: false, error: 'O fim precisa ser depois do início.' }
  return { ok: true }
}

/** "Seg 08:00–12:00" */
export function windowLabel(window: Pick<CustomerWindowDto, 'weekday' | 'startTime' | 'endTime'>): string {
  return `${WEEKDAY_SHORT[window.weekday] ?? '?'} ${window.startTime}–${window.endTime}`
}

/** Ordena por dia da semana e hora de início (para exibir e para enviar) */
export function sortWindows<T extends Pick<CustomerWindowDto, 'weekday' | 'startTime'>>(windows: T[]): T[] {
  return [...windows].sort((a, b) =>
    a.weekday !== b.weekday ? a.weekday - b.weekday : a.startTime.localeCompare(b.startTime)
  )
}

/** Máscara de digitação: "0800" → "08:00" (só dígitos, no máximo 4) */
export function maskTime(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits
}

/** Dias oferecidos no seletor: segunda a sábado (domingo não é dia de rota) */
export const SELECTABLE_WEEKDAYS = [1, 2, 3, 4, 5, 6] as const
