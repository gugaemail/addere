// Gerador sintético determinístico para o MockSqlAdapter (E2).
// 40 clientes cobrindo todos os status do motor, 13 meses de vendas com ciclo
// por cliente, títulos, produtos e estoque — mesma semente por companyId.

import type { IntelQueryName } from '@addere/types'
import type { SqlRow } from './sql-api.adapter'

// PRNG determinístico (mulberry32) a partir de uma string
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10).replace(/-/g, '')
}

const CITIES: [string, string, string][] = [
  ['Recife', 'PE', 'Boa Viagem'],
  ['Recife', 'PE', 'Piedade'],
  ['Recife', 'PE', 'Afogados'],
  ['Olinda', 'PE', 'Casa Caiada'],
]

const GROUPS = ['ALIMENTOS', 'LIMPEZA', 'BEBIDAS', 'HIGIENE']

export type MockDataset = Record<IntelQueryName, SqlRow[]>

const cache = new Map<string, MockDataset>()

export function generateMockDataset(companyId: string, referenceDate: Date): MockDataset {
  const cacheKey = `${companyId}:${ymd(referenceDate)}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const rand = seededRandom(companyId)
  const today = new Date(referenceDate)

  // ─── Produtos (20) ───
  const products: SqlRow[] = []
  for (let i = 1; i <= 20; i++) {
    const code = `P${String(i).padStart(3, '0')}`
    products.push({
      produto_cod: code,
      produto_desc: `Produto ${i}`,
      grupo: GROUPS[i % GROUPS.length],
      ativo: 'S',
      preco_tabela: Math.round((5 + rand() * 95) * 100) / 100,
    })
  }

  // ─── Clientes (40) com perfil de ciclo ───
  const customers: SqlRow[] = []
  const sales: SqlRow[] = []
  const titles: SqlRow[] = []
  let orderSeq = 10000

  for (let i = 1; i <= 40; i++) {
    const code = `C${String(i).padStart(4, '0')}`
    const [city, uf, district] = CITIES[i % CITIES.length]
    // perfis: 0-24 ativos com ciclo, 25-29 novos, 30-33 em risco, 34-37 inativos, 38-39 bloqueados
    const profile =
      i <= 25 ? 'active' : i <= 30 ? 'new' : i <= 34 ? 'risk' : i <= 38 ? 'inactive' : 'blocked'
    const cycleDays = 7 + Math.floor(rand() * 45) // 7–52 dias
    const ticketBase = 500 + rand() * 4500

    // última compra conforme o perfil
    let lastGap: number
    if (profile === 'active') lastGap = Math.floor(rand() * cycleDays * 1.2)
    else if (profile === 'new') lastGap = Math.floor(rand() * 30)
    else if (profile === 'risk') lastGap = Math.floor(cycleDays * 2.2 + rand() * 30)
    else if (profile === 'inactive') lastGap = 130 + Math.floor(rand() * 100)
    else lastGap = Math.floor(rand() * 20)

    const lastPurchase = new Date(today)
    lastPurchase.setDate(lastPurchase.getDate() - lastGap)

    customers.push({
      cliente_cod: code,
      cliente_loja: '01',
      cliente_nome: `Cliente ${i} ${city}`,
      vendedor_cod: i % 2 === 0 ? '000001' : '000002',
      cidade: city,
      uf,
      bairro: district,
      endereco: `Rua ${i}, ${100 + i}`,
      cep: `51020${String(100 + i)}`,
      cnpj: `000000000001${String(i).padStart(2, '0')}`,
      bloqueado: profile === 'blocked' ? '1' : '2',
      limite_credito: Math.round(ticketBase * 3 * 100) / 100,
      segmento: i % 3 === 0 ? 'atacado' : 'varejo',
      ultima_compra: ymd(lastPurchase),
    })

    // histórico de pedidos: recua a partir da última compra, ciclo com jitter
    // novos: ≤ 2 pedidos; demais: até 13 meses
    const horizon = new Date(today)
    horizon.setMonth(horizon.getMonth() - 13)
    let cursor = new Date(lastPurchase)
    let orders = 0
    const maxOrders = profile === 'new' ? 1 + Math.floor(rand() * 2) : 99

    while (cursor >= horizon && orders < maxOrders) {
      orderSeq += 1
      const orderRef = `PED${orderSeq}`
      const itemCount = 1 + Math.floor(rand() * 4)
      for (let item = 1; item <= itemCount; item++) {
        const product = products[Math.floor(rand() * products.length)]
        const qty = 1 + Math.floor(rand() * 20)
        sales.push({
          pedido: orderRef,
          item: String(item).padStart(2, '0'),
          data: ymd(cursor),
          cliente_cod: code,
          cliente_loja: '01',
          vendedor_cod: customers[customers.length - 1].vendedor_cod,
          produto_cod: product.produto_cod,
          produto_desc: product.produto_desc,
          quantidade: qty,
          valor: Math.round(qty * Number(product.preco_tabela) * 100) / 100,
          grupo_produto: product.grupo,
        })
      }
      orders += 1
      const jitter = Math.floor((rand() - 0.5) * cycleDays * 0.4)
      cursor = new Date(cursor)
      cursor.setDate(cursor.getDate() - cycleDays - jitter)
    }

    // títulos vencidos para os bloqueados + alguns a vencer
    if (profile === 'blocked') {
      const due = new Date(today)
      due.setDate(due.getDate() - (10 + Math.floor(rand() * 30)))
      titles.push({
        titulo: `TIT${code}`,
        cliente_cod: code,
        cliente_loja: '01',
        vencimento: ymd(due),
        valor_saldo: Math.round(ticketBase * 0.6 * 100) / 100,
        dias_atraso: Math.floor((today.getTime() - due.getTime()) / 86_400_000),
      })
    } else if (rand() < 0.2) {
      const due = new Date(today)
      due.setDate(due.getDate() + Math.floor(rand() * 30))
      titles.push({
        titulo: `TIT${code}`,
        cliente_cod: code,
        cliente_loja: '01',
        vencimento: ymd(due),
        valor_saldo: Math.round(ticketBase * 0.4 * 100) / 100,
        dias_atraso: 0,
      })
    }
  }

  const stock: SqlRow[] = products.map((p) => ({
    produto_cod: p.produto_cod,
    saldo: Math.floor(rand() * 500),
    local: '01',
  }))

  const dataset: MockDataset = {
    CUSTOMERS: customers,
    SALES: sales,
    OPEN_TITLES: titles,
    PRODUCTS: products,
    STOCK: stock,
  }
  cache.set(cacheKey, dataset)
  return dataset
}
