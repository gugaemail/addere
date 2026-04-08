// Utilitários de mapeamento de campos Protheus → campos internos.

export interface FieldMapping {
  responseKey: string
  fields: Record<string, string>
}

// Dado um registro raw do Protheus e um mapeamento { campoInterno: campoProtheus },
// retorna um objeto com os campos internos preenchidos.
export function mapRecord(
  raw: Record<string, unknown>,
  fields: Record<string, string>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [localField, protheusField] of Object.entries(fields)) {
    result[localField] = raw[protheusField] ?? null
  }
  return result
}

// Extrai o array de registros da resposta Protheus.
// Suporta { data: [...] }, { clientes: [...] } ou array direto na raiz.
export function extractRecords(
  response: unknown,
  responseKey: string
): Record<string, unknown>[] {
  if (Array.isArray(response)) return response as Record<string, unknown>[]
  const obj = response as Record<string, unknown>
  const value = obj[responseKey]
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : []
}

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
