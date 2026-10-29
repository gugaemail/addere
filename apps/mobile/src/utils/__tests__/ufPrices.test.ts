import { ufPricesLine } from '../ufPrices'

describe('ufPricesLine', () => {
  it('lista os preços por UF em ordem alfabética', () => {
    expect(ufPricesLine({ SP: 11.2, MG: 9.9 })).toBe('Por UF: MG R$ 9,90 · SP R$ 11,20')
  })

  it('sem preço por UF não mostra linha', () => {
    expect(ufPricesLine(null)).toBeNull()
    expect(ufPricesLine(undefined)).toBeNull()
    expect(ufPricesLine({})).toBeNull()
  })
})
