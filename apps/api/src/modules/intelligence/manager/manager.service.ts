// Consultas da tela Equipe em campo e das métricas do piloto (E8).
// Toda query filtra por companyId; o recorte por gerente vem de resolveTeamScope.
import { prisma } from '@addere/db'
import { ymdSaoPaulo } from '../engine/business-days'
import { resolveParameters } from '../engine/parameters'
import { getFreshness } from '../app/plan.service'
import {
  buildTeamReport,
  type PlanFact,
  type SellerFact,
  type TeamReport,
  type VisitFact,
} from './team'
import { buildPilotMetrics, type PilotMetrics } from './pilot-metrics'
import { addDays, rangeWindow, ymdToUtcDate, type DateWindow, type TeamRange } from './range'

const CONVERSION_DAYS = 7

export interface TeamScope {
  /** null = sem recorte por gerente (vê a empresa inteira). */
  managerId: string | null
}

/**
 * Visibilidade da equipe (decisão D3b):
 * - intel.admin / SUPERADMIN → todos os vendedores
 * - um único gerente na empresa → todos (os sem `managerId` contam como dele)
 * - dois ou mais gerentes → cada um vê só `managerId = seu id`
 */
export function resolveTeamScope(input: {
  viewerId: string
  isAdmin: boolean
  managerCount: number
}): TeamScope {
  if (input.isAdmin || input.managerCount <= 1) return { managerId: null }
  return { managerId: input.viewerId }
}

export async function countManagers(companyId: string): Promise<number> {
  return prisma.user.count({
    where: {
      companyId,
      active: true,
      permissions: { some: { permission: { key: 'intel.manager' } } },
    },
  })
}

function customerKey(row: { customerCode: string; loja: string }): string {
  return `${row.customerCode}|${row.loja}`
}

async function loadSellers(companyId: string, scope: TeamScope) {
  return prisma.user.findMany({
    where: {
      companyId,
      active: true,
      idVendProt: { not: null },
      ...(scope.managerId ? { managerId: scope.managerId } : {}),
    },
    select: { id: true, name: true, idVendProt: true, managerId: true },
    orderBy: { name: 'asc' },
  })
}

/** Chaves da carteira e do que foi comprado no mês, por vendedor. */
async function loadPortfolio(companyId: string, vendorCodes: string[], monthPrefix: string) {
  const customers = await prisma.customer.findMany({
    where: {
      companyId,
      active: true,
      vendorCode: { in: vendorCodes },
      protheusCode: { not: null },
    },
    select: { protheusCode: true, loja: true, vendorCode: true },
  })

  const monthStart = ymdToUtcDate(`${monthPrefix}01`)
  const monthEnd = ymdToUtcDate(`${monthPrefix}31`)
  const sales = await prisma.salesItem.findMany({
    where: { companyId, date: { gte: monthStart, lte: monthEnd } },
    select: { customerCode: true, loja: true },
    distinct: ['customerCode', 'loja'],
  })
  const bought = new Set(sales.map(customerKey))

  const byVendor = new Map<string, { total: number; positivated: number }>()
  for (const customer of customers) {
    const code = customer.vendorCode
    if (!code) continue
    const entry = byVendor.get(code) ?? { total: 0, positivated: 0 }
    entry.total++
    if (bought.has(`${customer.protheusCode}|${customer.loja ?? '01'}`)) entry.positivated++
    byVendor.set(code, entry)
  }
  return byVendor
}

async function loadPlans(
  companyId: string,
  vendorCodes: string[],
  window: DateWindow
): Promise<PlanFact[]> {
  const plans = await prisma.visitPlan.findMany({
    where: {
      companyId,
      vendorCode: { in: vendorCodes },
      kind: 'DAY',
      date: { gte: ymdToUtcDate(window.fromYmd), lte: ymdToUtcDate(window.toYmd) },
    },
    select: {
      vendorCode: true,
      date: true,
      items: { where: { removedAt: null }, select: { id: true } },
    },
  })
  return plans.map((plan) => ({
    vendorCode: plan.vendorCode,
    // VisitPlan.date é @db.Date em meia-noite UTC — o dia civil é o próprio.
    ymd: plan.date.toISOString().slice(0, 10).replace(/-/g, ''),
    activeItems: plan.items.length,
  }))
}

async function loadVisits(
  companyId: string,
  vendorCodes: string[],
  window: DateWindow
): Promise<VisitFact[]> {
  // Rede larga em UTC (±1 dia) e recorte fino pelo dia civil de São Paulo —
  // assim o offset do fuso fica só com o Intl.
  const visits = await prisma.visit.findMany({
    where: {
      companyId,
      vendorCode: { in: vendorCodes },
      arrivedAt: {
        gte: ymdToUtcDate(addDays(window.fromYmd, -1)),
        lte: ymdToUtcDate(addDays(window.toYmd, 2)),
      },
    },
    select: {
      vendorCode: true,
      arrivedAt: true,
      customerCode: true,
      loja: true,
      planItemId: true,
      result: true,
    },
  })
  return visits.map((visit) => ({
    vendorCode: visit.vendorCode,
    ymd: ymdSaoPaulo(visit.arrivedAt),
    customerKey: customerKey(visit),
    planItemId: visit.planItemId,
    result: visit.result,
  }))
}

/**
 * Capacidade esperada de visitas — só no recorte de um dia. Multiplicar pela
 * quantidade de dias úteis parecia generalizar bem, mas com dados reais o mês
 * pedia 168 visitas e acusava todo mundo: o alerta perdia o sentido. Na semana
 * e no mês quem responde por volume é a aderência, não um alerta.
 */
