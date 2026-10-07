// Carteira da equipe por status (E8, fase 2) — puro, sobre fatos já carregados.
// Quem busca os fatos é portfolio.service.ts; aqui só se conta, no estilo de
// team.ts e pilot-metrics.ts.
import type { CustomerStatus } from '@addere/types'

export interface PortfolioFact {
  customerCode: string
  loja: string
  vendorCode: string
  sellerName: string
  status: CustomerStatus
}

export interface TeamPortfolio {
  total: number
  byStatus: Record<CustomerStatus, number>
  /** Quantos vendedores distintos têm pelo menos um cliente em risco. */
  sellersWithAtRisk: number
  bySeller: Array<{ vendorCode: string; sellerName: string; total: number; atRisk: number }>
}

// Todas as chaves de CustomerStatus, sempre — um status sem cliente nenhum
// não pode desaparecer do objeto, senão a tela some com a linha e o gerente
// acha que não existe cliente naquele estado.
const ALL_STATUSES: CustomerStatus[] = ['NEW', 'ON_CYCLE', 'LATE', 'AT_RISK', 'INACTIVE', 'BLOCKED']

export function buildTeamPortfolio(facts: PortfolioFact[]): TeamPortfolio {
  const byStatus = Object.fromEntries(ALL_STATUSES.map((status) => [status, 0])) as Record<
    CustomerStatus,
    number
  >

  const bySellerMap = new Map<string, { sellerName: string; total: number; atRisk: number }>()
  for (const fact of facts) {
    byStatus[fact.status]++
    const entry = bySellerMap.get(fact.vendorCode) ?? {
      sellerName: fact.sellerName,
      total: 0,
      atRisk: 0,
    }
    entry.total++
    if (fact.status === 'AT_RISK') entry.atRisk++
    bySellerMap.set(fact.vendorCode, entry)
  }

  // atRisk decrescente, desempatando por nome — o gerente lê de cima para
  // baixo quem precisa de atenção primeiro.
  const bySeller = [...bySellerMap.entries()]
    .map(([vendorCode, v]) => ({ vendorCode, ...v }))
    .sort((a, b) => b.atRisk - a.atRisk || a.sellerName.localeCompare(b.sellerName))

  return {
    total: facts.length,
    byStatus,
    sellersWithAtRisk: bySeller.filter((s) => s.atRisk > 0).length,
    bySeller,
  }
}
