import { describe, it, expect } from 'vitest'
import { decomposeLosses, type DecompositionSale } from '../decomposition'

// Base: 3 meses (jun–ago), atual: 1 mês (set). scale = 1/3.
const base = { baselineFromYmd: '20260601', baselineToYmd: '20260831' }
const current = { currentFromYmd: '20260901', currentToYmd: '20260930' }
const scale = 1 / 3

const sale = (
  customerKey: string,
  ymd: string,
  amount: number,
  productCode = 'P1',
  productDesc: string | null = 'Produto 1'
): DecompositionSale => ({ customerKey, productCode, productDesc, ymd, amount })

describe('decomposeLosses', () => {
  it('cliente que comprava e parou entra em STOPPED com a perda normalizada', () => {
    const sales = [sale('A|01', '20260610', 300), sale('A|01', '20260710', 300), sale('A|01', '20260810', 300)]
    const r = decomposeLosses({ sales, ...base, ...current, scale })
    expect(r.customers).toHaveLength(1)
    expect(r.customers[0]).toMatchObject({
      customerKey: 'A|01',
      kind: 'STOPPED',
      baselineAmount: 300,
      currentAmount: 0,
      diffAmount: -300,
    })
    expect(r.totals).toMatchObject({ baselineAmount: 300, currentAmount: 0, diffAmount: -300, diffPct: -100 })
    expect(r.components.find((c) => c.kind === 'STOPPED')).toEqual({ kind: 'STOPPED', amount: -300, count: 1 })
  })

  it('queda de mais de 20% vira REDUCED; menos que isso é ruído', () => {
    const sales = [
      sale('B|01', '20260610', 300),
      sale('B|01', '20260710', 300),
      sale('B|01', '20260810', 300),
      sale('B|01', '20260910', 150), // −50%
      sale('C|01', '20260610', 300),
      sale('C|01', '20260710', 300),
      sale('C|01', '20260810', 300),
      sale('C|01', '20260910', 270), // −10%
    ]
    const r = decomposeLosses({ sales, ...base, ...current, scale })
    expect(r.customers.map((c) => c.customerKey)).toEqual(['B|01'])
    expect(r.customers[0].kind).toBe('REDUCED')
    expect(r.customers[0].reason).toContain('50%')
  })

  it('cliente novo entra em GAINED (positivo) e vai por último', () => {
    const sales = [
      sale('A|01', '20260610', 300),
      sale('A|01', '20260710', 300),
      sale('A|01', '20260810', 300),
      sale('N|01', '20260905', 500),
    ]
    const r = decomposeLosses({ sales, ...base, ...current, scale })
    expect(r.customers.map((c) => c.kind)).toEqual(['STOPPED', 'GAINED'])
    expect(r.components.find((c) => c.kind === 'GAINED')).toEqual({ kind: 'GAINED', amount: 500, count: 1 })
  })

  it('produto em queda aparece com o percentual; produto estável não', () => {
    const sales = [
      sale('A|01', '20260610', 300, 'P1'),
      sale('A|01', '20260710', 300, 'P1'),
      sale('A|01', '20260810', 300, 'P1'),
      sale('A|01', '20260910', 60, 'P1'), // −80%
      sale('A|01', '20260610', 90, 'P2', 'Produto 2'),
      sale('A|01', '20260710', 90, 'P2', 'Produto 2'),
      sale('A|01', '20260810', 90, 'P2', 'Produto 2'),
      sale('A|01', '20260910', 90, 'P2', 'Produto 2'), // estável
    ]
    const r = decomposeLosses({ sales, ...base, ...current, scale })
    expect(r.products).toHaveLength(1)
    expect(r.products[0]).toMatchObject({ productCode: 'P1', baselineAmount: 300, currentAmount: 60, diffPct: -80 })
  })

  it('respeita os tetos de clientes e produtos', () => {
    const sales: DecompositionSale[] = []
    for (let i = 0; i < 30; i++) {
      sales.push(sale(`C${i}|01`, '20260610', 300, `P${i}`))
      sales.push(sale(`C${i}|01`, '20260710', 300, `P${i}`))
      sales.push(sale(`C${i}|01`, '20260810', 300, `P${i}`))
    }
    const r = decomposeLosses({ sales, ...base, ...current, scale, maxCustomers: 5, maxProducts: 3 })
    expect(r.customers).toHaveLength(5)
    expect(r.products).toHaveLength(3)
    // o total considera todos, não só o recorte
    expect(r.totals.baselineAmount).toBe(9000)
  })
})
