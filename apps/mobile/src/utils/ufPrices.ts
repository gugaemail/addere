import { productPriceForUf, type Customer, type Product } from '@addere/types'

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
  /** UF do preço — a da carteira com mais clientes; null sem UF na carteira. */
  uf: string | null
}

/**
 * Preço do produto na aba Produtos: o da UF dos clientes do vendedor — sem
 * preço para a UF, o geral; sem nenhum, 0. Carteira em mais de uma UF: vale a
 * UF com mais clientes. Só esse preço aparece — nunca o das outras UFs.
 */
export function catalogPrice(
  product: Pick<Product, 'price' | 'ufPrices'>,
  ufs: string[]
): CatalogPrice {
  const uf = ufs[0] ?? null
  return { price: productPriceForUf(product, uf), uf }
}
