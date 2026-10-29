// Sync REST de produtos com preço por UF: a apiPord manda um registro por
// produto e UF da tabela de preço. UF em branco é o preço geral (price); as
// demais vão para ufPrices. API sem UF continua igual a antes.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Prisma } from '@prisma/client'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

// A paginação real chama o Protheus; aqui ela só aplica o mapRecord às linhas
const rawRows: Record<string, unknown>[] = []
vi.mock('../paginated-fetch', () => ({
  fetchPaginated: async (opts: { mapRecord: (raw: Record<string, unknown>) => unknown }) => {
    const records = rawRows.map(opts.mapRecord).filter((r) => r !== null)
    return { records, totalRecords: records.length, totalFetched: records.length }
  },
}))
vi.mock('../protheus-logger', () => ({ logProtheusCall: async () => undefined }))
vi.mock('../utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils')>()),
  getCredentials: () => ({}),
}))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { syncProducts } from '../products.sync'

function companyWithInterv(interv: number) {
  prismaMock.company.findUniqueOrThrow.mockResolvedValue({
    id: 'c1',
    apiPord: 'https://erp.example.com/produtos',
    branches: [{ idProtheus: '01' }],
    syncSchedule: {
      products: { interv, scheduleMin: 0, auto: false },
      customers: { interv: 0, scheduleMin: 0, auto: false },
    },
  })
}

function row(id: string, atual: number, uf?: string) {
  return {
    id,
    nome: `Produto ${id}`,
    preco: uf === undefined ? { atual } : { atual, uf },
    estoque: { quantidade: 7 },
  }
}

function upsertArgsFor(code: string) {
  const call = prismaMock.product.upsert.mock.calls.find(
    ([args]: [{ where: { companyId_protheusCode: { protheusCode: string } } }]) =>
      args.where.companyId_protheusCode.protheusCode === code
  )
  return call?.[0]
}

beforeEach(() => {
  resetPrismaMock()
  rawRows.length = 0
})

describe('syncProducts — carga completa (INTERV = 0)', () => {
  beforeEach(() => companyWithInterv(0))

  it('junta os registros do produto: UF em branco é o geral, as outras viram ufPrices', async () => {
    rawRows.push(row('P1', 10.5, ''), row('P1', 11.2, 'sp'), row('P1', 9.9, 'MG'))

    const result = await syncProducts('c1')

    expect(prismaMock.product.upsert).toHaveBeenCalledTimes(1)
    const args = upsertArgsFor('P1')
    expect(args.update).toMatchObject({ price: 10.5, ufPrices: { SP: 11.2, MG: 9.9 }, stock: 7 })
    expect(args.create).toMatchObject({ price: 10.5, ufPrices: { SP: 11.2, MG: 9.9 } })
    // O painel mostra "X de Y": o total conta produtos, não registros por UF
    expect(result).toMatchObject({ synced: 1, total: 1 })
  })

  it('API sem UF: preço geral como antes e ufPrices nulo', async () => {
    rawRows.push(row('P2', 5))

    await syncProducts('c1')

    const args = upsertArgsFor('P2')
    expect(args.update.price).toBe(5)
    expect(args.update.ufPrices).toBe(Prisma.DbNull)
  })

  it('só preço de UF, sem o geral: price 0 — o vendedor de outra UF informa o preço', async () => {
    rawRows.push(row('P3', 9.9, 'MG'))

    await syncProducts('c1')

    expect(upsertArgsFor('P3').update).toMatchObject({ price: 0, ufPrices: { MG: 9.9 } })
  })

  it('não lê os preços gravados: a carga completa substitui', async () => {
    rawRows.push(row('P1', 10.5, ''))

    await syncProducts('c1')

    expect(prismaMock.product.findMany).not.toHaveBeenCalled()
    expect(upsertArgsFor('P1').update.ufPrices).toBe(Prisma.DbNull)
  })
})

describe('syncProducts — incremental (INTERV > 0)', () => {
  beforeEach(() => companyWithInterv(60))

  it('soma o preço de UF alterado aos gravados e não mexe no geral', async () => {
    prismaMock.product.findMany.mockResolvedValue([
      { protheusCode: 'P1', ufPrices: { SP: 11, MG: 9 } },
    ])
    rawRows.push(row('P1', 12, 'SP'))

    await syncProducts('c1')

    const args = upsertArgsFor('P1')
    expect(args.update.ufPrices).toEqual({ SP: 12, MG: 9 })
    expect(args.update).not.toHaveProperty('price')
  })

  it('registro geral alterado atualiza o price e mantém os de UF', async () => {
    prismaMock.product.findMany.mockResolvedValue([{ protheusCode: 'P1', ufPrices: { SP: 11 } }])
    rawRows.push(row('P1', 10))

    await syncProducts('c1')

    expect(upsertArgsFor('P1').update).toMatchObject({ price: 10, ufPrices: { SP: 11 } })
  })
})
