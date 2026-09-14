import { describe, it, expect } from 'vitest'
import {
  computeCrossSell,
  computeRfm,
  quintile,
  segmentFor,
  RFM_MIN_CUSTOMERS,
  type RfmInput,
} from '../rfm'

function portfolio(n: number): RfmInput[] {
  // i=0 é o pior (mais dias, menos pedidos, menos valor); i=n-1 o melhor
  return Array.from({ length: n }, (_, i) => ({
    key: `C${i}|01`,
    daysSinceLastPurchase: 200 - i * 5,
    orders12m: 1 + i,
    amount12m: 500 * (i + 1),
  }))
}

describe('quintile', () => {
  it('distribui 1..5 pela posição na lista ordenada', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(quintile(1, sorted)).toBe(1)
    expect(quintile(3, sorted)).toBe(2)
    expect(quintile(5, sorted)).toBe(3)
    expect(quintile(10, sorted)).toBe(5)
  })
  it('empates recebem o mesmo quintil', () => {
    const sorted = [1, 1, 1, 1, 10, 10, 10, 10, 10, 10]
    expect(quintile(1, sorted)).toBe(1)
    expect(quintile(10, sorted)).toBe(3)
  })
})

describe('segmentFor', () => {
  it('mapeia os cantos da matriz', () => {
    expect(segmentFor(5, 5, 5)).toBe('CHAMPION')
    expect(segmentFor(3, 5, 4)).toBe('LOYAL')
    expect(segmentFor(5, 1, 2)).toBe('PROMISING')
    expect(segmentFor(1, 5, 5)).toBe('AT_RISK')
    expect(segmentFor(2, 2, 3)).toBe('HIBERNATING')
    expect(segmentFor(1, 1, 1)).toBe('LOST')
    expect(segmentFor(3, 3, 3)).toBe('NEED_ATTENTION')
  })
})

describe('computeRfm', () => {
  it('carteira pequena não recebe RFM', () => {
    expect(computeRfm(portfolio(RFM_MIN_CUSTOMERS - 1)).size).toBe(0)
  })

  it('o melhor cliente é campeão e o pior é perdido', () => {
    const scores = computeRfm(portfolio(40))
    expect(scores.size).toBe(40)
    expect(scores.get('C39|01')?.segment).toBe('CHAMPION')
    expect(scores.get('C0|01')?.segment).toBe('LOST')
    expect(scores.get('C39|01')).toMatchObject({ r: 5, f: 5, m: 5 })
  })

  it('quem nunca comprou fica de fora (sem quintil)', () => {
    const input = [...portfolio(35), { key: 'Z|01', daysSinceLastPurchase: null, orders12m: 0, amount12m: 0 }]
    const scores = computeRfm(input)
    expect(scores.has('Z|01')).toBe(false)
  })
})

describe('computeCrossSell', () => {
  const desc = new Map([
    ['P1', 'Produto 1'],
    ['P2', 'Produto 2'],
    ['P3', null],
  ])
  const member = (key: string, products: string[], peerGroup = 'VAREJO') => ({
    key,
    peerGroup,
    products: new Set(products),
  })

  it('sugere o produto popular no grupo que o cliente nunca comprou', () => {
    const customers = [
      member('A', ['P1', 'P2']),
      member('B', ['P1', 'P2']),
      member('C', ['P1', 'P2']),
      member('D', ['P1']),
      member('E', ['P1', 'P3']),
    ]
    const result = computeCrossSell(customers, desc, 40)
    // P2 é comprado por 3 de 5 (60%) — D e E não compram
    expect(result.get('D')).toEqual([{ productCode: 'P2', productDesc: 'Produto 2', peersPct: 60 }])
    expect(result.get('E')).toEqual([{ productCode: 'P2', productDesc: 'Produto 2', peersPct: 60 }])
    // A já compra tudo que é popular — sem sugestão
    expect(result.has('A')).toBe(false)
  })

  it('grupo pequeno (< 5) não gera sugestão; sem grupo, idem', () => {
    const small = [member('A', ['P1']), member('B', ['P1']), member('C', [])]
    expect(computeCrossSell(small, desc, 40).size).toBe(0)
    const noGroup = Array.from({ length: 6 }, (_, i) => member(`N${i}`, ['P1'], null as unknown as string))
    expect(computeCrossSell(noGroup, desc, 40).size).toBe(0)
  })

  it('respeita o corte de penetração', () => {
    const customers = Array.from({ length: 10 }, (_, i) => member(`M${i}`, i < 3 ? ['P1', 'P2'] : ['P1']))
    // P2: 30% → abaixo de 40 não sugere; com 25 sugere
    expect(computeCrossSell(customers, desc, 40).size).toBe(0)
    expect(computeCrossSell(customers, desc, 25).get('M9')?.[0].productCode).toBe('P2')
  })
})
