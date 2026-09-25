import {
  crossSellLine,
  customerMetaLine,
  filterPortfolio,
  fmtBRLCompact,
  LATE_FILTER,
  lateRecoveryLine,
  trendModel,
} from '../portfolio'
import type { CustomerSignalListItem } from '@addere/types'

const item = (over: Partial<CustomerSignalListItem>): CustomerSignalListItem => ({
  customerCode: 'C1',
  loja: '01',
  customerName: 'Cliente',
  status: 'ON_CYCLE',
  daysSinceLastPurchase: 10,
  avgTicket: '1000.00',
  reason: null,
  cycleDays: 20,
  orders12m: 5,
  trendPct: 0,
  rfmSegment: null,
  city: null,
  crossSellCount: 0,
  ...over,
})

describe('filterPortfolio', () => {
  const items = [
    item({ customerCode: 'a', status: 'LATE', rfmSegment: 'CHAMPION' }),
    item({ customerCode: 'b', status: 'AT_RISK', rfmSegment: 'AT_RISK' }),
    item({ customerCode: 'c', status: 'ON_CYCLE', rfmSegment: null }),
    item({ customerCode: 'd', status: 'ON_CYCLE', rfmSegment: 'LOYAL' }),
  ]
  const ids = (list: CustomerSignalListItem[]) => list.map((i) => i.customerCode)

  it('sem filtro devolve tudo', () => {
    expect(ids(filterPortfolio(items, { statuses: [], rfm: [] }))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('"Só atrasados" = LATE + AT_RISK', () => {
    expect(ids(filterPortfolio(items, { statuses: LATE_FILTER, rfm: [] }))).toEqual(['a', 'b'])
  })

  it('filtro RFM ignora quem não tem segmento e cruza com o status', () => {
    expect(ids(filterPortfolio(items, { statuses: [], rfm: ['LOYAL', 'CHAMPION'] }))).toEqual([
      'a',
      'd',
    ])
    expect(ids(filterPortfolio(items, { statuses: ['ON_CYCLE'], rfm: ['LOYAL'] }))).toEqual(['d'])
    expect(ids(filterPortfolio(items, { statuses: ['LATE'], rfm: ['LOYAL'] }))).toEqual([])
  })
})

describe('fmtBRLCompact / lateRecoveryLine', () => {
  it('compacta em mil e mi', () => {
    expect(fmtBRLCompact('850.00')).toBe('R$ 850')
    expect(fmtBRLCompact('12400.00')).toBe('R$ 12 mil')
    expect(fmtBRLCompact('1250000')).toBe('R$ 1,3 mi')
    expect(fmtBRLCompact('abc')).toBe('R$ —')
  })

  it('linha do CTA só com valor positivo', () => {
    expect(lateRecoveryLine('12400.00')).toBe('R$ 12 mil dá para recuperar')
    expect(lateRecoveryLine('0.00')).toBeNull()
    expect(lateRecoveryLine(null)).toBeNull()
  })
})

describe('customerMetaLine / trendModel / crossSellLine', () => {
  it('monta a linha com os pedaços disponíveis', () => {
    expect(customerMetaLine({ daysSinceLastPurchase: 32, cycleDays: 20, orders12m: 14 })).toBe(
      'última compra há 32 dias · ciclo ~20 dias · 14 pedidos/12m'
    )
    expect(customerMetaLine({ daysSinceLastPurchase: null, cycleDays: null, orders12m: 1 })).toBe(
      '1 pedido/12m'
    )
    expect(customerMetaLine({ daysSinceLastPurchase: null, cycleDays: null, orders12m: 0 })).toBeNull()
  })

  it('tendência com sinal e direção', () => {
    expect(trendModel(12.4)).toEqual({ direction: 'up', text: '+12%' })
    expect(trendModel(-8)).toEqual({ direction: 'down', text: '-8%' })
    expect(trendModel(0.2)).toEqual({ direction: 'flat', text: 'estável' })
    expect(trendModel(null)).toBeNull()
  })

  it('cross-sell no singular e plural', () => {
    expect(crossSellLine(1)).toBe('1 sugestão de cross-sell')
    expect(crossSellLine(3)).toBe('3 sugestões de cross-sell')
    expect(crossSellLine(0)).toBeNull()
  })
})
