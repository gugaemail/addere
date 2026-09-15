// Auditoria da reconciliação (W3) — puro, sem I/O.
// Quem cadastra a consulta precisa conseguir refazer a conta fora do Addere:
// o SQL exatamente como foi executado, quantas linhas e páginas voltaram, as
// filiais do {{FILIAL}}, a soma por dia (e por filial, quando a consulta traz
// a coluna) e sinais concretos de problema — linhas repetidas entre páginas,
// resultado cortado, valores que não viraram número.
import type { IntelQueryName, ReconciliationAudit } from '@addere/types'
import type { SqlRow } from '../protheus-sql/sql-api.adapter'

export interface AuditInput {
  name: IntelQueryName
  rows: SqlRow[]
  executedSql: string
  window: { dataIni: string; dataFim: string }
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

export function auditReconciliation(input: AuditInput): AuditResult {
  const byDay = new Map<string, { rows: number; amount: number }>()
  const branchColumn =
    input.rows.length > 0 ? (Object.keys(input.rows[0]).find((c) => /filial/i.test(c)) ?? null) : null
  const byBranch = new Map<string, { rows: number; amount: number }>()
  const seenRows = new Set<string>()
  const seenKeys = new Set<string>()
  const orders = new Set<string>()
  let duplicateRows = 0
  let duplicateKeys = 0
  let invalidValues = 0
  let total = 0

  for (const row of input.rows) {
    const value = parseAmount(row.valor)
    if (value === null) invalidValues += 1
    const amount = value ?? 0
    total += amount

    const day = String(row.data ?? '').trim() || 'sem data'
    const dayEntry = byDay.get(day) ?? { rows: 0, amount: 0 }
    dayEntry.rows += 1
    dayEntry.amount += amount
    byDay.set(day, dayEntry)

    if (branchColumn) {
      const branch = String(row[branchColumn] ?? '').trim() || 'vazia'
      const branchEntry = byBranch.get(branch) ?? { rows: 0, amount: 0 }
      branchEntry.rows += 1
      branchEntry.amount += amount
      byBranch.set(branch, branchEntry)
    }

    // Linha idêntica em todas as colunas: numa venda com pedido+item isso não
    // acontece de verdade — é página devolvida duas vezes pelo endpoint
    const fingerprint = JSON.stringify(Object.keys(row).sort().map((k) => [k, row[k]]))
    if (seenRows.has(fingerprint)) duplicateRows += 1
    else seenRows.add(fingerprint)

    if (input.name === 'SALES') {
      const order = String(row.pedido ?? '')
      orders.add(order)
      const key = `${order}|${row.item ?? '00'}|${row.produto_cod ?? ''}`
      if (seenKeys.has(key)) duplicateKeys += 1
      else seenKeys.add(key)
    }
  }

  const calcAmount = round2(total)
  const toList = (map: Map<string, { rows: number; amount: number }>) =>
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => ({ key, rows: v.rows, amount: round2(v.amount).toFixed(2) }))

  const concreteCauses: string[] = []
  if (input.source === 'mock') {
    concreteCauses.push(
      'A API está com dados sintéticos (INTEL_SQL_ADAPTER=mock): este total não veio do Protheus'
    )
  }
  if (input.truncated) {
    concreteCauses.push(
      `Resultado cortado em ${input.rows.length} linhas — o total está incompleto`
    )
  }
  if (duplicateRows > 0) {
    concreteCauses.push(
      `${duplicateRows} linha(s) idêntica(s) repetida(s) — provável página devolvida mais de uma vez pelo endpoint (${input.pages} página(s)${input.pageSize ? ` de até ${input.pageSize} linhas` : ''})`
    )
  }
  if (duplicateKeys > duplicateRows) {
    concreteCauses.push(
      `${duplicateKeys - duplicateRows} linha(s) com o mesmo pedido+item+produto e valores diferentes — JOIN multiplicando itens`
    )
  }
  if (input.branches.length > 1) {
    const detail = branchColumn
      ? 'veja a soma por filial abaixo'
      : 'inclua a coluna da filial no SELECT para ver a soma de cada uma'
    concreteCauses.push(
      `A soma inclui ${input.branches.length} filiais (${input.branches.join(', ')}) — se o número oficial é de uma só, ${detail}`
    )
  }
  if (invalidValues > 0) {
    concreteCauses.push(`${invalidValues} valor(es) não numérico(s) foram ignorados na soma`)
  }

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
      duplicateRows,
      duplicateKeys,
      invalidValues,
      distinctOrders: input.name === 'SALES' ? orders.size : null,
      byDay: toList(byDay).map((d) => ({ date: d.key, rows: d.rows, amount: d.amount })),
      branchColumn,
      byBranch: branchColumn
        ? toList(byBranch).map((b) => ({ branch: b.key, rows: b.rows, amount: b.amount }))
        : [],
      summary: `${input.rows.length} linha(s) em ${input.pages} página(s), somando ${fmtBRL(calcAmount)}`,
    },
  }
}

// ─── CSV das linhas (o mesmo resultado que foi somado) ───

const BOM = String.fromCharCode(0xfeff)
const CRLF = String.fromCharCode(13, 10)

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text: string
  if (typeof value === 'number') {
    // Excel em pt-BR: vírgula decimal
    text = String(value).replace('.', ',')
  } else {
    text = String(value)
  }
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
