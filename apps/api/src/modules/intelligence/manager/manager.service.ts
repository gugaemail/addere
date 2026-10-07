// Consultas da tela Equipe em campo e das métricas do piloto (E8).
// Toda query filtra por companyId; o recorte por gerente vem de
// resolveViewerScope (users/data-scope.ts — resolvedor único desde o plano
// 007, que uniu este módulo com o mecanismo do app). Visibilidade (decisão
// D3b, revista no teste geral de 26/08/2026): intel.admin/SUPERADMIN veem
// todos os vendedores da empresa; gerente, só os associados a ele
// (managerId = seu id) e ele mesmo, no painel e no app — um vendedor sem
// gerente aparece só para o administrador (e no aviso `unassignedSellers`).
import { prisma } from '@addere/db'
import { ymdSaoPaulo } from '../engine/business-days'
import { resolveParameters } from '../engine/parameters'
import { getFreshness } from '../app/plan.service'
import { sellerWhere, type ViewerScope } from '../../users/data-scope'
import {
  buildTeamReport,
  type PlanFact,
  type SellerFact,
  type TeamReport,
  type VisitFact,
} from './team'
import { buildPilotMetrics, type PilotMetrics } from './pilot-metrics'
import { buildTeamGoal, type TeamGoal } from './team-goal'
import { loadTeamPortfolio } from './portfolio.service'
import type { TeamPortfolio } from './portfolio'
import { addDays, rangeWindow, ymdToUtcDate, type DateWindow, type TeamRange } from './range'

const CONVERSION_DAYS = 7

/** Ids, entre os informados, de quem tem intel.manager. */
export async function managerIdsAmong(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set()
  const rows = await prisma.userPermission.findMany({
    where: { userId: { in: userIds }, permission: { key: 'intel.manager' } },
    select: { userId: true },
  })
  return new Set((rows ?? []).map((r) => r.userId))
}

function customerKey(row: { customerCode: string; loja: string }): string {
  return `${row.customerCode}|${row.loja}`
}

export async function loadSellers(companyId: string, scope: ViewerScope) {
  return prisma.user.findMany({
    where: {
      companyId,
      active: true,
      idVendProt: { not: null },
      ...sellerWhere(scope),
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
  scope: ViewerScope,
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

  const [portfolio, plans, visits, minVisits, freshness, managers] = await Promise.all([
    loadPortfolio(companyId, vendorCodes, anchorYmd.slice(0, 6)),
    loadPlans(companyId, vendorCodes, window),
    loadVisits(companyId, vendorCodes, window),
    resolveMinVisits(companyId, range),
    getFreshness(companyId),
    managerIdsAmong(sellers.map((s) => s.id)),
  ])

  const sellerFacts: SellerFact[] = sellers.map((seller) => {
    const code = seller.idVendProt as string
    const entry = portfolio.get(code) ?? { total: 0, positivated: 0 }
    return {
      userId: seller.id,
      name: seller.name,
      vendorCode: code,
      hasManager: seller.managerId !== null,
      isManager: managers.has(seller.id),
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
  scope: ViewerScope,
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

export interface ManagerHome {
  /** YYYYMM da meta. */
  period: string
  goal: TeamGoal
  today: { ymd: string; planned: number; done: number }
  sellers: Array<
    TeamGoal['sellers'][number] & { planned: number; done: number; adherencePct: number | null }
  >
  portfolio: TeamPortfolio
  lastSyncAt: string | null
}

/**
 * Home do gerente no app (decisão 1 do teste geral): meta do mês somada e as
 * visitas de hoje, só dos vendedores associados a ele (managerId) — o mesmo
 * recorte da tela Equipe em campo do painel.
 *
 * Recebe o ViewerScope já resolvido (plano 007) em vez de montar `{ managerId }`
 * na mão. O chamador (manager.routes.ts) sempre passa um scope 'team' com
 * managerId = quem chamou — a home do gerente é sempre a equipe de quem
 * chamou, mesmo que ele também tenha intel.admin/SUPERADMIN; isso já era
 * assim antes (nunca passava por scopeFor/resolveTeamScope), só que implícito.
 */
export async function buildManagerHome(companyId: string, scope: ViewerScope): Promise<ManagerHome> {
  const todayYmd = ymdSaoPaulo(new Date())
  const period = todayYmd.slice(0, 6)
  const sellers = await loadSellers(companyId, scope)
  const vendorCodes = sellers.map((s) => s.idVendProt as string)

  const [snapshots, team, portfolio] = await Promise.all([
    vendorCodes.length === 0
      ? Promise.resolve([])
      : prisma.goalSnapshot.findMany({
          where: { companyId, period, vendorCode: { in: vendorCodes } },
          select: { vendorCode: true, goalAmount: true, soldAmount: true, capturedAt: true },
        }),
    buildTeam(companyId, scope, todayYmd, 'day'),
    loadTeamPortfolio(companyId, sellers),
  ])

  const goal = buildTeamGoal(
    sellers.map((s) => ({ userId: s.id, name: s.name, vendorCode: s.idVendProt as string })),
    snapshots.map((snap) => ({
      vendorCode: snap.vendorCode,
      goalAmount: snap.goalAmount === null ? null : Number(snap.goalAmount),
      soldAmount: snap.soldAmount === null ? null : Number(snap.soldAmount),
      capturedAt: snap.capturedAt,
    }))
  )
  const visitsBy = new Map(team.sellers.map((card) => [card.vendorCode, card]))

  return {
    period,
    goal,
    today: { ymd: todayYmd, planned: team.totals.planned, done: team.totals.done },
    sellers: goal.sellers.map((seller) => {
      const card = visitsBy.get(seller.vendorCode)
      return {
        ...seller,
        planned: card?.planned ?? 0,
        done: card?.done ?? 0,
        adherencePct: card?.adherencePct ?? null,
      }
    }),
    portfolio,
    lastSyncAt: team.lastSyncAt,
  }
}
