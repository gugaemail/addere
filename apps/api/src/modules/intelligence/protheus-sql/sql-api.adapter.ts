// Adapter do endpoint Protheus "qualquer SELECT" (E2; contrato confirmado em P1–P9).
// Resposta colunar paginada: colunas descritas + linhas estruturadas (P3),
// paginação padrão limite/deslocamento/paginas.total (P4).
//
// INTEL_SQL_ADAPTER=mock usa o gerador sintético (13 meses, ~40 clientes) —
// desenvolvimento e smoke test sem Protheus real.

import type { IntelQueryName } from '@addere/types'
import { protheusPost } from '../../sync/protheus.client'
import { getCredentials } from '../../sync/utils'
import { logProtheusCall } from '../../sync/protheus-logger'
import { generateMockDataset } from './mock-dataset'

export type SqlRow = Record<string, string | number | null>

export interface SqlCompany {
  id: string
  apiSql: string | null
  apiToken: string | null
  usrProtheus: string | null
  passProtheus: string | null
  syncConfig?: unknown
}

export interface SqlRunOptions {
  /** Contrato sendo executado (o mock usa; o adapter real ignora) */
  queryName?: IntelQueryName
  timeoutMs?: number
  /** Teto de linhas — corta a paginação e marca truncated */
  maxRows?: number
}

export interface SqlRunResult {
  rows: SqlRow[]
  totalRows: number
  pages: number
  truncated: boolean
  ms: number
}

export interface SqlApiAdapter {
  run(company: SqlCompany, sql: string, opts?: SqlRunOptions): Promise<SqlRunResult>
}

// ─── Configuração por empresa (syncConfig.sqlApi) — defaults do contrato P2/P3 ───

interface SqlApiConfig {
  sqlField: string
  columnsField: string
  rowsField: string
  pageSize: number
  pageable: boolean
  maxRows: number
}

const DEFAULT_SQL_API: SqlApiConfig = {
  sqlField: 'sql', // pendência leve P2 — configurável por empresa
  columnsField: 'colunas',
  rowsField: 'linhas',
  pageSize: 200,
  pageable: true,
  maxRows: 50_000,
}

export function resolveSqlApiConfig(syncConfig: unknown): SqlApiConfig {
  const cfg = ((syncConfig as Record<string, unknown> | null)?.sqlApi ??
    {}) as Partial<SqlApiConfig>
  return { ...DEFAULT_SQL_API, ...cfg }
}

// ─── Normalização da resposta colunar (P3) ───

/**
 * Converte a página bruta em linhas-objeto. Aceita:
 * - colunar: { colunas: ['a','b'] | [{nome:'a'}...], linhas: [[1,2], ...] }
 * - lista de objetos (fallback): { linhas: [{a:1,b:2}, ...] }
 */
export function mapColumnarPage(
  raw: Record<string, unknown>,
  cfg: Pick<SqlApiConfig, 'columnsField' | 'rowsField'>
): SqlRow[] {
  const rowsRaw = raw[cfg.rowsField]
  if (!Array.isArray(rowsRaw)) return []

  if (rowsRaw.length > 0 && !Array.isArray(rowsRaw[0])) {
    // fallback: já vem como objetos
    return rowsRaw as SqlRow[]
  }

  const columnsRaw = raw[cfg.columnsField]
  if (!Array.isArray(columnsRaw)) return []
  const columns = columnsRaw.map((c) =>
    typeof c === 'string'
      ? c
      : String((c as Record<string, unknown>).nome ?? (c as Record<string, unknown>).name ?? '')
  )

  return (rowsRaw as unknown[][]).map((line) => {
    const row: SqlRow = {}
    columns.forEach((name, i) => {
      const value = line[i]
      row[name] = value === undefined || value === null ? null : (value as string | number)
    })
    return row
  })
}

// ─── Adapter real ───

const MAX_PAGES = 2000 // segurança contra loop infinito

