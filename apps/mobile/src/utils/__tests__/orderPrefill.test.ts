import type { Product } from '@addere/types'
import { cartFromMix, parseMixParam } from '../orderPrefill'

function product(id: string, protheusCode: string | null, name: string, price: number): Product {
  return {
    id,
    companyId: 'company-1',
    protheusCode,
    name,
    description: null,
    unit: 'UN',
    price: String(price),
    stock: '0',
    saldo: '0',
    productGroup: null,
    active: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  } as unknown as Product
}

const CATALOG = [
  product('id-arroz', 'P001', 'Arroz Tipo 1 5kg', 28.9),
  product('id-sabao', 'P008', 'Sabão em Pó 1kg', 14.5),
  product('id-sem-codigo', null, 'Produto sem código Protheus', 10),
]

describe('parseMixParam', () => {
  it('lê a lista separada por vírgula', () => {
    expect(parseMixParam('P008,P001')).toEqual(['P008', 'P001'])
  })

  it('tolera espaços, vazios e parâmetro ausente', () => {
    expect(parseMixParam(' P008 , , P001 ')).toEqual(['P008', 'P001'])
    expect(parseMixParam('')).toEqual([])
    expect(parseMixParam(undefined)).toEqual([])
  })

  it('remove código repetido', () => {
    // O motor pode sugerir o mesmo produto como "usual" e como cross-sell
    expect(parseMixParam('P001,P008,P001')).toEqual(['P001', 'P008'])
  })

  it('aceita o parâmetro repetido na navegação (array)', () => {
    expect(parseMixParam(['P001', 'P008'])).toEqual(['P001', 'P008'])
  })
})

describe('cartFromMix', () => {
  it('monta o carrinho na ordem do motor, com quantidade 1', () => {
    const { cart, missing } = cartFromMix(['P008', 'P001'], CATALOG)

    expect(missing).toEqual([])
    expect(cart.map((i) => i.productId)).toEqual(['id-sabao', 'id-arroz'])
    expect(cart.map((i) => i.quantity)).toEqual([1, 1])
    expect(cart[0]).toMatchObject({
      productName: 'Sabão em Pó 1kg',
      productUnit: 'UN',
      unitPrice: 14.5,
      discount: 0,
    })
  })

  it('denuncia o produto sugerido que não está no catálogo', () => {
    // Inativado no Protheus ou ainda não sincronizado: some do carrinho sem
    // avisar, e o vendedor acha que o mix inteiro entrou.
    const { cart, missing } = cartFromMix(['P001', 'P999'], CATALOG)

    expect(cart.map((i) => i.productId)).toEqual(['id-arroz'])
    expect(missing).toEqual(['P999'])
  })

  it('produto sem código Protheus nunca casa', () => {
    expect(cartFromMix([''], CATALOG).cart).toEqual([])
    expect(cartFromMix(['P001'], [CATALOG[2]])).toEqual({ cart: [], missing: ['P001'] })
  })

  it('mix vazio devolve carrinho vazio', () => {
    expect(cartFromMix([], CATALOG)).toEqual({ cart: [], missing: [] })
  })
})
