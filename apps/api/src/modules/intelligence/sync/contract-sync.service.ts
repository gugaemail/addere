// Sync dos contratos publicados para as tabelas intel_* (E4; plano 009).
//
// Três modos, decididos pela consulta publicada:
// - legado (consulta sem {{DESDE}}): como sempre foi — SALES substitui a janela,
//   OPEN_TITLES substitui tudo, CUSTOMERS/PRODUCTS enriquecem;
// - incremental (com {{DESDE}} e cursor): só o que mudou no Protheus desde o
//   cursor, gravado por chave — exclusão e título baixado saem, o resto é upsert;
// - completo (com {{DESDE}}, sem cursor ou na carga semanal): a foto inteira
//   ({{INCREMENTAL}} = 0), substituindo como no legado. É a rede de segurança.

import { prisma } from '@addere/db'
import type { Company, Prisma } from '@prisma/client'
import type { IntelQueryName } from '@addere/types'
import { unprocessable } from '../../../lib/errors'
import { toStr, toNum, parseProtheusDate } from '../../sync/utils'
import { QUERY_CONTRACTS } from '../protheus-sql/contracts'
import { findPlaceholders, substitutePlaceholders } from '../protheus-sql/placeholders'
import { buildPlaceholderValues } from '../protheus-sql/placeholder-values'
import { resolveSqlAdapter, type SqlRow } from '../protheus-sql/sql-api.adapter'
import { upsertChunked } from '../../sync/upsert-chunked'
import { incrementalWindow, type DateWindow } from './windows'
import {
  STAMP_FLOOR,
  desdeFromCursor,
  inspectStamps,
  maxStamp,
  rowStamps,
  countIdenticalRows,
  resolveByKey,
  stampProblem,
} from './cursor'

const SYNC_TIMEOUT_MS = 120_000
const BACKFILL_TIMEOUT_MS = 300_000 // timeout folgado por janela mensal (P5)
// SALES no modo completo (primeira execução e carga semanal): o histórico longo
// é do backfill; aqui só a rede de segurança das últimas semanas
const FULL_SALES_WINDOW_DAYS = 35
// SALES no modo incremental: o motor lê 12 meses — cancelamento mais antigo que
// isso não muda nenhum sinal
const INCREMENTAL_SALES_WINDOW_DAYS = 400
const DELETE_CHUNK = 500

export type ContractSyncMode = 'legacy' | 'full' | 'incremental'

export interface ContractSyncResult {
  name: IntelQueryName
  mode: ContractSyncMode
  rows: number
  synced: number
  errors: string[]
  ms: number
}

/** Resultado da gravação; `complete` = nenhuma escrita falhou (o cursor só anda assim). */
interface PersistResult {
  synced: number
  errors: string[]
  complete: boolean
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
    // `dias_atraso` ainda é gravado, mas ninguém mais lê: o atraso é calculado
    // do vencimento na leitura (daysOverdueOn) — valor do ERP congelaria
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

async function loadPublishedSql(company: Company, name: IntelQueryName): Promise<string> {
  const query = await prisma.intelQuery.findFirst({
    where: { companyId: company.id, name, published: true },
    orderBy: { version: 'desc' },
  })
  if (!query) throw unprocessable(`Consulta ${QUERY_CONTRACTS[name].labelPt} não está publicada`)
  return query.sql
}

async function fetchContractRows(
  company: Company,
  name: IntelQueryName,
  sql: string,
  window: DateWindow,
  timeoutMs: number,
  desde?: string
): Promise<{ rows: SqlRow[]; ms: number }> {
  const contract = QUERY_CONTRACTS[name]
  const { values, errors } = await buildPlaceholderValues(company, contract, window, desde)
  const substituted = substitutePlaceholders(sql, values)
  const allErrors = [...errors, ...substituted.errors]
  if (allErrors.length > 0) throw unprocessable(allErrors.join('; '))

  const adapter = resolveSqlAdapter(company)
  const result = await adapter.run(company, substituted.sql, { queryName: name, timeoutMs })
  return { rows: result.rows, ms: result.ms }
}

// ─── Persistência por contrato ───

interface ResolvedRows {
  live: SqlRow[]
  deleted: SqlRow[]
}

/**
 * Chave de cada contrato, com a mesma normalização dos mapeamentos — é por ela
 * que as N cópias de um registro apagado e incluído de novo viram uma só.
 */
const ROW_KEY: Partial<Record<IntelQueryName, (row: SqlRow) => string | null>> = {
  SALES: (row) => {
    const get = rowReader(row)
    const orderRef = toStr(get('pedido')).trim()
    const productCode = toStr(get('produto_cod')).trim()
    if (!orderRef || !productCode) return null
    return `${orderRef}|${toStr(get('item'), '00').trim() || '00'}|${productCode}`
  },
  OPEN_TITLES: (row) => toStr(rowReader(row)('titulo')).trim() || null,
  CUSTOMERS: (row) => {
    const get = rowReader(row)
    const code = toStr(get('cliente_cod')).trim()
    return code ? `${code}|${toStr(get('cliente_loja'), '01').trim() || '01'}` : null
  },
  PRODUCTS: (row) => toStr(rowReader(row)('produto_cod')).trim() || null,
}

/** Apaga em lotes (um OR de milhares de chaves vira um SQL grande demais). */
async function deleteInChunks<T>(keys: T[], run: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < keys.length; i += DELETE_CHUNK) await run(keys.slice(i, i + DELETE_CHUNK))
}

