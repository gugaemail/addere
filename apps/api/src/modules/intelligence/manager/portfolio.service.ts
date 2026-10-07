// Consultas da carteira da equipe (E8, fase 2) — quem agrega é portfolio.ts.
// Recebe os vendedores já resolvidos (loadSellers, em manager.service.ts) em
// vez de receber o ViewerScope e resolver de novo: evita ciclo de import com
// manager.service.ts e, na home do gerente, reaproveita a consulta que
// buildManagerHome já faz para a meta.
import { prisma } from '@addere/db'
import type { CustomerStatus } from '@addere/types'
import { buildTeamPortfolio, type PortfolioFact, type TeamPortfolio } from './portfolio'

type SellerRow = { name: string; idVendProt: string | null }

function sellerNameMap(sellers: SellerRow[]): Map<string, string> {
  return new Map(sellers.map((s) => [s.idVendProt as string, s.name]))
}

/**
 * `${protheusCode}|${loja ?? '01'}` → cadastro, só dos vendedores pedidos —
 * a mesma técnica de casamento de chave de plan.routes.ts:52-64 (home do
 * vendedor).
 */
async function loadCustomersByKey(companyId: string, vendorCodes: string[]) {
  const customers = await prisma.customer.findMany({
    where: { companyId, active: true, vendorCode: { in: vendorCodes }, protheusCode: { not: null } },
    select: { protheusCode: true, loja: true, name: true, vendorCode: true },
  })
  return new Map(customers.map((c) => [`${c.protheusCode}|${c.loja ?? '01'}`, c]))
}

/**
 * Carteira da equipe por status (E8 fase 2): soma dos clientes de todos os
 * vendedores do escopo, quebrada por CustomerStatus — alimenta o bloco
 * "Carteira da equipe" da home do gerente (app) e o card equivalente no
 * painel.
 */
export async function loadTeamPortfolio(companyId: string, sellers: SellerRow[]): Promise<TeamPortfolio> {
  const vendorCodes = sellers.map((s) => s.idVendProt as string)
  if (vendorCodes.length === 0) return buildTeamPortfolio([])

  const sellerNames = sellerNameMap(sellers)
  const byKey = await loadCustomersByKey(companyId, vendorCodes)

  const signals = await prisma.customerSignal.findMany({
    where: {
      companyId,
      customerCode: { in: [...byKey.values()].map((c) => c.protheusCode as string) },
    },
    select: { customerCode: true, loja: true, status: true },
  })

  const facts: PortfolioFact[] = []
  for (const signal of signals) {
    const customer = byKey.get(`${signal.customerCode}|${signal.loja}`)
    if (!customer?.vendorCode) continue
    facts.push({
      customerCode: signal.customerCode,
      loja: signal.loja,
      vendorCode: customer.vendorCode,
      sellerName: sellerNames.get(customer.vendorCode) ?? customer.vendorCode,
      status: signal.status,
    })
  }
  return buildTeamPortfolio(facts)
}

export interface TeamSignalListItem {
  customerCode: string
  loja: string
  customerName: string
  vendorCode: string
  sellerName: string
  status: CustomerStatus
  daysSinceLastPurchase: number | null
  avgTicket: string | null
}

/**
 * Carteira da equipe, lista (E8 fase 2 — GET /customers/signals): cada linha
 * leva de qual vendedor é o cliente — sem isso o gerente não sabe com quem
 * falar. `vendorCodes` já vem filtrado pelo chamador (dentro do escopo,
 * nunca ampliando-o); `sellers` serve só para resolver o nome de cada um.
 */
export async function loadTeamSignalsList(
  companyId: string,
  sellers: SellerRow[],
  vendorCodes: string[],
  status?: CustomerStatus
): Promise<TeamSignalListItem[]> {
  if (vendorCodes.length === 0) return []

  const sellerNames = sellerNameMap(sellers)
  const byKey = await loadCustomersByKey(companyId, vendorCodes)

  const signals = await prisma.customerSignal.findMany({
    where: {
      companyId,
      customerCode: { in: [...byKey.values()].map((c) => c.protheusCode as string) },
      ...(status ? { status } : {}),
    },
    orderBy: { daysSinceLastPurchase: 'desc' },
    take: 300,
  })

  const items: TeamSignalListItem[] = []
  for (const signal of signals) {
    const customer = byKey.get(`${signal.customerCode}|${signal.loja}`)
    if (!customer?.vendorCode) continue
    items.push({
      customerCode: signal.customerCode,
      loja: signal.loja,
      customerName: customer.name,
      vendorCode: customer.vendorCode,
      sellerName: sellerNames.get(customer.vendorCode) ?? customer.vendorCode,
      status: signal.status,
      daysSinceLastPurchase: signal.daysSinceLastPurchase,
      avgTicket: signal.avgTicket?.toString() ?? null,
    })
  }
  return items
}
