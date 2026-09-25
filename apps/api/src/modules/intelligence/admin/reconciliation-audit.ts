// Auditoria da reconciliação (W3) — puro, sem I/O.
// Quem cadastra a consulta precisa conseguir refazer a conta fora do Addere:
// o SQL exatamente como foi executado, quantas linhas e páginas voltaram, as
// filiais do {{FILIAL}}, o total agrupado por data (e por filial, quando a
// consulta traz a coluna) e sinais concretos de problema — linhas repetidas
// entre páginas, resultado cortado, chave repetida, valores que não viraram número.
// A métrica vem do contrato: soma de uma coluna (vendas no mês, títulos hoje) ou
// contagem de linhas (clientes, produtos).
import type { IntelQueryName, ReconciliationAudit, ReconciliationSpec } from '@addere/types'
import type { SqlRow } from '../protheus-sql/sql-api.adapter'

export interface AuditInput {
  name: IntelQueryName
  spec: ReconciliationSpec
  rows: SqlRow[]
  executedSql: string
  /** null = posição de hoje (snapshot) */
  window: { dataIni: string; dataFim: string } | null
  branches: string[]
  pages: number
  pageSize: number | null
  truncated: boolean
  source: 'protheus' | 'mock'
  endpointHost: string | null
}

export interface AuditResult {
  calcAmount: number
  audit: ReconciliationAudit
  /** Causas concretas, detectadas nos dados — vêm antes das genéricas */
  concreteCauses: string[]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Valor do ERP → número: aceita number, "1234.56", "1.234,56" e "1234,56". */
export function parseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const s = String(raw).trim().replace(/[R$\s]/g, '')
  if (!s) return null
  const normalized =
    s.includes(',') && (!s.includes('.') || s.lastIndexOf('.') < s.lastIndexOf(','))
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/** Host do endpoint sem caminho, usuário ou query string — nunca credencial. */
export function endpointHostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dateKey(raw: unknown, granularity: 'day' | 'month' | null): string {
  const value = String(raw ?? '').trim()
  if (!value) return 'sem data'
  if (granularity === 'month' && /^\d{8}$/.test(value)) return value.slice(0, 6)
  return value
}

export function auditReconciliation(input: AuditInput): AuditResult {
  const { spec } = input
  const isSum = spec.kind === 'SUM_MONTH' || spec.kind === 'SUM_SNAPSHOT'
  const unit: 'currency' | 'count' = isSum ? 'currency' : 'count'

  const byDate = new Map<string, { rows: number; amount: number }>()
  const branchColumn =
    input.rows.length > 0 ? (Object.keys(input.rows[0]).find((c) => /filial/i.test(c)) ?? null) : null
  const byBranch = new Map<string, { rows: number; amount: number }>()
  const seenRows = new Set<string>()
  const seenKeys = new Map<string, string>() // chave → fingerprint da primeira linha
  const orders = new Set<string>()
  let duplicateRows = 0
  let duplicateKeys = 0
  let invalidValues = 0
  let total = 0

  for (const row of input.rows) {
    let amount = 0
    if (isSum && spec.column) {
      const value = parseAmount(row[spec.column])
      if (value === null) invalidValues += 1
      amount = value ?? 0
      total += amount
    } else {
      total += 1
    }

    if (spec.dateColumn) {
      const key = dateKey(row[spec.dateColumn], spec.dateGranularity)
      const entry = byDate.get(key) ?? { rows: 0, amount: 0 }
      entry.rows += 1
      entry.amount += amount
      byDate.set(key, entry)
    }

    if (branchColumn) {
      const branch = String(row[branchColumn] ?? '').trim() || 'vazia'
      const entry = byBranch.get(branch) ?? { rows: 0, amount: 0 }
      entry.rows += 1
      entry.amount += amount
      byBranch.set(branch, entry)
    }

    // Linha idêntica em todas as colunas: é página devolvida duas vezes pelo endpoint
    const fingerprint = JSON.stringify(Object.keys(row).sort().map((k) => [k, row[k]]))
    const identical = seenRows.has(fingerprint)
    if (identical) duplicateRows += 1
    else seenRows.add(fingerprint)

    // Mesma chave do contrato com conteúdo diferente: JOIN multiplicando linhas
    if (spec.keyColumns.length > 0) {
      const key = spec.keyColumns.map((c) => String(row[c] ?? '')).join('|')
      const first = seenKeys.get(key)
      if (first === undefined) seenKeys.set(key, fingerprint)
      else if (!identical && first !== fingerprint) duplicateKeys += 1
    }

    if (input.name === 'SALES') orders.add(String(row.pedido ?? ''))
  }

  const calcAmount = isSum ? round2(total) : total
  const toList = (map: Map<string, { rows: number; amount: number }>) =>
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ key, rows: v.rows, amount: isSum ? round2(v.amount).toFixed(2) : '' }))

  const concreteCauses: string[] = []
  if (input.source === 'mock') {
    concreteCauses.push(
      'A API está com dados sintéticos (INTEL_SQL_ADAPTER=mock): este total não veio do Protheus'
    )
  }
  if (input.truncated) {
    concreteCauses.push(`Resultado cortado em ${input.rows.length} linhas — o total está incompleto`)
  }
  if (duplicateRows > 0) {
    concreteCauses.push(
      `${duplicateRows} linha(s) idêntica(s) repetida(s) — provável página devolvida mais de uma vez pelo endpoint (${input.pages} página(s)${input.pageSize ? ` de até ${input.pageSize} linhas` : ''})`
    )
  }
  if (duplicateKeys > 0) {
    concreteCauses.push(
      `${duplicateKeys} linha(s) com a mesma chave (${spec.keyColumns.join(' + ')}) e conteúdo diferente — JOIN multiplicando linhas`
    )
  }
  if (input.branches.length > 1) {
    const detail = branchColumn
      ? 'veja o total por filial abaixo'
      : 'inclua a coluna da filial no SELECT para ver o total de cada uma'
    concreteCauses.push(
      `O total inclui ${input.branches.length} filiais (${input.branches.join(', ')}) — se o número oficial é de uma só, ${detail}`
    )
  }
  if (invalidValues > 0) {
    concreteCauses.push(`${invalidValues} valor(es) não numérico(s) foram ignorados na soma`)
  }

  const rowsText = `${input.rows.length} linha(s) em ${input.pages} página(s)`
  return {
    calcAmount,
    concreteCauses,
    audit: {
      source: input.source,
      endpointHost: input.endpointHost,
      executedSql: input.executedSql,
      window: input.window,
      branches: input.branches,
      rows: input.rows.length,
      pages: input.pages,
      pageSize: input.pageSize,
      truncated: input.truncated,
      kind: spec.kind,
      unit,
      column: isSum ? spec.column : null,
      keyColumns: spec.keyColumns,
      duplicateRows,
      duplicateKeys,
      invalidValues,
      distinctOrders: input.name === 'SALES' ? orders.size : null,
      dateColumn: spec.dateColumn,
      dateGranularity: spec.dateGranularity,
      byDay: toList(byDate).map((d) => ({ date: d.key, rows: d.rows, amount: d.amount })),
      branchColumn,
      byBranch: branchColumn
        ? toList(byBranch).map((b) => ({ branch: b.key, rows: b.rows, amount: b.amount }))
        : [],
      summary: isSum ? `${rowsText}, somando ${fmtBRL(calcAmount)}` : rowsText,
    },
  }
}

// ─── CSV das linhas (o mesmo resultado que foi somado ou contado) ───

const BOM = String.fromCharCode(0xfeff)
const CRLF = String.fromCharCode(13, 10)

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'number' ? String(value).replace('.', ',') : String(value)
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** CSV com ";" e BOM UTF-8 — abre direto no Excel em português. */
export function rowsToCsv(rows: SqlRow[]): string {
  const columns: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key)
  }
  const lines = [columns.join(';'), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(';'))]
  return BOM + lines.join(CRLF)
}
