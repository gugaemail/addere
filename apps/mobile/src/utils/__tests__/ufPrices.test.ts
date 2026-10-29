// Aba Produtos: preço pela UF dos clientes do vendedor — só o da UF com mais
// clientes, nunca o das outras UFs. Sem preço para a UF, o geral; sem nenhum, 0.
import { catalogPrice, portfolioUfs } from '../ufPrices'

const product = (price: number, ufPrices?: Record<string, number>) => ({
  price: String(price),
  ufPrices: ufPrices ?? null,
})

// Retorno real (AAA145): sem preço geral, um preço por UF
const AAA145 = product(0, { AC: 500.55, MG: 463.24, RJ: 470.95, SP: 472.21 })

describe('portfolioUfs', () => {
  it('UFs da carteira, da com mais clientes para a com menos', () => {
    const customers = [{ uf: 'MG' }, { uf: 'SP' }, { uf: 'sp ' }, { uf: null }, { uf: '' }]
    expect(portfolioUfs(customers)).toEqual(['SP', 'MG'])
  })

  it('sem clientes: nenhuma UF', () => {
    expect(portfolioUfs(undefined)).toEqual([])
  })
})

describe('catalogPrice', () => {
  it('carteira só em SP: preço de SP', () => {
    expect(catalogPrice(AAA145, ['SP'])).toEqual({ price: 472.21, uf: 'SP' })
  })

  it('UF da carteira fora da tabela: preço geral; sem geral, 0', () => {
    expect(catalogPrice(product(10, { SP: 12 }), ['BA']).price).toBe(10)
    expect(catalogPrice(AAA145, ['BA']).price).toBe(0)
  })

  it('carteira sem UF: preço geral, sem UF', () => {
    expect(catalogPrice(product(10, { SP: 12 }), [])).toEqual({ price: 10, uf: null })
  })

  it('carteira em mais de uma UF: só o preço da UF com mais clientes', () => {
    expect(catalogPrice(AAA145, ['SP', 'MG'])).toEqual({ price: 472.21, uf: 'SP' })
  })
})
