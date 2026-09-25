import { decryptCredential } from '../../lib/protheus-crypto'
import { unprocessable } from '../../lib/errors'
import type { CompanyCredentials } from './protheus.client'

/**
 * Converte um valor de campo para string, retornando fallback se nulo/indefinido.
 * Evita que objetos ou arrays virem "[object Object]".
 */
export function toStr(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback // objetos, arrays — ignora e usa fallback
}

/**
 * Converte um valor de campo para número.
 * Retorna fallback se o valor não for numérico ou for NaN.
 */
export function toNum(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

/** Tenta parsear um campo que pode ser string JSON ou já um objeto */
export function parseJsonField(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof value === 'object' && value !== null) return value as Record<string, unknown>
  return {}
}

/** Parseia data no formato YYYYMMDD retornado pelo Protheus */
export function parseProtheusDate(value: unknown): Date | null {
  const s = toStr(value)
  if (!s || s.length !== 8) return null
  const year = parseInt(s.slice(0, 4), 10)
  const month = parseInt(s.slice(4, 6), 10) - 1
  const day = parseInt(s.slice(6, 8), 10)
  const d = new Date(year, month, day)
  return isNaN(d.getTime()) ? null : d
}

export function formatDateDDMMYYYY(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

export function buildPhone(ddd: string, tel: string): string | null {
  const d = ddd.trim()
  const t = tel.trim()
  if (!t) return null
  return d ? `(${d}) ${t}` : t
}

export function getCredentials(company: {
  apiToken: string | null
  usrProtheus: string | null
  passProtheus: string | null
  syncConfig: unknown
}): CompanyCredentials {
  if (!company.apiToken) throw unprocessable('URL apiToken não configurada')
  if (!company.usrProtheus) throw unprocessable('Usuário Protheus não configurado')
  if (!company.passProtheus) throw unprocessable('Senha Protheus não configurada')

  return {
    apiToken: company.apiToken,
    usrProtheus: company.usrProtheus,
    // Descriptografa a senha antes de usar na chamada HTTP
    passProtheus: decryptCredential(company.passProtheus),
    syncConfig: company.syncConfig as Record<string, unknown> | null,
  }
}