export class ProtheusSqlAdapter implements SqlApiAdapter {
  async run(company: SqlCompany, sql: string, opts: SqlRunOptions = {}): Promise<SqlRunResult> {
    if (!company.apiSql) {
      throw new Error('Empresa sem apiSql configurada (aba Inteligência)')
    }
    const creds = getCredentials(company as Parameters<typeof getCredentials>[0])
    const cfg = resolveSqlApiConfig(company.syncConfig)
    const maxRows = Math.min(opts.maxRows ?? cfg.maxRows, cfg.maxRows)

    const rows: SqlRow[] = []
    let totalRows = 0
    let pages = 0
    let truncated = false
    const t0 = Date.now()

    try {
      let deslocamento = 1
      while (deslocamento <= MAX_PAGES) {
        const body: Record<string, unknown> = { [cfg.sqlField]: sql }
        if (cfg.pageable) {
          body.limite = cfg.pageSize
          body.deslocamento = deslocamento
        }

        const raw = (await protheusPost(company.id, company.apiSql, body, creds, {
          timeoutMs: opts.timeoutMs,
        })) as Record<string, unknown>

        const paginas = (raw['paginas'] ?? {}) as Record<string, unknown>
        const pageRows = mapColumnarPage(raw, cfg)
        pages += 1

        if (deslocamento === 1) totalRows = Number(paginas['total'] ?? 0) || 0

        for (const row of pageRows) {
          if (rows.length >= maxRows) {
            truncated = true
            break
          }
          rows.push(row)
        }

        if (truncated || !cfg.pageable) break
        if (pageRows.length === 0) break
        if (totalRows > 0 && rows.length >= totalRows) break
        if (pageRows.length < cfg.pageSize) break
        deslocamento += 1
      }

      const ms = Date.now() - t0
      // Metadata sanitizado — nunca linhas/corpo da resposta (LGPD, §2.13)
      await logProtheusCall({
        companyId: company.id,
        operation: 'intel:sql',
        endpointKey: 'apiSql',
        success: true,
        durationMs: ms,
        recordsSynced: rows.length,
        totalRecords: totalRows || rows.length,
        metadata: { queryName: opts.queryName ?? null, pages, truncated },
      })
      return { rows, totalRows: totalRows || rows.length, pages, truncated, ms }
    } catch (err) {
      const ms = Date.now() - t0
      await logProtheusCall({
        companyId: company.id,
        operation: 'intel:sql',
        endpointKey: 'apiSql',
        success: false,
        durationMs: ms,
        errorMessage: (err as Error).message,
        metadata: { queryName: opts.queryName ?? null, pages },
      })
      throw err
    }
  }
}

// ─── Adapter mock (determinístico por companyId) ───

export class MockSqlAdapter implements SqlApiAdapter {
  constructor(private referenceDate: Date = new Date()) {}

  async run(company: SqlCompany, sql: string, opts: SqlRunOptions = {}): Promise<SqlRunResult> {
    const t0 = Date.now()
    if (!opts.queryName) {
      throw new Error('MockSqlAdapter exige opts.queryName')
    }
    const dataset = generateMockDataset(company.id, this.referenceDate)
    let rows: SqlRow[] = dataset[opts.queryName]

    // Janela de datas: extraída do próprio SQL substituído (BETWEEN 'YYYYMMDD' AND 'YYYYMMDD')
    const window = sql.match(/BETWEEN\s+'(\d{8})'\s+AND\s+'(\d{8})'/i)
    if (window && opts.queryName === 'SALES') {
      const [, ini, fim] = window
      rows = rows.filter((r) => {
        const d = String(r.data ?? '')
        return d >= ini && d <= fim
      })
    }

    const maxRows = opts.maxRows ?? Infinity
    const truncated = rows.length > maxRows
    if (truncated) rows = rows.slice(0, maxRows)

    return { rows, totalRows: rows.length, pages: 1, truncated, ms: Date.now() - t0 }
  }
}

// ─── Factory por env ───

export function getSqlAdapter(kind: 'protheus' | 'mock'): SqlApiAdapter {
  return kind === 'mock' ? new MockSqlAdapter() : new ProtheusSqlAdapter()
}
