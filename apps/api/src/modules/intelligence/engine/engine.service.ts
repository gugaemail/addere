// Orquestração do motor (E5): carrega dados do tenant, calcula sinais por
// cliente (premissas por segmento), grava CustomerSignal e gera o plano do
// dia por vendedor — sem sobrescrever plano EDITED (doc §4.3, SideEffect).
import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'
import type { SignalsSnapshot } from '@addere/types'
import { unprocessable } from '../../../lib/errors'
import { resolveParameters, type ParameterOverride } from './parameters'
import { businessDaysRemaining, ymdSaoPaulo } from './business-days'
import {
  computeCustomerSignal,
  type CustomerInput,
  type CustomerSignalResult,
  type SaleRecord,
  type TitleInput,
} from './signals'
import { computeVendorGoal } from './goal'
import { rankCustomers, type RankableCustomer, type RankedItem } from './ranking'

export const ENGINE_VERSION = 'engine-v1'
const TWELVE_MONTHS_DAYS = 365

export interface EngineRunSummary {
  customers: number
  signals: number
  sellers: number
  plansCreated: number
  plansSkipped: number // planos EDITED/IN_PROGRESS preservados
}

interface CustomerContext {
  input: CustomerInput
  vendorCode: string | null
  name: string
  signal: CustomerSignalResult
  titles: TitleInput[]
}

const key = (code: string, loja: string) => `${code}|${loja}`
const dec = (value: Prisma.Decimal | null) => (value === null ? null : Number(value))

function dateToYmd(date: Date | null): string | null {
  if (!date) return null
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
}

function buildSnapshot(ctx: CustomerContext): SignalsSnapshot {
  const signal = ctx.signal
  return {
    status: signal.status,
    confidence: signal.confidence,
    cycleDays: signal.cycleDays,
    daysSinceLastPurchase: signal.daysSinceLastPurchase,
    orders12m: signal.orders12m,
    avgTicket: signal.avgTicket === null ? null : signal.avgTicket.toFixed(2),
    trendPct: signal.trendPct,
    usualMix: signal.usualMix,
    cutMix: signal.cutMix,
    openTitles: {
      count: ctx.titles.length,
      totalBalance: ctx.titles.reduce((sum, t) => sum + t.balance, 0).toFixed(2),
      maxDaysOverdue: ctx.titles.reduce<number | null>(
        (max, t) => (t.daysOverdue === null ? max : Math.max(max ?? 0, t.daysOverdue)),
        null
      ),
    },
    reasons: signal.reasons,
  }
}

function buildSuggestedOffer(signal: CustomerSignalResult) {
  const offer = [
    ...signal.usualMix.map((p) => ({ ...p, source: 'usual' as const })),
    ...signal.cutMix.map((p) => ({ ...p, source: 'ask_about_cut' as const })),
  ]
  return offer.length > 0 ? offer : null
}

