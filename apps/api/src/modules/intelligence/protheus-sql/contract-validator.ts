// Validação do resultado de uma consulta contra o contrato (E2).
// Puro — alimenta as checagens da prévia (W3) e do sync.

import type { QueryCheck } from '@addere/types'
import type { QueryContract } from './contracts'
import type { SqlRow } from './sql-api.adapter'

export interface ContractStats {
  rows: number
  distinctOrders?: number
  distinctCustomers?: number
  duplicateKeys?: number
}

export interface ContractValidationResult {
  ok: boolean
  checks: QueryCheck[]
  stats: ContractStats
}

function isNumeric(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false
  if (typeof value === 'number') return Number.isFinite(value)
  // aceita vírgula decimal (padrão Protheus BR)
  return !Number.isNaN(Number(String(value).replace(',', '.')))
}

function isYmdDate(value: unknown): boolean {
  const s = String(value ?? '').trim()
  return /^\d{8}$/.test(s)
}

export function validateResultAgainstContract(
  contract: QueryContract,
  rows: SqlRow[]
): ContractValidationResult {
  const checks: QueryCheck[] = []
  const stats: ContractStats = { rows: rows.length }

  // ─── Colunas obrigatórias (case-insensitive) ───
  const presentColumns = new Set(
    rows.length > 0 ? Object.keys(rows[0]).map((c) => c.toLowerCase()) : []
  )
  const required = contract.columns.filter((c) => c.required)
  const missing = required.filter((c) => !presentColumns.has(c.name.toLowerCase()))
  checks.push({
    key: 'required_columns',
    label: `Colunas obrigatórias do contrato (${required.length - missing.length}/${required.length})`,
    ok: rows.length === 0 ? false : missing.length === 0,
    detail:
      rows.length === 0
        ? 'Prévia sem linhas — não foi possível conferir as colunas'
        : missing.length > 0
          ? `Faltando: ${missing.map((c) => c.name).join(', ')}`
          : undefined,
  })

  // ─── Tipos básicos (amostra de até 200 linhas) ───
  const sample = rows.slice(0, 200)
  const typeErrors: string[] = []
  for (const colDef of contract.columns) {
    if (!presentColumns.has(colDef.name.toLowerCase())) continue
    const bad = sample.filter((row) => {
      const value = row[colDef.name] ?? row[colDef.name.toUpperCase()]
      if (value === null || value === '') return false // opcionais vazios ok
      if (colDef.kind === 'number') return !isNumeric(value)
      if (colDef.kind === 'date') return !isYmdDate(value)
      return false
    })
    if (bad.length > 0) typeErrors.push(`${colDef.name} (${bad.length} linha(s))`)
  }
  checks.push({
    key: 'column_types',
    label: 'Tipos das colunas (número/data YYYYMMDD)',
    ok: typeErrors.length === 0,
    detail: typeErrors.length > 0 ? `Valores inválidos em: ${typeErrors.join('; ')}` : undefined,
  })

  // ─── Específico de SALES: fan-out e chaves duplicadas ───
  if (contract.name === 'SALES' && rows.length > 0) {
    const orders = new Set<string>()
    const customersSet = new Set<string>()
    const keys = new Set<string>()
    let duplicates = 0
    for (const row of rows) {
      const order = String(row.pedido ?? '')
      orders.add(order)
      customersSet.add(`${row.cliente_cod}:${row.cliente_loja}`)
      const key = `${order}|${row.item ?? '00'}|${row.produto_cod}`
      if (keys.has(key)) duplicates += 1
      else keys.add(key)
    }
    stats.distinctOrders = orders.size
    stats.distinctCustomers = customersSet.size
    stats.duplicateKeys = duplicates

    checks.push({
      key: 'duplicate_keys',
      label: 'Chave pedido+item+produto sem duplicidade',
      ok: duplicates === 0,
      detail:
        duplicates > 0
          ? `${duplicates} linha(s) duplicada(s) — inclua a coluna "item" (D2_ITEM/C6_ITEM) no SELECT`
          : undefined,
    })

    const fanOut = rows.length / Math.max(orders.size, 1)
    checks.push({
      key: 'fan_out',
      label: `Fan-out: ${rows.length} linhas ÷ ${orders.size} pedidos = ${fanOut.toFixed(1)} itens/pedido`,
      ok: fanOut <= 50,
      detail:
        fanOut > 50
          ? 'Média de itens por pedido muito alta — provável JOIN multiplicando linhas (TES/duplicatas)'
          : undefined,
    })
  }

  return { ok: checks.every((c) => c.ok), checks, stats }
}
