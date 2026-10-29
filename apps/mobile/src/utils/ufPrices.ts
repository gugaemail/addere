import { productPriceForUf, type Customer, type Product } from '@addere/types'
import { fmtMoeda } from './format'

/** UFs da carteira, da que tem mais clientes para a que tem menos. */
export function portfolioUfs(customers: Pick<Customer, 'uf'>[] | undefined): string[] {
  const count = new Map<string, number>()
  for (const { uf } of customers ?? []) {
    const key = uf?.trim().toUpperCase()
    if (key) count.set(key, (count.get(key) ?? 0) + 1)
  }
  return [...count.entries()]
    .sort(([ufA, a], [ufB, b]) => b - a || ufA.localeCompare(ufB))
    .map(([uf]) => uf)
}

export interface CatalogPrice {
  price: number
  /** UF do preço grande — só quando a carteira tem mais de uma UF. */
  uf: string | null
  /** Outras UFs da carteira com preço diferente: "MG R$ 463,24 · RJ R$ 470,95". */
  others: string | null
}

/**
 * Preço do produto na aba Produtos: o da UF dos clientes do vendedor — sem
 * preço para a UF, o geral; sem nenhum, 0. Carteira em mais de uma UF: a UF
 * com mais clientes fica no preço grande e as outras numa linha, só as de
 * preço diferente. Nunca a tabela inteira de UFs.
 */
export function catalogPrice(
  product: Pick<Product, 'price' | 'ufPrices'>,
  ufs: string[]
): CatalogPrice {
  const [main, ...rest] = ufs
  const price = productPriceForUf(product, main)
  const others = rest
    .map((uf) => ({ uf, price: productPriceForUf(product, uf) }))
    .filter((o) => o.price !== price)
    .map((o) => `${o.uf} R$ ${fmtMoeda(o.price)}`)
  return {
    price,
    uf: rest.length > 0 ? main : null,
    others: others.length > 0 ? others.join(' · ') : null,
  }
}