async function persistSales(
  company: Company,
  { live, deleted }: ResolvedRows,
  window: DateWindow,
  mode: ContractSyncMode
): Promise<PersistResult> {
  const { records, skipped } = mapSalesRows(company.id, live)
  const errors = skipped.map((ref) => `linha ignorada (chave incompleta): ${ref}`)

  if (mode !== 'incremental') {
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
    return { synced: records.length, errors, complete: true }
  }

  // Incremental: nota cancelada (de qualquer idade) sai pela chave; a viva é
  // upsert. Chave com cópia viva nunca chega em `deleted` (resolveByKey)
  const removed = mapSalesRows(company.id, deleted).records
  await deleteInChunks(removed, (chunk) =>
    prisma.salesItem.deleteMany({
      where: {
        companyId: company.id,
        OR: chunk.map((r) => ({
          orderRef: r.orderRef,
          itemSeq: r.itemSeq,
          productCode: r.productCode,
        })),
      },
    })
  )
  const result = await upsertChunked(
    records,
    (r) =>
      prisma.salesItem.upsert({
        where: {
          companyId_orderRef_itemSeq_productCode: {
            companyId: r.companyId,
            orderRef: r.orderRef,
            itemSeq: r.itemSeq,
            productCode: r.productCode,
          },
        },
        create: r,
        update: r,
      }),
    (r) => `${r.orderRef}/${r.itemSeq}/${r.productCode}`
  )
  return {
    synced: result.synced,
    errors: [...errors, ...result.errors],
    complete: result.errors.length === 0,
  }
}

async function persistOpenTitles(
  company: Company,
  { live, deleted }: ResolvedRows,
  mode: ContractSyncMode
): Promise<PersistResult> {
  const { records, skipped } = mapOpenTitleRows(company.id, live)
  const errors = skipped.map((ref) => `título ignorado (chave incompleta): ${ref}`)
  // A consulta legada já filtra saldo > 0; a incremental traz também os baixados
  const open = mode === 'legacy' ? records : records.filter((r) => r.balance > 0)

  if (mode !== 'incremental') {
    // Foto do momento: replace total por tenant
    await prisma.$transaction([
      prisma.openTitle.deleteMany({ where: { companyId: company.id } }),
      prisma.openTitle.createMany({ data: open, skipDuplicates: true }),
    ])
    return { synced: open.length, errors, complete: true }
  }

  // Incremental: título excluído ou baixado (saldo zerado) sai — é assim que o
  // Addere fica sabendo do pagamento; o resto é upsert por chave
  const gone = [
    ...mapOpenTitleRows(company.id, deleted).records,
    ...records.filter((r) => r.balance <= 0),
  ].map((r) => r.titleRef)
  await deleteInChunks(gone, (chunk) =>
    prisma.openTitle.deleteMany({ where: { companyId: company.id, titleRef: { in: chunk } } })
  )
  const result = await upsertChunked(
    open,
    (r) =>
      prisma.openTitle.upsert({
        where: { companyId_titleRef: { companyId: r.companyId, titleRef: r.titleRef } },
        create: r,
        update: r,
      }),
    (r) => r.titleRef
  )
  return {
    synced: result.synced,
    errors: [...errors, ...result.errors],
    complete: result.errors.length === 0,
  }
}

/**
 * Cliente excluído no Protheus (D_E_L_E_T_='*') vira `active = false` no Addere —
 * o mesmo soft delete de lá: o registro fica. Bloqueio (A1_MSBLQL) não passa
 * por aqui: bloqueado continua ativo (plano 010).
 */
