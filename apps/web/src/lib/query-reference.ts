// SQL de referência das Consultas (W3) — puro e testado.
// A API manda uma LISTA por contrato ({ label, sql }): vendas tem duas
// (faturamento e pedidos). O editor tratava como texto único e escrevia
// "[object Object],[object Object]" na caixa.

export interface ReferenceSqlOption {
  label: string
  sql: string
}

const BROKEN_SQL = /^\s*\[object Object\]/

/** Aceita a lista da API; um texto solto (formato antigo) vira uma opção só. */
export function normalizeReferenceSql(raw: unknown): ReferenceSqlOption[] {
  if (typeof raw === 'string') return raw.trim() ? [{ label: 'Referência', sql: raw }] : []
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): ReferenceSqlOption[] => {
    if (!item || typeof item !== 'object') return []
    const { label, sql } = item as { label?: unknown; sql?: unknown }
    if (typeof sql !== 'string' || !sql.trim()) return []
    return [{ label: typeof label === 'string' && label.trim() ? label : 'Referência', sql }]
  })
}

/** Rascunho salvo quando o defeito antigo gravou a lista crua como SQL. */
export function isBrokenSql(sql: string | null | undefined): boolean {
  return typeof sql === 'string' && BROKEN_SQL.test(sql)
}

/**
 * O que o editor mostra ao abrir: o rascunho salvo, se for SQL de verdade;
 * senão a primeira referência; sem nada, vazio.
 */
export function initialEditorSql(
  savedSql: string | null | undefined,
  references: ReferenceSqlOption[]
): string {
  if (savedSql && !isBrokenSql(savedSql)) return savedSql
  return references[0]?.sql ?? ''
}

/** Índice da referência que o editor contém hoje (espaços nas pontas não contam); -1 = nenhuma. */
export function matchingReference(sql: string, references: ReferenceSqlOption[]): number {
  const current = sql.trim()
  return references.findIndex((ref) => ref.sql.trim() === current)
}

/** Rótulo do botão: "Usar SQL de referência" com uma opção; "Usar SD2/SF2 (faturamento)" com várias. */
export function referenceButtonLabel(option: ReferenceSqlOption, total: number): string {
  return total > 1 ? `Usar ${option.label}` : 'Usar SQL de referência'
}
