import { prisma } from '@addere/db'
import type { SyncSchedule } from '@addere/types'
import { DEFAULT_SYNC_SCHEDULE } from '@addere/types'
import { unprocessable } from '../../lib/errors'
import { logProtheusCall } from './protheus-logger'
import { fetchPaginated } from './paginated-fetch'
import { upsertChunked } from './upsert-chunked'
import { getCredentials, parseJsonField, toStr, toNum } from './utils'

type ProductData = {
  protheusCode: string
  name: string
  price: number
  unit: string
  stock: number
  saldo: number
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

  const filial   = branch.idProtheus
  const creds    = getCredentials(company)
  const schedule = (company.syncSchedule as SyncSchedule | null) ?? DEFAULT_SYNC_SCHEDULE
  const INTERV   = schedule.products.interv ?? 0
  const t0 = Date.now()

  try {
    const { records, totalRecords, totalFetched } = await fetchPaginated<ProductData>({
      companyId,
      url:       company.apiPord,
      creds,
      listKey:   'produtos',
      bodyExtra: { B2_FILIAL: filial, DA1_FILIAL: filial, INTERV },
      mapRecord: (raw) => {
        const protheusCode = toStr(raw['id'])
        if (!protheusCode) return null

        const price = toNum(parseJsonField(raw['preco'])['atual'])
        const stock = toNum(parseJsonField(raw['estoque'])['quantidade'])

        return {
          protheusCode,
          name:  toStr(raw['nome'], protheusCode),
          price: Number.isFinite(price) ? price : 0,
          unit:  'UN',
          stock: Number.isFinite(stock) ? stock : 0,
          saldo: Number.isFinite(stock) ? stock : 0,
        }
      },
    })

    const { synced, errors } = await upsertChunked(
      records,
      (p) => prisma.product.upsert({
        where: { companyId_protheusCode: { companyId, protheusCode: p.protheusCode } },
        update: { name: p.name, price: p.price, unit: p.unit, stock: p.stock, saldo: p.saldo, active: true },
        create: { companyId, protheusCode: p.protheusCode, name: p.name, price: p.price, unit: p.unit, stock: p.stock, saldo: p.saldo },
      }),
      (p) => p.protheusCode
    )

    await logProtheusCall({
      companyId,
      operation:     operationLabel,
      endpointKey:   'apiPord',
      success:       true,
      durationMs:    Date.now() - t0,
      recordsSynced: synced,
      totalRecords:  totalRecords || totalFetched,
    })

    return { synced, total: totalRecords || records.length, errors }
  } catch (err: unknown) {
    const e = err as { response?: { status?: number }; message?: string }
    await logProtheusCall({
      companyId,
      operation:    operationLabel,
      endpointKey:  'apiPord',
      success:      false,
      httpStatus:   e.response?.status,
      durationMs:   Date.now() - t0,
      errorMessage: e.message,
    })
    throw err
  }
}
