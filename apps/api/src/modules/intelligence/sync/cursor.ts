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

/** Cursor inicial quando nenhuma linha da carga completa tem carimbo (forma canônica). */
export const STAMP_FLOOR = '1900-01-01 00:00:00.000'

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
 * Uma linha por chave. Um registro apagado e incluído de novo N vezes deixa no
 * Protheus N cópias excluídas (cada uma com o seu R_E_C_N_O_) e no máximo uma
 * viva — o índice único só vale entre as não excluídas. Então: havendo cópia
 * viva, ela é o estado atual; só excluídas, a chave foi excluída. Entre vivas
 * repetidas (não deveria acontecer), vale a de carimbo mais novo. Linha sem
 * chave passa adiante como viva — o mapeamento a descarta e reporta.
 */
export function resolveByKey(
  rows: SqlRow[],
  keyOf: (row: SqlRow) => string | null
): { live: SqlRow[]; deleted: SqlRow[] } {
  const { live, deleted } = splitDeletedRows(rows)
  const liveByKey = new Map<string, SqlRow>()
  const keyless: SqlRow[] = []
  for (const row of live) {
    const key = keyOf(row)
    if (key === null) {
      keyless.push(row)
      continue
    }
    const current = liveByKey.get(key)
    const stamp = normalizeStamp(column(row, 'stamp')) ?? ''
    const currentStamp = current ? (normalizeStamp(column(current, 'stamp')) ?? '') : ''
    if (!current || stamp > currentStamp) liveByKey.set(key, row)
  }
  const deletedByKey = new Map<string, SqlRow>()
  for (const row of deleted) {
    const key = keyOf(row)
    if (key !== null && !liveByKey.has(key) && !deletedByKey.has(key)) deletedByKey.set(key, row)
  }
  return { live: [...liveByKey.values(), ...keyless], deleted: [...deletedByKey.values()] }
}

/**
 * Linhas idênticas em todas as colunas — inclusive carimbo e excluido. Não são
 * cópias excluídas (essas diferem em excluido e no carimbo): é a paginação do
 * endpoint devolvendo a mesma linha em duas páginas, e quando isso acontece
 * outra linha ficou de fora. Causa: consulta sem ORDER BY estável.
 */
export function countIdenticalRows(rows: SqlRow[]): number {
  const seen = new Set<string>()
  let repeated = 0
  for (const row of rows) {
    const fingerprint = JSON.stringify(
      Object.keys(row)
        .map((k) => k.toLowerCase())
        .sort()
        .map((k) => [k, column(row, k)])
    )
    if (seen.has(fingerprint)) repeated++
    else seen.add(fingerprint)
  }
  return repeated
}

/** Carimbos canônicos das linhas; `missing` conta as que vieram sem carimbo válido. */
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

/**
 * Diagnóstico da coluna `stamp` para a prévia e o sync. Carimbo vazio (NULL) é
 * normal: o DBAccess só carimba o que foi incluído ou alterado depois que o
 * S_T_A_M_P_ foi ativado, e registro antigo intocado fica sem. Erro de verdade é
 * a coluna não vir (`hasColumn` falso) ou vir num formato que não é carimbo.
 */
export function inspectStamps(rows: SqlRow[]): {
  hasColumn: boolean
  valid: number
  empty: number
  invalid: number
} {
  let hasColumn = false
  let valid = 0
  let empty = 0
  let invalid = 0
  for (const row of rows) {
    if (Object.keys(row).some((key) => key.toLowerCase() === 'stamp')) hasColumn = true
    const raw = column(row, 'stamp')
    if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
      empty++
    } else if (normalizeStamp(raw)) {
      valid++
    } else {
      invalid++
    }
  }
  return { hasColumn, valid, empty, invalid }
}

/** Problema que impede o sync incremental; null = a coluna stamp está ok. */
export function stampProblem(rows: SqlRow[]): string | null {
  if (rows.length === 0) return null
  const { hasColumn, invalid } = inspectStamps(rows)
  if (!hasColumn) {
    return 'a consulta não devolve a coluna stamp — use CONVERT(VARCHAR(23), S_T_A_M_P_, 121) AS stamp'
  }
  if (invalid > 0) {
    return `${invalid} linha(s) com carimbo em formato inesperado — use CONVERT(VARCHAR(23), S_T_A_M_P_, 121)`
  }
  return null
}
