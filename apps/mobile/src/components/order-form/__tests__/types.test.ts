// Preço por UF no carrinho: o item entra no preço de tabela da UF do cliente
// e, trocado o cliente, vai para o da UF nova — preço editado fica.
import { productPriceForUf, type Product } from '@addere/types'
import { cartItemFromProduct, repriceCart } from '../types'

function product(id: string, price: number, ufPrices?: Record<string, number>): Product {
  return {
    id,
    protheusCode: id,
    name: `Produto ${id}`,
    description: null,
    price: String(price),
    ufPrices: ufPrices ?? null,
    unit: 'UN',
    stock: '0',
    saldo: '0',
    active: true,
  }
}

describe('productPriceForUf', () => {
  const p = product('P1', 10, { SP: 12.5 })

  it('UF com preço próprio usa o dela; as demais, o geral', () => {
    expect(productPriceForUf(p, 'SP')).toBe(12.5)
    expect(productPriceForUf(p, ' sp ')).toBe(12.5)
    expect(productPriceForUf(p, 'MG')).toBe(10)
  })

  it('cliente sem UF ou produto sem preço por UF: o geral', () => {
    expect(productPriceForUf(p, null)).toBe(10)
    expect(productPriceForUf(product('P2', 7), 'SP')).toBe(7)
  })

  it('sem preço da UF e sem geral: 0, e o vendedor informa no pedido', () => {
    expect(productPriceForUf(product('P3', 0, { MG: 9.9 }), 'SP')).toBe(0)
  })
})

describe('cartItemFromProduct', () => {
  it('entra no preço de tabela da UF do cliente', () => {
    expect(cartItemFromProduct(product('P1', 10, { SP: 12.5 }), 'SP').unitPrice).toBe(12.5)
  })
})

describe('repriceCart', () => {
  const catalog = [product('P1', 10, { SP: 12.5 }), product('P2', 20, { SP: 22 })]

  it('cliente de SP trocado por um de MG: itens no preço de SP vão para o geral', () => {
    const cart = [cartItemFromProduct(catalog[0], 'SP'), cartItemFromProduct(catalog[1], 'SP')]
    const repriced = repriceCart(cart, catalog, 'SP', 'MG')
    expect(repriced.map((i) => i.unitPrice)).toEqual([10, 20])
  })

  it('preço editado pelo vendedor fica', () => {
    const cart = [{ ...cartItemFromProduct(catalog[0], 'SP'), unitPrice: 11 }]
    expect(repriceCart(cart, catalog, 'SP', 'MG')[0].unitPrice).toBe(11)
  })

  it('produto fora do catálogo fica como está', () => {
    const cart = [cartItemFromProduct(catalog[0], 'SP')]
    expect(repriceCart(cart, [], 'SP', 'MG')[0].unitPrice).toBe(12.5)
  })
})
