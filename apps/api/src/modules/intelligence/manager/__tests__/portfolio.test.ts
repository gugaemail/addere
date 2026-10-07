// Carteira da equipe por status (E8, fase 2) sobre fixtures — nada aqui toca
// o banco.
import { describe, expect, it } from 'vitest'
import { buildTeamPortfolio, type PortfolioFact } from '../portfolio'

const fact = (over: Partial<PortfolioFact> = {}): PortfolioFact => ({
  customerCode: 'C1',
  loja: '01',
  vendorCode: 'V1',
  sellerName: 'Ana',
  status: 'ON_CYCLE',
  ...over,
})

describe('buildTeamPortfolio', () => {
  it('status sem nenhum cliente aparece com 0 em byStatus', () => {
    const portfolio = buildTeamPortfolio([fact({ status: 'ON_CYCLE' }), fact({ status: 'LATE' })])
    expect(portfolio.byStatus).toEqual({
      NEW: 0,
      ON_CYCLE: 1,
      LATE: 1,
      AT_RISK: 0,
      INACTIVE: 0,
      BLOCKED: 0,
    })
  })

  it('sellersWithAtRisk conta vendedores, não clientes', () => {
    const portfolio = buildTeamPortfolio([
      fact({ customerCode: 'C1', vendorCode: 'V1', sellerName: 'Ana', status: 'AT_RISK' }),
      fact({ customerCode: 'C2', vendorCode: 'V1', sellerName: 'Ana', status: 'AT_RISK' }),
      fact({ customerCode: 'C3', vendorCode: 'V2', sellerName: 'Bia', status: 'AT_RISK' }),
      fact({ customerCode: 'C4', vendorCode: 'V3', sellerName: 'Caio', status: 'ON_CYCLE' }),
    ])
    // 2 clientes em risco com Ana, mas ela conta uma vez só
    expect(portfolio.sellersWithAtRisk).toBe(2)
    expect(portfolio.byStatus.AT_RISK).toBe(3)
  })

  it('carteira vazia devolve total: 0 e todas as chaves zeradas', () => {
    const portfolio = buildTeamPortfolio([])
    expect(portfolio.total).toBe(0)
    expect(portfolio.sellersWithAtRisk).toBe(0)
    expect(portfolio.bySeller).toEqual([])
    expect(Object.values(portfolio.byStatus).every((n) => n === 0)).toBe(true)
    expect(Object.keys(portfolio.byStatus).sort()).toEqual(
      ['AT_RISK', 'BLOCKED', 'INACTIVE', 'LATE', 'NEW', 'ON_CYCLE'].sort()
    )
  })

  it('bySeller sai ordenado por atRisk decrescente', () => {
    const portfolio = buildTeamPortfolio([
      fact({ customerCode: 'C1', vendorCode: 'V1', sellerName: 'Ana', status: 'ON_CYCLE' }),
      fact({ customerCode: 'C2', vendorCode: 'V2', sellerName: 'Bia', status: 'AT_RISK' }),
      fact({ customerCode: 'C3', vendorCode: 'V2', sellerName: 'Bia', status: 'AT_RISK' }),
      fact({ customerCode: 'C4', vendorCode: 'V3', sellerName: 'Caio', status: 'AT_RISK' }),
    ])
    expect(portfolio.bySeller.map((s) => s.vendorCode)).toEqual(['V2', 'V3', 'V1'])
    expect(portfolio.bySeller.map((s) => s.atRisk)).toEqual([2, 1, 0])
    expect(portfolio.total).toBe(4)
  })

  it('desempate de atRisk igual vai por sellerName', () => {
    const portfolio = buildTeamPortfolio([
      fact({ customerCode: 'C1', vendorCode: 'V2', sellerName: 'Bia', status: 'AT_RISK' }),
      fact({ customerCode: 'C2', vendorCode: 'V1', sellerName: 'Ana', status: 'AT_RISK' }),
    ])
    expect(portfolio.bySeller.map((s) => s.sellerName)).toEqual(['Ana', 'Bia'])
  })
})