async function deactivateDeletedCustomers(company: Company, deleted: SqlRow[]) {
  const keys = deleted
    .map((row) => {
      const get = rowReader(row)
      return {
        code: toStr(get('cliente_cod')).trim(),
        loja: toStr(get('cliente_loja'), '01').trim() || '01',
      }
    })
    .filter((k) => k.code)
  return upsertChunked(
    keys,
    (k) =>
      prisma.customer.updateMany({
        where: { companyId: company.id, protheusCode: k.code, loja: k.loja },
        data: { active: false },
      }) as unknown as Prisma.PrismaPromise<unknown>,
    (k) => `${k.code}/${k.loja}`
  )
}

/** Produto excluído no Protheus vira `active = false` — mesmo entendimento do cliente. */
async function deactivateDeletedProducts(company: Company, deleted: SqlRow[]) {
  const codes = deleted.map((row) => toStr(rowReader(row)('produto_cod')).trim()).filter(Boolean)
  return upsertChunked(
    codes,
    (code) =>
      prisma.product.updateMany({
        where: { companyId: company.id, protheusCode: code },
        data: { active: false },
      }) as unknown as Prisma.PrismaPromise<unknown>,
    (code) => code
  )
}

export interface CustomerEnrichmentRecord {
  code: string
  loja: string
  creditLimit: number | null
  segment: string | null
  /** undefined = a consulta não trouxe a coluna `bloqueado` (não mexe no msblql) */
  msblql: string | null | undefined
}

export function mapCustomerEnrichmentRows(rows: SqlRow[]): CustomerEnrichmentRecord[] {
  const records: CustomerEnrichmentRecord[] = []
  for (const row of rows) {
    const get = rowReader(row)
    const code = toStr(get('cliente_cod')).trim()
    if (!code) continue
    const creditRaw = get('limite_credito')
    const blockedRaw = get('bloqueado')
    records.push({
      code,
      loja: toStr(get('cliente_loja'), '01').trim() || '01',
      creditLimit: creditRaw === null || creditRaw === undefined || creditRaw === '' ? null : toNum(creditRaw),
      segment: toStr(get('segmento')).trim() || null,
      // Mesma normalização do sync REST (A1_MSBLQL): vazio vira null. Só grava
      // msblql — bloqueio nunca mexe em `active` (que é exclusão)
      msblql: blockedRaw === undefined ? undefined : toStr(blockedRaw) || null,
    })
  }
  return records
}