async function resolveMinVisits(companyId: string, range: TeamRange): Promise<number> {
  if (range !== 'day') return 0
  const overrides = await prisma.intelParameter.findMany({
    where: { companyId },
    select: { key: true, value: true, segment: true },
  })
  const params = resolveParameters(
    overrides.map((o) => ({ key: o.key, value: o.value, segment: o.segment ?? '' }))
  )
  return params.visits_per_day
}

export async function buildTeam(
  companyId: string,
  scope: TeamScope,
  anchorYmd: string,
  range: TeamRange
): Promise<TeamReport> {
  const window = rangeWindow(anchorYmd, range)
  const sellers = await loadSellers(companyId, scope)
  const vendorCodes = sellers.map((s) => s.idVendProt as string)

  if (vendorCodes.length === 0) {
    const freshness = await getFreshness(companyId)
    return buildTeamReport({
      sellers: [],
      plans: [],
      visits: [],
      fromYmd: window.fromYmd,
      toYmd: window.toYmd,
      minVisits: 0,
      stale: freshness.stale,
      lastSyncAt: freshness.lastSyncAt,
    })
  }

  const [portfolio, plans, visits, minVisits, freshness] = await Promise.all([
    loadPortfolio(companyId, vendorCodes, anchorYmd.slice(0, 6)),
    loadPlans(companyId, vendorCodes, window),
    loadVisits(companyId, vendorCodes, window),
    resolveMinVisits(companyId, range),
    getFreshness(companyId),
  ])

  const sellerFacts: SellerFact[] = sellers.map((seller) => {
    const code = seller.idVendProt as string
    const entry = portfolio.get(code) ?? { total: 0, positivated: 0 }
    return {
      userId: seller.id,
      name: seller.name,
      vendorCode: code,
      hasManager: seller.managerId !== null,
      portfolio: entry.total,
      positivatedInMonth: entry.positivated,
    }
  })

  return buildTeamReport({
    sellers: sellerFacts,
    plans,
    visits,
    fromYmd: window.fromYmd,
    toYmd: window.toYmd,
    minVisits,
    stale: freshness.stale,
    lastSyncAt: freshness.lastSyncAt,
  })
}

export async function buildPilotReport(
  companyId: string,
  scope: TeamScope,
  fromYmd: string,
  toYmd: string
): Promise<PilotMetrics> {
  const sellers = await loadSellers(companyId, scope)
  const vendorCodes = sellers.map((s) => s.idVendProt as string)
  const window: DateWindow = { fromYmd, toYmd }

  if (vendorCodes.length === 0) {
    return buildPilotMetrics({
      fromYmd,
      toYmd,
      portfolioKeys: [],
      suggestions: [],
      outOfPlanVisits: [],
      purchases: [],
      conversionDays: CONVERSION_DAYS,
    })
  }

  // A conversão olha até N dias depois da sugestão, então as compras vão além do fim.
  const purchaseEnd = addDays(toYmd, CONVERSION_DAYS)

  const [customers, planItems, visits, purchases] = await Promise.all([
    prisma.customer.findMany({
      where: {
        companyId,
        active: true,
        vendorCode: { in: vendorCodes },
        protheusCode: { not: null },
      },
      select: { protheusCode: true, loja: true },
    }),
    prisma.visitPlanItem.findMany({
      where: {
        origin: 'ENGINE',
        removedAt: null,
        plan: {
          companyId,
          vendorCode: { in: vendorCodes },
          date: { gte: ymdToUtcDate(fromYmd), lte: ymdToUtcDate(toYmd) },
        },
      },
      select: {
        customerCode: true,
        loja: true,
        statusAtTime: true,
        plan: { select: { date: true } },
      },
    }),
    prisma.visit.findMany({
      where: {
        companyId,
        vendorCode: { in: vendorCodes },
        planItemId: null,
        arrivedAt: {
          gte: ymdToUtcDate(addDays(fromYmd, -1)),
          lte: ymdToUtcDate(addDays(toYmd, 2)),
        },
      },
      select: { arrivedAt: true, customerCode: true, loja: true },
    }),
    prisma.salesItem.findMany({
      where: {
        companyId,
        date: { gte: ymdToUtcDate(fromYmd), lte: ymdToUtcDate(purchaseEnd) },
      },
      select: { customerCode: true, loja: true, date: true },
      distinct: ['customerCode', 'loja', 'date'],
    }),
  ])

  return buildPilotMetrics({
    fromYmd,
    toYmd,
    portfolioKeys: customers.map((c) => `${c.protheusCode}|${c.loja ?? '01'}`),
    suggestions: planItems.map((item) => ({
      ymd: item.plan.date.toISOString().slice(0, 10).replace(/-/g, ''),
      customerKey: customerKey(item),
      statusAtTime: item.statusAtTime,
    })),
    outOfPlanVisits: visits
      .map((visit) => ({ ymd: ymdSaoPaulo(visit.arrivedAt), customerKey: customerKey(visit) }))
      .filter((visit) => visit.ymd >= window.fromYmd && visit.ymd <= window.toYmd),
    purchases: purchases.map((sale) => ({
      ymd: sale.date.toISOString().slice(0, 10).replace(/-/g, ''),
      customerKey: customerKey(sale),
    })),
    conversionDays: CONVERSION_DAYS,
  })
}