export async function runEngine(companyId: string, _runId: string): Promise<EngineRunSummary> {
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) throw unprocessable('Empresa não encontrada')
  if (!company.intelligenceEnabled) throw unprocessable('Camada de Inteligência desligada')

  const now = new Date()
  const today = ymdSaoPaulo(now)
  const currentPeriod = today.slice(0, 6)

  // ─── Carga dos dados do tenant ───
  const overridesRows = await prisma.intelParameter.findMany({ where: { companyId } })
  const overrides: ParameterOverride[] = overridesRows.map((row) => ({
    key: row.key,
    value: row.value,
    segment: row.segment,
  }))
  const globalParams = resolveParameters(overrides)

  const twelveMonthsAgo = new Date(now.getTime() - TWELVE_MONTHS_DAYS * 86_400_000)
  const cooldownStart = new Date(now.getTime() - globalParams.visited_cooldown_days * 86_400_000)

  const [customers, sales, titles, recentVisits, sellers] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId, active: true, protheusCode: { not: null } },
      select: {
        protheusCode: true,
        loja: true,
        name: true,
        vendorCode: true,
        msblql: true,
        ultcom: true,
        creditLimit: true,
        segment: true,
        municipio: true,
        bairro: true,
      },
    }),
    prisma.salesItem.findMany({
      where: { companyId, date: { gte: twelveMonthsAgo } },
      select: {
        orderRef: true,
        date: true,
        productCode: true,
        productDesc: true,
        amount: true,
        customerCode: true,
        loja: true,
      },
    }),
    prisma.openTitle.findMany({
      where: { companyId },
      select: { customerCode: true, loja: true, balance: true, daysOverdue: true },
    }),
    prisma.visit.findMany({
      where: { companyId, arrivedAt: { gte: cooldownStart } },
      select: { customerCode: true, loja: true },
    }),
    prisma.user.findMany({
      where: { companyId, active: true, idVendProt: { not: null } },
      select: { idVendProt: true, visitsPerDay: true },
    }),
  ])

  const salesByCustomer = new Map<string, SaleRecord[]>()
  for (const sale of sales) {
    const k = key(sale.customerCode, sale.loja)
    const list = salesByCustomer.get(k) ?? []
    list.push({
      orderRef: sale.orderRef,
      date: dateToYmd(sale.date) as string,
      productCode: sale.productCode,
      productDesc: sale.productDesc,
      amount: Number(sale.amount),
    })
    salesByCustomer.set(k, list)
  }

  const titlesByCustomer = new Map<string, TitleInput[]>()
  for (const title of titles) {
    const k = key(title.customerCode, title.loja)
    const list = titlesByCustomer.get(k) ?? []
    list.push({ balance: Number(title.balance), daysOverdue: title.daysOverdue })
    titlesByCustomer.set(k, list)
  }

  const visitedRecently = new Set(recentVisits.map((v) => key(v.customerCode, v.loja)))

  // ─── Sinais por cliente (premissas resolvidas por segmento) ───
  const contexts: CustomerContext[] = []
  for (const customer of customers) {
    const code = customer.protheusCode as string
    const loja = customer.loja ?? '01'
    const k = key(code, loja)
    const input: CustomerInput = {
      customerCode: code,
      loja,
      msblql: customer.msblql,
      creditLimit: dec(customer.creditLimit),
      ultcom: dateToYmd(customer.ultcom),
      segment: customer.segment,
      city: customer.municipio,
      district: customer.bairro,
    }
    const params = customer.segment ? resolveParameters(overrides, customer.segment) : globalParams
    const customerTitles = titlesByCustomer.get(k) ?? []
    const signal = computeCustomerSignal(
      input,
      salesByCustomer.get(k) ?? [],
      customerTitles,
      today,
      params
    )
    contexts.push({ input, vendorCode: customer.vendorCode, name: customer.name, signal, titles: customerTitles })
  }

  // ─── Planos por vendedor (ranking dentro da carteira) ───
  const scoresByCustomer = new Map<string, RankedItem>()
  let plansCreated = 0
  let plansSkipped = 0
  const planDate = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(4, 6)) - 1, Number(today.slice(6, 8)))
  )

  for (const seller of sellers) {
    const vendorCode = seller.idVendProt as string
    const portfolio = contexts.filter((c) => c.vendorCode === vendorCode)
    if (portfolio.length === 0) continue

    const rankable: RankableCustomer[] = portfolio.map((c) => ({
      customerCode: c.input.customerCode,
      loja: c.input.loja,
      city: c.input.city,
      district: c.input.district,
      signal: c.signal,
      visitedRecently: visitedRecently.has(key(c.input.customerCode, c.input.loja)),
    }))
    const capacity = seller.visitsPerDay ?? globalParams.visits_per_day
    const ranking = rankCustomers(rankable, capacity, globalParams)

    for (const item of [...ranking.selected, ...ranking.blocked]) {
      scoresByCustomer.set(key(item.customerCode, item.loja), item)
    }

    // Plano existente editado pelo vendedor/gestor é intocável
    const existing = await prisma.visitPlan.findUnique({
      where: {
        companyId_vendorCode_date_kind: { companyId, vendorCode, date: planDate, kind: 'DAY' },
      },
      select: { id: true, status: true },
    })
    if (existing && existing.status !== 'GENERATED') {
      plansSkipped++
      continue
    }
    if (existing) {
      await prisma.visitPlan.delete({ where: { id: existing.id } }) // cascade nos itens
    }

    const goalSnapshot = await prisma.goalSnapshot.findFirst({
      where: { companyId, vendorCode, period: currentPeriod },
      orderBy: { capturedAt: 'desc' },
      select: { goalAmount: true, soldAmount: true },
    })
    const goal = computeVendorGoal({
      goalAmount: dec(goalSnapshot?.goalAmount ?? null),
      soldAmount: dec(goalSnapshot?.soldAmount ?? null),
      businessDaysLeft: businessDaysRemaining(now, globalParams.saturday_workday),
      portfolio: portfolio.map((c) => c.signal),
    })

    const contextByKey = new Map(contexts.map((c) => [key(c.input.customerCode, c.input.loja), c]))
    const items = [...ranking.selected, ...ranking.blocked] // bloqueados ao final (DTO E7)
    const expectedAmount = ranking.selected.reduce((sum, i) => sum + (i.expectedAmount ?? 0), 0)

    await prisma.visitPlan.create({
      data: {
        companyId,
        vendorCode,
        date: planDate,
        kind: 'DAY',
        engineVersion: ENGINE_VERSION,
        goalGap: goal.gap,
        expectedAmount: Math.round(expectedAmount * 100) / 100,
        grouping: ranking.grouping,
        status: 'GENERATED',
        items: {
          create: items.map((item, index) => {
            const ctx = contextByKey.get(key(item.customerCode, item.loja))
            return {
              position: index + 1,
              customerCode: item.customerCode,
              loja: item.loja,
              statusAtTime: item.status,
              scoreAtTime: item.scoreTotal,
              shortReason: item.shortReason,
              suggestedOffer: ctx
                ? ((buildSuggestedOffer(ctx.signal) ?? undefined) as Prisma.InputJsonValue | undefined)
                : undefined,
              expectedAmount: item.expectedAmount,
              origin: 'ENGINE' as const,
              signalsSnapshot: ctx
                ? (buildSnapshot(ctx) as unknown as Prisma.InputJsonValue)
                : undefined,
            }
          }),
        },
      },
    })
    plansCreated++
  }

  // ─── Grava os sinais (replace por tenant, com os scores do ranking) ───
  const signalRows = contexts.map((c) => {
    const ranked = scoresByCustomer.get(key(c.input.customerCode, c.input.loja))
    return {
      companyId,
      customerCode: c.input.customerCode,
      loja: c.input.loja,
      cycleDays: c.signal.cycleDays,
      daysSinceLastPurchase: c.signal.daysSinceLastPurchase,
      status: c.signal.status,
      confidence: c.signal.confidence,
      orders12m: c.signal.orders12m,
      avgTicket: c.signal.avgTicket,
      trendPct: c.signal.trendPct,
      purchaseProb: c.signal.purchaseProb,
      usualMix: c.signal.usualMix as unknown as Prisma.InputJsonValue,
      cutMix: c.signal.cutMix as unknown as Prisma.InputJsonValue,
      reasons: c.signal.reasons as unknown as Prisma.InputJsonValue,
      scoreValue: ranked?.scoreValue ?? null,
      scoreUrgency: ranked?.scoreUrgency ?? null,
      scoreRisk: ranked?.scoreRisk ?? null,
      scoreTotal: ranked?.scoreTotal ?? null,
    }
  })
  await prisma.$transaction([
    prisma.customerSignal.deleteMany({ where: { companyId } }),
    prisma.customerSignal.createMany({ data: signalRows }),
  ])

  return {
    customers: customers.length,
    signals: signalRows.length,
    sellers: sellers.length,
    plansCreated,
    plansSkipped,
  }
}
