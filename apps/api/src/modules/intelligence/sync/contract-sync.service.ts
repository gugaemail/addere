// Sync dos contratos publicados para as tabelas intel_* (E4).
// SALES: incremental com replace por janela (delete + createMany em transação);
// OPEN_TITLES: replace total por tenant; CUSTOMERS/PRODUCTS: enriquecimento.

import { prisma } from '@addere/db'
import type { Company, Prisma } from '@prisma/client'
import type { IntelQueryName } from '@addere/types'
import { env } from '../../../lib/env'
import { unprocessable } from '../../../lib/errors'
import { toStr, toNum, parseProtheusDate } from '../../sync/utils'
import { QUERY_CONTRACTS } from '../protheus-sql/contracts'
import { substitutePlaceholders } from '../protheus-sql/placeholders'
import { buildPlaceholderValues } from '../protheus-sql/placeholder-values'
import { getSqlAdapter, type SqlRow } from '../protheus-sql/sql-api.adapter'
import { upsertChunked } from '../../sync/upsert-chunked'
import { incrementalWindow, type DateWindow } from './windows'

const SYNC_TIMEOUT_MS = 120_000
const BACKFILL_TIMEOUT_MS = 300_000 // timeout folgado por janela mensal (P5)

export interface ContractSyncResult {
  name: IntelQueryName
  rows: number
  synced: number
  errors: string[]
  ms: number
}

// Acesso case-insensitive às colunas (aliases podem voltar em maiúsculas)
function rowReader(row: SqlRow) {
  const lower = new Map<string, unknown>()
  for (const [key, value] of Object.entries(row)) lower.set(key.toLowerCase(), value)
  return (column: string) => lower.get(column)
}

// ─── Mapeamentos linha → registro (puros, testáveis) ───

export interface SalesItemRecord {
  companyId: string
  orderRef: string
  itemSeq: string
  productCode: string
  date: Date
  customerCode: string
  loja: string
  vendorCode: string | null
  quantity: number
  amount: number
  productDesc: string | null
  productGroup: string | null
}

export function mapSalesRows(companyId: string, rows: SqlRow[]): {
  records: SalesItemRecord[]
  skipped: string[]
} {
  const records: SalesItemRecord[] = []
  const skipped: string[] = []
  for (const row of rows) {
    const get = rowReader(row)
    const orderRef = toStr(get('pedido')).trim()
    const productCode = toStr(get('produto_cod')).trim()
    const date = parseProtheusDate(get('data'))
    const customerCode = toStr(get('cliente_cod')).trim()
    if (!orderRef || !productCode || !date || !customerCode) {
      skipped.push(orderRef || productCode || 'linha sem chave')
      continue
    }
    records.push({
      companyId,
      orderRef,
      itemSeq: toStr(get('item'), '00').trim() || '00',
      productCode,
      date,
      customerCode,
      loja: toStr(get('cliente_loja'), '01').trim() || '01',
      vendorCode: toStr(get('vendedor_cod')).trim() || null,
      quantity: toNum(get('quantidade')),
      amount: toNum(get('valor')),
      productDesc: toStr(get('produto_desc')).trim() || null,
      productGroup: toStr(get('grupo_produto')).trim() || null,
    })
  }
  return { records, skipped }
}

export interface OpenTitleRecord {
  companyId: string
  titleRef: string
  customerCode: string
  loja: string
  dueDate: Date
  balance: number
  daysOverdue: number | null
}

export function mapOpenTitleRows(companyId: string, rows: SqlRow[]): {
  records: OpenTitleRecord[]
  skipped: string[]
} {
  const records: OpenTitleRecord[] = []
  const skipped: string[] = []
  for (const row of rows) {
    const get = rowReader(row)
    const titleRef = toStr(get('titulo')).trim()
    const customerCode = toStr(get('cliente_cod')).trim()
    const dueDate = parseProtheusDate(get('vencimento'))
    if (!titleRef || !customerCode || !dueDate) {
      skipped.push(titleRef || 'título sem chave')
      continue
    }
    const daysOverdueRaw = get('dias_atraso')
    records.push({
      companyId,
      titleRef,
      customerCode,
      loja: toStr(get('cliente_loja'), '01').trim() || '01',
      dueDate,
      balance: toNum(get('valor_saldo')),
      daysOverdue: daysOverdueRaw === null || daysOverdueRaw === undefined || daysOverdueRaw === ''
        ? null
        : Math.trunc(toNum(daysOverdueRaw)),
    })
  }
  return { records, skipped }
}

// ─── Execução do contrato no ERP ───

async function fetchContractRows(
  company: Company,
  name: IntelQueryName,
  window: DateWindow,
  timeoutMs: number
): Promise<{ rows: SqlRow[]; ms: number }> {
  const contract = QUERY_CONTRACTS[name]
  const query = await prisma.intelQuery.findFirst({
    where: { companyId: company.id, name, published: true },
    orderBy: { version: 'desc' },
  })
  if (!query) throw unprocessable(`Consulta ${contract.labelPt} não está publicada`)

  const { values, errors } = await buildPlaceholderValues(company, contract, window)
  const substituted = substitutePlaceholders(query.sql, values)
  const allErrors = [...errors, ...substituted.errors]
  if (allErrors.length > 0) throw unprocessable(allErrors.join('; '))

  const adapter = getSqlAdapter(env.INTEL_SQL_ADAPTER)
  const result = await adapter.run(company, substituted.sql, { queryName: name, timeoutMs })
  return { rows: result.rows, ms: result.ms }
}

