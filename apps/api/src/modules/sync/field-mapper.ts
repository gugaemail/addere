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
