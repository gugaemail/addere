import { describe, it, expect } from 'vitest'
import { computeItemTotalCents, priceOrderItems } from '../orders.pricing'

describe('computeItemTotalCents', () => {
  it('calcula total simples sem desconto', () => {
    expect(computeItemTotalCents(10, 2, 0)).toBe(2000)
  })

  it('aplica desconto percentual', () => {
    expect(computeItemTotalCents(100, 1, 10)).toBe(9000)
  })

  it('não sofre erro de float (0.1 + 0.2)', () => {
    // 19.90 × 3 = 59.70 — em float ingênuo daria 59.699999...
    expect(computeItemTotalCents(19.9, 3, 0)).toBe(5970)
  })

  it('suporta quantidade fracionada em milésimos', () => {
    expect(computeItemTotalCents(10, 0.5, 0)).toBe(500)
    expect(computeItemTotalCents(10, 1.125, 0)).toBe(1125)
  })

  it('desconto de 100% zera o total', () => {
    expect(computeItemTotalCents(50, 4, 100)).toBe(0)
  })

  it('arredonda meio centavo para cima', () => {
    // 0.01 × 0.5 = 0.005 → 1 centavo × 500/1000 = 0.5 → round = 1... na prática 0.005 → 1
    expect(computeItemTotalCents(0.01, 0.5, 0)).toBe(1)
  })
})

describe('priceOrderItems', () => {
  const defaultPrices = new Map([['p1', 25.5], ['p2', 10]])

  it('usa o preço de tabela quando o item não informa unitPrice', () => {
    const { items, orderTotal } = priceOrderItems(
      [{ productId: 'p1', quantity: 2 }],
      defaultPrices
    )
    expect(items[0].unitPrice).toBe(25.5)
    expect(items[0].total).toBe(51)
    expect(orderTotal).toBe(51)
  })

  it('prioriza o unitPrice informado no item', () => {
    const { items } = priceOrderItems(
      [{ productId: 'p1', quantity: 1, unitPrice: 30 }],
      defaultPrices
    )
    expect(items[0].unitPrice).toBe(30)
    expect(items[0].total).toBe(30)
  })

  it('soma o total do pedido em centavos, sem drift de float', () => {
    const { orderTotal } = priceOrderItems(
      [
        { productId: 'p1', quantity: 3, unitPrice: 19.9 },
        { productId: 'p2', quantity: 3, unitPrice: 0.1 },
      ],
      defaultPrices
    )
    expect(orderTotal).toBe(60)
  })

  it('preserva os campos extras do item', () => {
    const { items } = priceOrderItems(
      [{ productId: 'p1', quantity: 1, largura: 1.5, xcrav: '2', descricao: 'x' }],
      defaultPrices
    )
    expect(items[0]).toMatchObject({ largura: 1.5, xcrav: '2', descricao: 'x' })
  })
})