// ─── Persistência por contrato ───

async function persistSales(
  company: Company,
  rows: SqlRow[],
  window: DateWindow
): Promise<{ synced: number; errors: string[] }> {
  const { records, skipped } = mapSalesRows(company.id, rows)
  const errors = skipped.map((ref) => `linha ignorada (chave incompleta): ${ref}`)

  const toDate = (ymd: string) =>
    new Date(Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8))))

  // Replace por janela: apaga o intervalo e regrava — idempotente por execução
  await prisma.$transaction([
    prisma.salesItem.deleteMany({
      where: {
        companyId: company.id,
        date: { gte: toDate(window.dataIni), lte: toDate(window.dataFim) },
      },
    }),
    prisma.salesItem.createMany({ data: records, skipDuplicates: true }),
  ])
  return { synced: records.length, errors }
}

async function persistOpenTitles(
  company: Company,
  rows: SqlRow[]
): Promise<{ synced: number; errors: string[] }> {
  const { records, skipped } = mapOpenTitleRows(company.id, rows)
  const errors = skipped.map((ref) => `título ignorado (chave incompleta): ${ref}`)

  // Foto do momento: replace total por tenant
  await prisma.$transaction([
    prisma.openTitle.deleteMany({ where: { companyId: company.id } }),
    prisma.openTitle.createMany({ data: records, skipDuplicates: true }),
  ])
  return { synced: records.length, errors }
}

async function persistCustomerEnrichment(
  company: Company,
  rows: SqlRow[]
): Promise<{ synced: number; errors: string[] }> {
  type Enrichment = { code: string; loja: string; creditLimit: number | null; segment: string | null }
  const records: Enrichment[] = []
  for (const row of rows) {
    const get = rowReader(row)
    const code = toStr(get('cliente_cod')).trim()
    if (!code) continue
    const creditRaw = get('limite_credito')
    records.push({
      code,
      loja: toStr(get('cliente_loja'), '01').trim() || '01',
      creditLimit: creditRaw === null || creditRaw === undefined || creditRaw === '' ? null : toNum(creditRaw),
      segment: toStr(get('segmento')).trim() || null,
    })
  }

  const result = await upsertChunked(
    records,
    (r) =>
      prisma.customer.updateMany({
        where: { companyId: company.id, protheusCode: r.code, loja: r.loja },
        data: {
          ...(r.creditLimit === null ? {} : { creditLimit: r.creditLimit }),
          ...(r.segment === null ? {} : { segment: r.segment }),
        },
      }) as unknown as Prisma.PrismaPromise<unknown>,
    (r) => `${r.code}/${r.loja}`
  )
  return { synced: result.synced, errors: result.errors }
}

async function persistProductEnrichment(
  company: Company,
  rows: SqlRow[]
): Promise<{ synced: number; errors: string[] }> {
  type Enrichment = { code: string; group: string | null }
  const records: Enrichment[] = []
  for (const row of rows) {
    const get = rowReader(row)
    const code = toStr(get('produto_cod')).trim()
    if (!code) continue
    records.push({ code, group: toStr(get('grupo')).trim() || null })
  }

  const result = await upsertChunked(
    records,
    (r) =>
      prisma.product.updateMany({
        where: { companyId: company.id, protheusCode: r.code },
        data: { ...(r.group === null ? {} : { productGroup: r.group }) },
      }) as unknown as Prisma.PrismaPromise<unknown>,
    (r) => r.code
  )
  return { synced: result.synced, errors: result.errors }
}

// ─── API do serviço ───

/** Executa o sync de um contrato publicado numa janela (default: incremental 7d). */
export async function syncContract(
  company: Company,
  name: IntelQueryName,
  window?: DateWindow,
  opts: { backfill?: boolean } = {}
): Promise<ContractSyncResult> {
  const contract = QUERY_CONTRACTS[name]
  const effectiveWindow =
    window ?? incrementalWindow(contract.incrementalWindowDays ?? 7)
  const timeoutMs = opts.backfill ? BACKFILL_TIMEOUT_MS : SYNC_TIMEOUT_MS

  const { rows, ms } = await fetchContractRows(company, name, effectiveWindow, timeoutMs)

  let persisted: { synced: number; errors: string[] }
  switch (name) {
    case 'SALES':
      persisted = await persistSales(company, rows, effectiveWindow)
      break
    case 'OPEN_TITLES':
      persisted = await persistOpenTitles(company, rows)
      break
    case 'CUSTOMERS':
      persisted = await persistCustomerEnrichment(company, rows)
      break
    case 'PRODUCTS':
      persisted = await persistProductEnrichment(company, rows)
      break
    default:
      // STOCK é ON_DEMAND — não tem persistência de sync
      persisted = { synced: 0, errors: [`Contrato ${name} não participa do sync agendado`] }
  }

  return { name, rows: rows.length, synced: persisted.synced, errors: persisted.errors, ms }
}

/** Contratos publicados do tenant que pertencem às frequências pedidas. */
export async function publishedContracts(
  companyId: string,
  frequencies: Array<'DAILY' | 'REFRESH' | 'WEEKLY'>
): Promise<IntelQueryName[]> {
  const published = await prisma.intelQuery.findMany({
    where: { companyId, published: true },
    select: { name: true },
  })
  const names = new Set(published.map((q) => q.name))
  return Object.values(QUERY_CONTRACTS)
    .filter((c) => names.has(c.name) && frequencies.includes(c.frequency as never))
    .map((c) => c.name)
}
