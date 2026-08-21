// Particionamento de janelas de datas dos syncs (E4) — puro, sem I/O.
// Datas sempre YYYYMMDD no fuso America/Sao_Paulo (padrão Protheus D2_EMISSAO).

import { formatDateYmdSaoPaulo } from '../protheus-sql/placeholders'

export interface DateWindow {
  dataIni: string // YYYYMMDD inclusivo
  dataFim: string // YYYYMMDD inclusivo
}

const DAY_MS = 24 * 60 * 60 * 1000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Janela incremental: hoje−days até hoje (ex.: SALES a cada refresh, D=7). */
export function incrementalWindow(days: number, ref: Date = new Date()): DateWindow {
  return {
    dataIni: formatDateYmdSaoPaulo(new Date(ref.getTime() - days * DAY_MS)),
    dataFim: formatDateYmdSaoPaulo(ref),
  }
}

/** Janela de um mês fechado 'YYYYMM' (reconciliação). */
export function periodWindow(period: string): DateWindow {
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(4, 6))
  const prefix = `${period.slice(0, 4)}${pad2(month)}`
  return { dataIni: `${prefix}01`, dataFim: `${prefix}${pad2(lastDayOfMonth(year, month))}` }
}

/**
 * Janelas mensais da carga inicial (backfill, P5): `months` meses até `ref`,
 * da mais antiga para a mais recente; a última termina em `ref` (mês parcial).
 */
export function monthlyWindows(months: number, ref: Date = new Date()): DateWindow[] {
  const refYmd = formatDateYmdSaoPaulo(ref)
  const refYear = Number(refYmd.slice(0, 4))
  const refMonth = Number(refYmd.slice(4, 6))

  const windows: DateWindow[] = []
  for (let i = months - 1; i >= 0; i--) {
    // Mês de referência − i (aritmética de meses sem Date para não escorregar no fuso)
    const total = refYear * 12 + (refMonth - 1) - i
    const year = Math.floor(total / 12)
    const month = (total % 12) + 1
    const prefix = `${year}${pad2(month)}`
    const isCurrent = i === 0
    windows.push({
      dataIni: `${prefix}01`,
      dataFim: isCurrent ? refYmd : `${prefix}${pad2(lastDayOfMonth(year, month))}`,
    })
  }
  return windows
}
