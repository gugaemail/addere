import {
  DUE_DAY_MAX,
  DUE_DAY_MIN,
  addCompetenceMonths,
  civilDaySaoPaulo,
  dueDateForCompetence,
  startOfCompetence,
} from '@addere/types'
import { dateToYmdUtc } from '../intelligence/engine/business-days'

// Competência do faturamento (plano 016). Internamente 'YYYYMM' (como
// GoalSnapshot.period); na API e no web, 'YYYY-MM'. Toda conversão de instante
// passa pelo dia civil de São Paulo, com os helpers do 013
// (@addere/types/billing): uma regra só para o calendário, o limite de licenças
// e a fatura. Nunca getMonth()/getDate() de um Date local.
//
// O servidor roda em UTC: às 22h de Brasília do dia 31 já é dia 1 em UTC, e um
// gerador ingênuo faturaria o mês antes de ele acabar. Por isso o mês corrente
// sai de startOfCompetence (fuso de São Paulo), não do relógio UTC.

export type Ym = string // 'YYYYMM'

const YM = /^(\d{4})(0[1-9]|1[0-2])$/
const ISO_YM = /^(\d{4})-(0[1-9]|1[0-2])$/
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/

function parseYm(ym: Ym): { year: number; month: number } {
  const m = YM.exec(ym)
  if (!m) throw new RangeError(`competência inválida: ${ym}`)
  return { year: Number(m[1]), month: Number(m[2]) }
}

/** @db.Date do dia 1 da competência (meia-noite UTC) */
export function competenceStart(ym: Ym): Date {
  const { year, month } = parseYm(ym)
  return new Date(Date.UTC(year, month - 1, 1))
}

/** @db.Date do último dia da competência */
export function competenceEnd(ym: Ym): Date {
  const { year, month } = parseYm(ym)
  return new Date(Date.UTC(year, month, 0))
}

/** Competência de um @db.Date (lido em UTC, a convenção dos campos de dia civil) */
export function dateToCompetence(date: Date): Ym {
  return dateToYmdUtc(date).slice(0, 6)
}

/** Mês corrente em São Paulo */
export function competenceAt(now: Date): Ym {
  return dateToCompetence(startOfCompetence(now))
}

export function addMonthsYm(ym: Ym, months: number): Ym {
  return dateToCompetence(addCompetenceMonths(competenceStart(ym), months))
}

/** A competência que o gerador fatura: o mês anterior ao corrente em São Paulo (D2) */
export function previousCompetenceAt(now: Date): Ym {
  return addMonthsYm(competenceAt(now), -1)
}

/** Vencimento da fatura da competência: dia `dueDay` do mês seguinte (regra do 013) */
export function dueDateFor(ym: Ym, dueDay: number): Date {
  if (!Number.isInteger(dueDay) || dueDay < DUE_DAY_MIN || dueDay > DUE_DAY_MAX) {
    throw new RangeError('dueDay fora de 1 a 10')
  }
  return dueDateForCompetence(competenceStart(ym), dueDay)
}

/** @db.Date de hoje em São Paulo */
export function todaySaoPaulo(now: Date): Date {
  return civilDaySaoPaulo(now)
}

/** '202610' → '2026-10' */
export function ymToIso(ym: Ym): string {
  parseYm(ym)
  return `${ym.slice(0, 4)}-${ym.slice(4, 6)}`
}

/** '2026-10' → '202610'. Lança RangeError fora do formato */
export function isoToYm(iso: string): Ym {
  const m = ISO_YM.exec(iso)
  if (!m) throw new RangeError(`competência inválida: ${iso}`)
  return `${m[1]}${m[2]}`
}

// ─── Dia civil na API ────────────────────────────────────────────────────────
// Datas de calendário viajam como 'YYYY-MM-DD', nunca como timestamp: é o que
// impede o deslocamento de um dia no navegador.

/** @db.Date → 'YYYY-MM-DD' (lido em UTC) */
export function dateToIsoDay(date: Date): string {
  const ymd = dateToYmdUtc(date)
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`
}

/** 'YYYY-MM-DD' → @db.Date (meia-noite UTC); null se o formato ou o dia não existirem */
export function isoDayToDate(iso: string): Date | null {
  const m = ISO_DAY.exec(iso)
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) return null
  if (date.getUTCDate() !== day) return null
  return date
}
