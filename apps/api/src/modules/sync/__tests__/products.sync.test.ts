// Sync REST de produtos com preço por UF: a apiPord manda os preços do
// produto no campo preco — um objeto por UF, numa string sem colchetes — ou um
// registro por produto e UF. UF em branco é o preço geral (price); as demais
// vão para ufPrices. API sem UF continua igual a antes.
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
import { parsePriceList, syncProducts } from '../products.sync'

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

// Trechos do retorno real da apiPord (28/10/2026)
const LIST_PRICE =
  '{"atual": 500.55,"anterior":0,"moeda":"BRL","uf":"AC"},{"atual": 465.1,"anterior":0,"moeda":"BRL","uf":"AL"}'
// O estoque do produto anterior vem colado na frente da lista, sem vírgula
const LIST_WITH_LEFTOVER =
  '{"quantidade": 89,"localizacao":"01"}{"atual": 575.97,"anterior":0,"moeda":"BRL","uf":"AC"},{"atual": 610.88,"anterior":0,"moeda":"BRL","uf":"BA"},{"atual": 610.88,"anterior":0,"moeda":"BRL","uf":"BA"}'
const BLANK_UF = '{"atual": 0,"anterior":0,"moeda":"BRL","uf":" "}'

describe('parsePriceList', () => {
  it('string com um objeto por UF, sem colchetes', () => {
    expect(parsePriceList(LIST_PRICE)).toEqual([
      { uf: 'AC', price: 500.55 },
      { uf: 'AL', price: 465.1 },
    ])
  })

  it('descarta o estoque colado na frente e aceita UF repetida', () => {
    expect(parsePriceList(LIST_WITH_LEFTOVER)).toEqual([
      { uf: 'AC', price: 575.97 },
      { uf: 'BA', price: 610.88 },
      { uf: 'BA', price: 610.88 },
    ])
  })

  it('UF " " é o preço geral; sem uf também', () => {
    expect(parsePriceList(BLANK_UF)).toEqual([{ uf: '', price: 0 }])
    expect(parsePriceList('{"atual": 10.5,"anterior":0,"moeda":"BRL"}')).toEqual([
      { uf: '', price: 10.5 },
    ])
  })

  it('aceita objeto, lista JSON e string com colchetes', () => {
    expect(parsePriceList({ atual: 7, uf: 'sp' })).toEqual([{ uf: 'SP', price: 7 }])
    expect(parsePriceList([{ atual: 7, uf: 'SP' }])).toEqual([{ uf: 'SP', price: 7 }])
    expect(parsePriceList('[{"atual": 7,"uf":"SP"}]')).toEqual([{ uf: 'SP', price: 7 }])
  })

  it('vazio ou JSON quebrado: nenhum preço', () => {
    expect(parsePriceList('')).toEqual([])
    expect(parsePriceList(undefined)).toEqual([])
    expect(parsePriceList('{"atual": 7,')).toEqual([])
  })
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

  it('formato da API: um registro por produto, os preços por UF dentro do preco', async () => {
    rawRows.push(
      { id: 'AAA145', nome: 'SACO 200L AZ', preco: LIST_PRICE, estoque: '{"quantidade": 89}' },
      {
        id: 'AAB044',
        nome: 'SACO 200L BR',
        preco: LIST_WITH_LEFTOVER,
        estoque: '{"quantidade": 55}',
      },
      { id: 'ADAAD2641', nome: 'SC 200L AZUL', preco: BLANK_UF, estoque: '{"quantidade": 0}' }
    )

    const result = await syncProducts('c1')

    expect(upsertArgsFor('AAA145').update).toMatchObject({
      price: 0,
      ufPrices: { AC: 500.55, AL: 465.1 },
      stock: 89,
    })
    expect(upsertArgsFor('AAB044').update).toMatchObject({
      price: 0,
      ufPrices: { AC: 575.97, BA: 610.88 },
      stock: 55,
    })
    expect(upsertArgsFor('ADAAD2641').update).toMatchObject({ price: 0, ufPrices: Prisma.DbNull })
    expect(result).toMatchObject({ synced: 3, total: 3 })
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
