// Cálculo de totais do pedido em aritmética inteira (centavos) — módulo puro,
// sem dependência do Prisma, compartilhado por createOrder e updateOrder e
// coberto por testes unitários.

export interface PricingItemInput {
  productId: string
  quantity: number
  unitPrice?: number
  discount?: number
  descricao?: string
  largura?: number
  espessura?: number
  encolhimento?: string
  xcrav?: '1' | '2'
  tara?: number
}

export interface PricedItem extends Omit<PricingItemInput, 'unitPrice' | 'discount'> {
  unitPrice: number
  discount: number
  total: number
}

/**
 * Calcula o total de um item em centavos usando apenas inteiros:
 * preço em centavos × quantidade em milésimos × desconto em basis points.
 */
export function computeItemTotalCents(
  unitPrice: number,
  quantity: number,
  discount: number
): number {
  const priceCents = Math.round(unitPrice * 100)
  const qty1000 = Math.round(quantity * 1000)
  const discountBP = Math.round(discount * 100) // basis points 0-10000
  return Math.round((((priceCents * qty1000) / 1000) * (10000 - discountBP)) / 10000)
}

/**
 * Aplica preço/desconto padrão e calcula os totais de cada item.
 * `defaultPrices` mapeia productId → preço de tabela (usado quando o item não
 * informa unitPrice).
 */
export function priceOrderItems(
  items: PricingItemInput[],
  defaultPrices: Map<string, number>
): { items: PricedItem[]; orderTotal: number } {
  const priced = items.map((item) => {
    const unitPrice =
      item.unitPrice !== undefined ? item.unitPrice : (defaultPrices.get(item.productId) ?? 0)
    const discount = item.discount ?? 0
    const totalCents = computeItemTotalCents(unitPrice, item.quantity, discount)

    return {
      productId: item.productId,
      quantity: item.quantity,
      unitPrice,
      discount,
      total: totalCents / 100,
      descricao: item.descricao,
      largura: item.largura,
      espessura: item.espessura,
      encolhimento: item.encolhimento,
      xcrav: item.xcrav,
      tara: item.tara,
    }
  })

  const orderTotalCents = priced.reduce((sum, i) => sum + Math.round(i.total * 100), 0)
  return { items: priced, orderTotal: orderTotalCents / 100 }
}
