// KPIs da tela Equipe em campo (E8, W1) — puro, sobre fatos já carregados.
// Nada aqui toca o banco: o service busca, este módulo só conta.

export interface VisitFact {
  vendorCode: string
  ymd: string // dia civil (São Paulo) do check-in
  customerKey: string // `${customerCode}|${loja}`
  planItemId: string | null // null = visita fora do plano (sinal, D3)
  result: string | null // null = visita ainda aberta
}

export interface PlanFact {
  vendorCode: string
  ymd: string
  activeItems: number // itens não removidos
}

export interface SellerFact {
  userId: string
  name: string
  vendorCode: string
  hasManager: boolean
  portfolio: number // clientes ativos na carteira
  positivatedInMonth: number // desses, quantos compraram no mês corrente
}

export type AlertKind = 'NO_PLAN' | 'FEW_VISITS' | 'STALE_DATA'

export interface TeamAlert {
  kind: AlertKind
  message: string
}

export interface SellerCard {
  userId: string
  name: string
  vendorCode: string
  planned: number
  done: number
  outOfPlan: number
  adherencePct: number | null
  visitPositivationPct: number | null
  portfolioPositivationPct: number | null
  alerts: TeamAlert[]
}

export interface TeamTotals {
  sellers: number
  planned: number
  done: number
  adherencePct: number | null
  visitPositivationPct: number | null
  portfolioPositivationPct: number | null
}

export interface TeamInput {
  sellers: SellerFact[]
  plans: PlanFact[]
  visits: VisitFact[]
  fromYmd: string
  toYmd: string
  /** Piso de visitas da janela — visits_per_day × dias úteis (0 desliga o alerta). */
  minVisits: number
  stale: boolean
}

export interface TeamReport {
  range: { fromYmd: string; toYmd: string }
  totals: TeamTotals
  sellers: SellerCard[]
  alerts: TeamAlert[]
  unassignedSellers: number
}

function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null
  return Math.round((part / whole) * 1000) / 10
}

function inWindow(ymd: string, fromYmd: string, toYmd: string): boolean {
  return ymd >= fromYmd && ymd <= toYmd
}

export function buildTeamReport(input: TeamInput): TeamReport {
  const { fromYmd, toYmd } = input

  const plannedBy = new Map<string, number>()
  for (const plan of input.plans) {
    if (!inWindow(plan.ymd, fromYmd, toYmd)) continue
    plannedBy.set(plan.vendorCode, (plannedBy.get(plan.vendorCode) ?? 0) + plan.activeItems)
  }

  const visitsBy = new Map<string, VisitFact[]>()
  for (const visit of input.visits) {
    if (!inWindow(visit.ymd, fromYmd, toYmd)) continue
    const list = visitsBy.get(visit.vendorCode)
    if (list) list.push(visit)
    else visitsBy.set(visit.vendorCode, [visit])
  }

  const sellers = input.sellers.map((seller): SellerCard => {
    const planned = plannedBy.get(seller.vendorCode) ?? 0
    const visits = visitsBy.get(seller.vendorCode) ?? []
    const done = visits.length
    const outOfPlan = visits.filter((v) => v.planItemId === null).length

    // Positivação da visita: só entram as visitas com desfecho registrado —
    // uma visita ainda aberta não é "sem pedido".
    const closed = visits.filter((v) => v.result !== null)
    const withOrder = closed.filter((v) => v.result === 'ORDER').length

    const alerts: TeamAlert[] = []
    if (planned === 0) {
      alerts.push({ kind: 'NO_PLAN', message: 'Sem plano gerado no período' })
    }
    if (input.minVisits > 0 && done < input.minVisits) {
      alerts.push({
        kind: 'FEW_VISITS',
        message: `${done} visita(s) no período — esperado ao menos ${input.minVisits}`,
      })
    }

    return {
      userId: seller.userId,
      name: seller.name,
      vendorCode: seller.vendorCode,
      planned,
      done,
      outOfPlan,
      adherencePct: pct(done, planned),
      visitPositivationPct: pct(withOrder, closed.length),
      portfolioPositivationPct: pct(seller.positivatedInMonth, seller.portfolio),
      alerts,
    }
  })

  const totalPlanned = sellers.reduce((sum, s) => sum + s.planned, 0)
  const totalDone = sellers.reduce((sum, s) => sum + s.done, 0)
  const allVisits = sellers.flatMap((s) => visitsBy.get(s.vendorCode) ?? [])
  const allClosed = allVisits.filter((v) => v.result !== null)
  const totalPortfolio = input.sellers.reduce((sum, s) => sum + s.portfolio, 0)
  const totalPositivated = input.sellers.reduce((sum, s) => sum + s.positivatedInMonth, 0)

  const alerts: TeamAlert[] = []
  if (input.stale) {
    alerts.push({ kind: 'STALE_DATA', message: 'Dados com mais de 24 horas — sync atrasado' })
  }

  return {
    range: { fromYmd, toYmd },
    totals: {
      sellers: sellers.length,
      planned: totalPlanned,
      done: totalDone,
      adherencePct: pct(totalDone, totalPlanned),
      visitPositivationPct: pct(
        allClosed.filter((v) => v.result === 'ORDER').length,
        allClosed.length
      ),
      portfolioPositivationPct: pct(totalPositivated, totalPortfolio),
    },
    sellers,
    alerts,
    unassignedSellers: input.sellers.filter((s) => !s.hasManager).length,
  }
}
