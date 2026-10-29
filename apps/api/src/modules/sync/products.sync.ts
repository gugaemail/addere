import { Prisma } from '@prisma/client'
import { prisma } from '@addere/db'
import type { SyncSchedule } from '@addere/types'
import { DEFAULT_SYNC_SCHEDULE } from '@addere/types'
import { unprocessable } from '../../lib/errors'
import { logProtheusCall } from './protheus-logger'
import { fetchPaginated } from './paginated-fetch'
import { upsertChunked } from './upsert-chunked'
import { getCredentials, parseJsonField, toStr, toNum } from './utils'

// Um registro da apiPord: um por produto e UF da tabela de preço
export type PriceRecord = {
  protheusCode: string
  uf: string // '' = preço geral (UF em branco, ou ausente na API sem UF)
  name: string
  price: number
  stock: number
}

type ProductData = {
  protheusCode: string
  name: string
  generalPrice: number | undefined // undefined: nenhum registro com UF em branco
  ufPrices: Record<string, number>
  unit: string
  stock: number
  saldo: number
}

/**
 * Junta os registros de cada produto num só: o de UF em branco é o preço
 * geral, os demais viram o preço daquela UF. Exportado para o teste.
 */
export function groupPriceRecords(records: PriceRecord[]): ProductData[] {
  const byCode = new Map<string, ProductData>()
  for (const r of records) {
    let product = byCode.get(r.protheusCode)
    if (!product) {
      product = {
        protheusCode: r.protheusCode,
        name: r.name,
        generalPrice: undefined,
        ufPrices: {},
        unit: 'UN',
        stock: r.stock,
        saldo: r.stock,
      }
      byCode.set(r.protheusCode, product)
    }
    if (r.uf) product.ufPrices[r.uf] = r.price
    else product.generalPrice = r.price
  }
  return [...byCode.values()]
}

function toUfPrices(value: Prisma.JsonValue | undefined): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === 'number' && Number.isFinite(entry[1])
    )
  )
}

export async function syncProducts(companyId: string, operationLabel = 'syncProducts') {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    include: { branches: { where: { active: true }, take: 1 } },
  })

  if (!company.apiPord) throw unprocessable('URL apiPord não configurada')

  const branch = company.branches[0]
  if (!branch) throw unprocessable('Nenhuma filial ativa encontrada para a empresa')
  if (!branch.idProtheus) throw unprocessable('Filial sem código Protheus configurado')

  const filial = branch.idProtheus
  const creds = getCredentials(company)
  const schedule = (company.syncSchedule as SyncSchedule | null) ?? DEFAULT_SYNC_SCHEDULE
  const INTERV = schedule.products.interv ?? 0
  const t0 = Date.now()

  try {
    const { records, totalRecords } = await fetchPaginated<PriceRecord>({
      companyId,
      url: company.apiPord,
      creds,
      listKey: 'produtos',
      bodyExtra: { B2_FILIAL: filial, DA1_FILIAL: filial, INTERV },
      mapRecord: (raw) => {
        const protheusCode = toStr(raw['id'])
        if (!protheusCode) return null

        const preco = parseJsonField(raw['preco'])
        const price = toNum(preco['atual'])
        const stock = toNum(parseJsonField(raw['estoque'])['quantidade'])

        return {
          protheusCode,
          uf: toStr(preco['uf']).toUpperCase(),
          name: toStr(raw['nome'], protheusCode),
          price: Number.isFinite(price) ? price : 0,
          stock: Number.isFinite(stock) ? stock : 0,
        }
      },
    })

    // A carga completa (INTERV = 0) traz todos os preços do produto e
    // substitui os gravados; a incremental traz só os registros alterados,
    // que se somam aos de antes — sem o de UF em branco, o geral fica como está
    const full = INTERV === 0
    const products = groupPriceRecords(records)
    const saved = new Map<string, Prisma.JsonValue>()
    if (!full && products.length > 0) {
      const rows = await prisma.product.findMany({
        where: { companyId, protheusCode: { in: products.map((p) => p.protheusCode) } },
        select: { protheusCode: true, ufPrices: true },
      })
      for (const row of rows) if (row.protheusCode) saved.set(row.protheusCode, row.ufPrices)
    }

    const { synced, errors } = await upsertChunked(
      products,
      (p) => {
        const merged = full
          ? p.ufPrices
          : { ...toUfPrices(saved.get(p.protheusCode)), ...p.ufPrices }
        const ufPrices = Object.keys(merged).length > 0 ? merged : Prisma.DbNull
        return prisma.product.upsert({
          where: { companyId_protheusCode: { companyId, protheusCode: p.protheusCode } },
          update: {
            name: p.name,
            ...(full || p.generalPrice !== undefined ? { price: p.generalPrice ?? 0 } : {}),
            ufPrices,
            unit: p.unit,
            stock: p.stock,
            saldo: p.saldo,
            active: true,
          },
          create: {
            companyId,
            protheusCode: p.protheusCode,
            name: p.name,
            price: p.generalPrice ?? 0,
            ufPrices,
            unit: p.unit,
            stock: p.stock,
            saldo: p.saldo,
          },
        })
      },
      (p) => p.protheusCode
    )

    // Com preço por UF a API conta registros (produto × UF), não produtos
    const total =
      products.length < records.length ? products.length : totalRecords || records.length

    await logProtheusCall({
      companyId,
      operation: operationLabel,
      endpointKey: 'apiPord',
      success: true,
      durationMs: Date.now() - t0,
      recordsSynced: synced,
      totalRecords: total,
    })

    return { synced, total, errors }
  } catch (err: unknown) {
    const e = err as { response?: { status?: number }; message?: string }
    await logProtheusCall({
      companyId,
      operation: operationLabel,
      endpointKey: 'apiPord',
      success: false,
      httpStatus: e.response?.status,
      durationMs: Date.now() - t0,
      errorMessage: e.message,
    })
    throw err
  }
}
