// Marca d'água do sync incremental (plano 009) — puro, testado em
// __tests__/cursor.test.ts.
//
// O cursor é o maior S_T_A_M_P_ que o Protheus devolveu, nunca o relógio do
// Addere: os dois servidores não precisam concordar sobre a hora. O carimbo é
// `datetime` do SQL Server, SEM fuso — por isso toda a aritmética aqui é feita
// campo a campo, sem `new Date(string)` (que aplicaria o fuso do processo).
import type { SqlRow } from '../protheus-sql/sql-api.adapter'

/**
 * `{{DESDE}}` do modo completo: anterior a qualquer carimbo. Formato ISO com
 * "T" — o único que o SQL Server lê igual em qualquer idioma/DATEFORMAT. Com
 * 'AAAA-MM-DD hh:mm:ss', um servidor em português (dmy) troca dia e mês.
 */
export const FULL_DESDE = '1900-01-01T00:00:00.000'

/** Folga relida a cada execução: transação longa pode comitar carimbo antigo. */
export const CURSOR_OVERLAP_MINUTES = 10

const STAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/

/**
 * Carimbo como a consulta devolve (`CONVERT(VARCHAR(23), S_T_A_M_P_, 121)`) →
 * forma canônica 'AAAA-MM-DD hh:mm:ss.mmm', que ordena como texto. Null se não
 * for um carimbo.
 */
export function normalizeStamp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const match = raw.trim().match(STAMP_PATTERN)
  if (!match) return null
  const [, y, mo, d, h, mi, s, ms = '0'] = match
  return `${y}-${mo}-${d} ${h}:${mi}:${s}.${ms.padEnd(3, '0')}`
}

/** Maior carimbo canônico (comparação de texto basta na forma canônica). */
export function maxStamp(stamps: string[]): string | null {
  let max: string | null = null
  for (const stamp of stamps) if (max === null || stamp > max) max = stamp
  return max
}

/** `{{DESDE}}` do modo incremental: cursor menos a folga, em ISO com "T". */
export function desdeFromCursor(
  cursor: string,
  overlapMinutes: number = CURSOR_OVERLAP_MINUTES
): string {
  const match = cursor.match(STAMP_PATTERN)
  if (!match) return FULL_DESDE // cursor corrompido: relê tudo em vez de pular dados
  const [, y, mo, d, h, mi, s, ms = '0'] = match
  // Date.UTC só como calculadora de calendário — o valor não tem fuso
  const shifted = new Date(
    Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms.padEnd(3, '0')) - overlapMinutes * 60_000
  )
  const pad = (n: number, len = 2) => String(n).padStart(len, '0')
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}` +
    `.${pad(shifted.getUTCMilliseconds(), 3)}`
  )
}

function column(row: SqlRow, name: string): unknown {
  for (const [key, value] of Object.entries(row)) if (key.toLowerCase() === name) return value
  return undefined
}

/**
 * Separa as linhas excluídas no Protheus (`excluido = '*'`, o D_E_L_E_T_). A
 * consulta incremental não filtra exclusões — é por elas que o Addere fica
 * sabendo que um título, nota ou cliente foi apagado. Consulta sem a coluna
 * devolve tudo como vivo, igual a antes.
 */
export function splitDeletedRows(rows: SqlRow[]): { live: SqlRow[]; deleted: SqlRow[] } {
  const live: SqlRow[] = []
  const deleted: SqlRow[] = []
  for (const row of rows) {
    const flag = column(row, 'excluido')
    if (typeof flag === 'string' && flag.trim() === '*') deleted.push(row)
    else live.push(row)
  }
  return { live, deleted }
}

/**
 * Carimbos canônicos de todas as linhas. `missing` conta as que vieram sem
 * carimbo válido — consulta com `{{DESDE}}` sem a coluna `stamp` é erro de
 * configuração, e o cursor não pode andar às cegas.
 */
export function rowStamps(rows: SqlRow[]): { stamps: string[]; missing: number } {
  const stamps: string[] = []
  let missing = 0
  for (const row of rows) {
    const stamp = normalizeStamp(column(row, 'stamp'))
    if (stamp) stamps.push(stamp)
    else missing++
  }
  return { stamps, missing }
}
