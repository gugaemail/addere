// Adapter do endpoint Protheus "qualquer SELECT" (E2; contrato confirmado em P1–P9
// e pelo payload real do consultor em 20/08/2026):
//   request : POST JSON { "query": "<SELECT ...>" } (+ page/pageSize quando paginado)
//   response: { success, page, pageSize, count, hasNext,
//               columns: [{ name, type: 'C'|'N'|... }], items: [{ col: valor }] }
// Os nomes de todos os campos são configuráveis por empresa via syncConfig.sqlApi.
//
// Pendências do contrato (aguardando consultor): payload de erro de negócio e
// URL de homologação; nomes dos parâmetros de paginação no request assumidos
// como page/pageSize (a resposta os ecoa) — por isso configuráveis.
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
  /** Linhas efetivamente carregadas — o contrato não devolve total geral */
  totalRows: number
  pages: number
  truncated: boolean
  ms: number
}

export interface SqlApiAdapter {
  run(company: SqlCompany, sql: string, opts?: SqlRunOptions): Promise<SqlRunResult>
}

// ─── Configuração por empresa (syncConfig.sqlApi) — defaults do contrato real ───

interface SqlApiConfig {
  sqlField: string
  columnsField: string
  rowsField: string
  pageField: string
  pageSizeField: string
  hasNextField: string
  successField: string
  pageSize: number
  pageable: boolean
  maxRows: number
}

const DEFAULT_SQL_API: SqlApiConfig = {
  sqlField: 'query', // confirmado no payload do consultor (20/08/2026)
  columnsField: 'columns',
  rowsField: 'items',
  pageField: 'page',
  pageSizeField: 'pageSize',
  hasNextField: 'hasNext',
  successField: 'success',
  pageSize: 100, // default observado na resposta real
  pageable: true,
  maxRows: 50_000,
}

export function resolveSqlApiConfig(syncConfig: unknown): SqlApiConfig {
  const cfg = ((syncConfig as Record<string, unknown> | null)?.sqlApi ??
    {}) as Partial<SqlApiConfig>
  return { ...DEFAULT_SQL_API, ...cfg }
}

// ─── Normalização da resposta ───

/**
 * Converte a página bruta em linhas-objeto. Aceita:
 * - contrato real: { columns: [{name,type}...], items: [{col: valor}, ...] }
 * - colunar: { columns: ['a','b'] | [{name:'a'}...], items: [[1,2], ...] }
 */
export function mapColumnarPage(
  raw: Record<string, unknown>,
  cfg: Pick<SqlApiConfig, 'columnsField' | 'rowsField'>
): SqlRow[] {
  const rowsRaw = raw[cfg.rowsField]
  if (!Array.isArray(rowsRaw)) return []

  if (rowsRaw.length > 0 && !Array.isArray(rowsRaw[0])) {
    // contrato real: items já vem como objetos { coluna: valor }
    return rowsRaw as SqlRow[]
  }

  const columnsRaw = raw[cfg.columnsField]
  if (!Array.isArray(columnsRaw)) return []
  const columns = columnsRaw.map((c) =>
    typeof c === 'string'
      ? c
      : String((c as Record<string, unknown>).name ?? (c as Record<string, unknown>).nome ?? '')
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
    let pages = 0
    let truncated = false
    const t0 = Date.now()

    try {
      let page = 1
      while (page <= MAX_PAGES) {
        const body: Record<string, unknown> = { [cfg.sqlField]: sql }
        if (cfg.pageable) {
          body[cfg.pageField] = page
          body[cfg.pageSizeField] = cfg.pageSize
        }

        const raw = (await protheusPost(company.id, company.apiSql, body, creds, {
          timeoutMs: opts.timeoutMs,
        })) as Record<string, unknown>

        // Flag de negócio do contrato (erros de transporte já viram HTTP 4xx/5xx — P8)
        if (raw[cfg.successField] === false) {
          const detail = raw['message'] ?? raw['error'] ?? raw['erro']
          throw new Error(
            `Endpoint SQL retornou ${cfg.successField}=false${
              typeof detail === 'string' ? `: ${detail.slice(0, 200)}` : ''
            }`
          )
        }

        const pageRows = mapColumnarPage(raw, cfg)
        pages += 1

        for (const row of pageRows) {
          if (rows.length >= maxRows) {
            truncated = true
            break
          }
          rows.push(row)
        }

        if (truncated || !cfg.pageable) break
        const hasNext = raw[cfg.hasNextField]
        if (hasNext === false) break
        if (pageRows.length === 0) break // segurança mesmo com hasNext=true
        // Contrato sem hasNext: para quando a página vem incompleta
        if (hasNext !== true && pageRows.length < cfg.pageSize) break
        page += 1
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
        totalRecords: rows.length,
        metadata: { queryName: opts.queryName ?? null, pages, truncated },
      })
      return { rows, totalRows: rows.length, pages, truncated, ms }
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