async function persistCustomerEnrichment(
  company: Company,
  rows: SqlRow[]
): Promise<{ synced: number; errors: string[] }> {
  const records = mapCustomerEnrichmentRows(rows)

  const result = await upsertChunked(
    records,
    (r) =>
      prisma.customer.updateMany({
        where: { companyId: company.id, protheusCode: r.code, loja: r.loja },
        data: {
          ...(r.creditLimit === null ? {} : { creditLimit: r.creditLimit }),
          ...(r.segment === null ? {} : { segment: r.segment }),
          ...(r.msblql === undefined ? {} : { msblql: r.msblql }),
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

function defaultWindow(name: IntelQueryName, mode: ContractSyncMode): DateWindow {
  const contract = QUERY_CONTRACTS[name]
  if (name === 'SALES' && mode === 'full') return incrementalWindow(FULL_SALES_WINDOW_DAYS)
  if (name === 'SALES' && mode === 'incremental') {
    return incrementalWindow(INCREMENTAL_SALES_WINDOW_DAYS)
  }
  return incrementalWindow(contract.incrementalWindowDays ?? 7)
}

/**
 * Move a marca d'água depois de uma execução bem-sucedida.
 * - incremental: para o maior carimbo recebido, só se toda a gravação deu certo
 *   (senão a próxima execução relê — gravar por chave torna isso inofensivo);
 * - completo: cria o cursor se não havia. A carga semanal NÃO move um cursor
 *   existente — ela cobre só a foto/janela dela, e avançar o cursor por ela
 *   pularia alteração recente fora da janela.
 */
async function advanceCursor(
  companyId: string,
  name: IntelQueryName,
  mode: ContractSyncMode,
  rows: SqlRow[],
  current: { stamp: string } | null,
  complete: boolean
): Promise<string | null> {
  if (!complete) return null
  const newest = maxStamp(rowStamps(rows).stamps)
  const key = { companyId_name: { companyId, name } }
  if (mode === 'incremental') {
    if (!newest || (current && newest <= current.stamp)) return null
    await prisma.intelSyncCursor.update({ where: key, data: { stamp: newest } })
    return null
  }
  if (current) {
    await prisma.intelSyncCursor.update({ where: key, data: { lastFullAt: new Date() } })
    return null
  }
  if (rows.length > 0 && !inspectStamps(rows).hasColumn) {
    return 'consulta com {{DESDE}} sem a coluna stamp — o contrato segue em carga completa'
  }
  // Todos os carimbos vazios (nada mudou desde que o S_T_A_M_P_ foi ativado) ou
  // foto vazia: o cursor nasce no piso. O incremental seguinte traz só o que já
  // tem carimbo — os NULL nunca passam no `S_T_A_M_P_ > {{DESDE}}`, e não
  // precisam, porque não mudaram; ganham carimbo quando mudarem.
  await prisma.intelSyncCursor.create({
    data: { companyId, name, stamp: newest ?? STAMP_FLOOR, lastFullAt: new Date() },
  })
  return null
}

/**
 * Executa o sync de um contrato publicado. Com janela explícita (backfill), roda
 * a foto daquela janela e não toca o cursor. `full` força a carga completa (a
 * semanal do noturno de domingo).
 */
export async function syncContract(
  company: Company,
  name: IntelQueryName,
  window?: DateWindow,
  opts: { backfill?: boolean; full?: boolean } = {}
): Promise<ContractSyncResult> {
  const timeoutMs = opts.backfill ? BACKFILL_TIMEOUT_MS : SYNC_TIMEOUT_MS
  const sql = await loadPublishedSql(company, name)

  const incrementalCapable = findPlaceholders(sql).includes('DESDE')
  const tracksCursor = incrementalCapable && !window && !opts.backfill
  const cursor = tracksCursor
    ? await prisma.intelSyncCursor.findUnique({
        where: { companyId_name: { companyId: company.id, name } },
        select: { stamp: true },
      })
    : null
  const mode: ContractSyncMode = !incrementalCapable
    ? 'legacy'
    : cursor && !opts.full
      ? 'incremental'
      : 'full'

  const effectiveWindow = window ?? defaultWindow(name, mode)
  const desde = mode === 'incremental' && cursor ? desdeFromCursor(cursor.stamp) : undefined
  const { rows, ms } = await fetchContractRows(company, name, sql, effectiveWindow, timeoutMs, desde)

  // Sem a coluna stamp (ou com formato errado) o cursor não tem como andar
  if (mode === 'incremental') {
    const problem = stampProblem(rows)
    if (problem) throw unprocessable(`Sync incremental: ${problem}`)
  }

  // Mesma linha em duas páginas: a paginação do endpoint está instável e outra
  // linha ficou de fora. Gravar assim perderia dado em silêncio — falha alto
  if (mode !== 'legacy') {
    const repeated = countIdenticalRows(rows)
    if (repeated > 0) {
      throw unprocessable(
        `${repeated} linha(s) idêntica(s) repetida(s): a paginação do endpoint não está ` +
          'estável e outras linhas ficaram de fora. Inclua ORDER BY R_E_C_N_O_ na consulta'
      )
    }
  }

  const resolved = resolveByKey(rows, ROW_KEY[name] ?? (() => null))
  const { live, deleted } = resolved
  let persisted: PersistResult
  switch (name) {
    case 'SALES':
      persisted = await persistSales(company, resolved, effectiveWindow, mode)
      break
    case 'OPEN_TITLES':
      persisted = await persistOpenTitles(company, resolved, mode)
      break
    case 'CUSTOMERS': {
      const enriched = await persistCustomerEnrichment(company, live)
      const gone = await deactivateDeletedCustomers(company, deleted)
      persisted = {
        synced: enriched.synced,
        errors: [...enriched.errors, ...gone.errors],
        complete: enriched.errors.length === 0 && gone.errors.length === 0,
      }
      break
    }
    case 'PRODUCTS': {
      const enriched = await persistProductEnrichment(company, live)
      const gone = await deactivateDeletedProducts(company, deleted)
      persisted = {
        synced: enriched.synced,
        errors: [...enriched.errors, ...gone.errors],
        complete: enriched.errors.length === 0 && gone.errors.length === 0,
      }
      break
    }
    default:
      // STOCK é ON_DEMAND — não tem persistência de sync
      persisted = {
        synced: 0,
        errors: [`Contrato ${name} não participa do sync agendado`],
        complete: false,
      }
  }

  const errors = [...persisted.errors]
  if (tracksCursor) {
    const warning = await advanceCursor(company.id, name, mode, rows, cursor, persisted.complete)
    if (warning) errors.push(warning)
  }

  return { name, mode, rows: rows.length, synced: persisted.synced, errors, ms }
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
