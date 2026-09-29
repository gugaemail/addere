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
  ['Campinas', 'SP', 'Cambuí'],
  ['Campinas', 'SP', 'Barão Geraldo'],
  ['Valinhos', 'SP', 'Centro'],
  ['Vinhedo', 'SP', 'Capela'],
]

const STREETS = [
  'Av. Francisco Glicério',
  'R. Barão de Jaguara',
  'Av. Orosimbo Maia',
  'R. Conceição',
  'Av. Andrade Neves',
  'R. Dr. Quirino',
  'Av. Aquidabã',
  'R. General Osório',
]

// Elenco fictício: nenhum nome aqui existe. O dataset alimenta o tenant de
// demonstração, que vira screenshot de loja e conta do revisor da Apple — dado
// de cliente real não pode chegar em nenhum dos dois.
const CUSTOMER_NAMES = [
  'Mercado Dona Nair',
  'Empório Vale Verde',
  'Mercado Vila Nova',
  'Supermercado Boa Colheita',
  'Armazém São Lucas',
  'Mercearia do Tião',
  'Atacado Primavera',
  'Casa das Embalagens Aurora',
  'Distribuidora Céu Azul',
  'Mercado Ponto Certo',
  'Empório Terra Boa',
  'Supermercado Jardim Real',
  'Mercearia Flor de Liz',
  'Atacadão Bom Preço Lagoa',
  'Mercado São Benedito',
  'Empório da Serra',
  'Padaria Pão de Ouro',
  'Mercado Recanto Feliz',
  'Casa Nova Alimentos',
  'Distribuidora Monte Alto',
  'Mercado Estrela do Norte',
  'Empório Raiz Forte',
  'Supermercado Vista Alegre',
  'Mercearia Santa Rita',
  'Atacado Rio Claro',
  'Mercado Bela Vista',
  'Empório Cantinho Bom',
  'Adega Sol Poente',
  'Mercado Nova Aurora',
  'Distribuidora Passo Largo',
  'Mercearia do Zé',
  'Supermercado Campo Belo',
  'Empório Boa Safra',
  'Mercado Sete Colinas',
  'Casa do Produtor',
  'Atacado Vale do Sol',
  'Mercado Girassol',
  'Empório Luar',
  'Mercearia Bom Retiro',
  'Distribuidora Horizonte',
]

// Descrição e grupo andam juntos: com `GROUPS[i % 4]` o "Produto 7" caía em
// BEBIDAS sem nada a ver, e o mix sugerido da visita ficava incoerente na tela.
const PRODUCTS: [string, string][] = [
  ['Arroz Tipo 1 5kg', 'ALIMENTOS'],
  ['Feijão Carioca 1kg', 'ALIMENTOS'],
  ['Macarrão Espaguete 500g', 'ALIMENTOS'],
  ['Açúcar Refinado 1kg', 'ALIMENTOS'],
  ['Óleo de Soja 900ml', 'ALIMENTOS'],
  ['Detergente Neutro 500ml', 'LIMPEZA'],
  ['Água Sanitária 1L', 'LIMPEZA'],
  ['Sabão em Pó 1kg', 'LIMPEZA'],
  ['Desinfetante Lavanda 2L', 'LIMPEZA'],
  ['Esponja Multiuso 4un', 'LIMPEZA'],
  ['Refrigerante Cola 2L', 'BEBIDAS'],
  ['Suco de Uva Integral 1L', 'BEBIDAS'],
  ['Água Mineral 500ml', 'BEBIDAS'],
  ['Cerveja Pilsen 350ml', 'BEBIDAS'],
  ['Energético 250ml', 'BEBIDAS'],
  ['Sabonete Glicerina 90g', 'HIGIENE'],
  ['Papel Higiênico 4un', 'HIGIENE'],
  ['Creme Dental 90g', 'HIGIENE'],
  ['Shampoo 350ml', 'HIGIENE'],
  ['Desodorante Aerosol 150ml', 'HIGIENE'],
]

export type MockDataset = Record<IntelQueryName, SqlRow[]>

const cache = new Map<string, MockDataset>()

export function generateMockDataset(companyId: string, referenceDate: Date): MockDataset {
  const cacheKey = `${companyId}:${ymd(referenceDate)}`
  const cached = cache.get(cacheKey)
  if (cached) return cached

  const rand = seededRandom(companyId)
  const today = new Date(referenceDate)

  // ─── Produtos (20) ───
  const products: SqlRow[] = PRODUCTS.map(([desc, grupo], i) => ({
    produto_cod: `P${String(i + 1).padStart(3, '0')}`,
    produto_desc: desc,
    grupo,
    ativo: 'S',
    preco_tabela: Math.round((5 + rand() * 95) * 100) / 100,
  }))

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
      cliente_nome: CUSTOMER_NAMES[i - 1],
      vendedor_cod: i % 2 === 0 ? '000001' : '000002',
      cidade: city,
      uf,
      bairro: district,
      endereco: `${STREETS[i % STREETS.length]}, ${100 + i * 7}`,
      cep: `130${String(10 + (i % 80)).padStart(2, '0')}${String(100 + i)}`,
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
