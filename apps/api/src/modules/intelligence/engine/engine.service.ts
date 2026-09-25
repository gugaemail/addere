// Orquestração do motor (E5): carrega dados do tenant, calcula sinais por
// cliente (premissas por segmento), grava CustomerSignal e gera o plano do
// dia por vendedor — sem sobrescrever plano EDITED (doc §4.3, SideEffect).
// Fase 2: RFM e cross-sell por carteira (E19), ordem por distância com hora
// prevista e janelas (E16) e plano da semana com paradas por dia (E18).
import { prisma } from '@addere/db'
import type { Prisma, Vehicle } from '@prisma/client'
import type { SignalsSnapshot } from '@addere/types'
import { unprocessable } from '../../../lib/errors'
import { resolveParameters, type EngineParameters, type ParameterOverride } from './parameters'
import {
  businessDaysLeftInWeek,
  businessDaysRemaining,
  dateToYmdUtc,
  mondayOf,
  weekdayOf,
  ymdSaoPaulo,
  ymdToDate,
} from './business-days'
import {
  computeCustomerSignal,
  type CustomerInput,
  type CustomerSignalResult,
  type SaleRecord,
  type TitleInput,
} from './signals'
import { computeVendorGoal } from './goal'
import { rankCustomers, type RankableCustomer, type RankedItem } from './ranking'
import { computeCrossSell, computeRfm, type CrossSellSuggestion, type RfmScore } from './rfm'
import { annotateSequence, clockToMinutes, routeStops, type RoutableStop, type RoutedStop } from './routing'

export const ENGINE_VERSION = 'engine-v2'
const TWELVE_MONTHS_DAYS = 365
const CROSS_SELL_IN_OFFER = 2

export interface EngineRunSummary {
  customers: number
  signals: number
  sellers: number
  plansCreated: number
  plansSkipped: number // planos EDITED/IN_PROGRESS preservados
  weekPlansCreated: number
  weekPlansSkipped: number
}

interface CustomerContext {
  input: CustomerInput
  vendorCode: string | null
  name: string
  signal: CustomerSignalResult
  titles: TitleInput[]
  amount12m: number
  products: Set<string>
  rfm: RfmScore | null
  crossSell: CrossSellSuggestion[]
}

interface Seller {
  id: string
  idVendProt: string
  visitsPerDay: number | null
  vehicle: Vehicle | null
}

interface WindowRow {
  customerCode: string
  loja: string
  weekday: number
  startTime: string
  endTime: string
}

const key = (code: string, loja: string) => `${code}|${loja}`
const dec = (value: Prisma.Decimal | null) => (value === null ? null : Number(value))

function dateToYmd(date: Date | null): string | null {
  if (!date) return null
  return dateToYmdUtc(date)
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
    rfmSegment: ctx.rfm?.segment ?? null,
    crossSell: ctx.crossSell,
  }
}

function buildSuggestedOffer(ctx: CustomerContext) {
  const signal = ctx.signal
  // Bloqueado não recebe oferta: a visita é para resolver a pendência (regra 3 do agente)
  if (signal.status === 'BLOCKED') return null
  const offer = [
    ...signal.usualMix.map((p) => ({ ...p, source: 'usual' as const })),
    ...signal.cutMix.map((p) => ({ ...p, source: 'ask_about_cut' as const })),
    ...ctx.crossSell.slice(0, CROSS_SELL_IN_OFFER).map((p) => ({
      productCode: p.productCode,
      productDesc: p.productDesc,
      source: 'cross_sell' as const,
    })),
  ]
  return offer.length > 0 ? offer : null
}

/** Janelas do cliente no dia (minutos desde a meia-noite); vazio = sem restrição. */
function windowsFor(
  windowsByKey: Map<string, WindowRow[]>,
  customerKey: string,
  weekday: number
): Array<{ startMin: number; endMin: number }> {
  const rows = windowsByKey.get(customerKey) ?? []
  const result: Array<{ startMin: number; endMin: number }> = []
  for (const row of rows) {
    if (row.weekday !== weekday) continue
    const startMin = clockToMinutes(row.startTime)
    const endMin = clockToMinutes(row.endTime)
    if (startMin === null || endMin === null || endMin <= startMin) continue
    result.push({ startMin, endMin })
  }
  return result
}

interface StopPayload {
  item: RankedItem
  ctx: CustomerContext | undefined
}

/** Ordena as paradas do dia (E16) — por distância quando ligado, senão só anota a ordem do ranking. */
function routeDay(
  selected: RankedItem[],
  contextByKey: Map<string, CustomerContext>,
  geoByKey: Map<string, { lat: Prisma.Decimal | null; lng: Prisma.Decimal | null }>,
  windowsByKey: Map<string, WindowRow[]>,
  weekday: number,
  seller: Seller,
  params: EngineParameters
): RoutedStop<StopPayload>[] {
  const stops: RoutableStop<StopPayload>[] = selected.map((item) => {
    const k = key(item.customerCode, item.loja)
    const geo = geoByKey.get(k)
    return {
      key: k,
      lat: geo?.lat === undefined || geo.lat === null ? null : Number(geo.lat),
      lng: geo?.lng === undefined || geo.lng === null ? null : Number(geo.lng),
      windows: windowsFor(windowsByKey, k, weekday),
      payload: { item, ctx: contextByKey.get(k) },
    }
  })
  const opts = {
    dayStartHour: params.day_start_hour,
    visitMinutes: params.visit_minutes,
    avgSpeedKmh: params.avg_speed_kmh,
    vehicle: seller.vehicle,
  }
  return params.route_by_distance ? routeStops(stops, opts) : annotateSequence(stops, opts)
}

function itemCreate(
  stop: RoutedStop<StopPayload>,
  position: number,
  geoByKey: Map<string, { lat: Prisma.Decimal | null; lng: Prisma.Decimal | null }>,
  plannedDate: Date | null
) {
  const { item, ctx } = stop.payload
  const geoPos = geoByKey.get(key(item.customerCode, item.loja))
  return {
    position,
    lat: geoPos?.lat ?? undefined,
    lng: geoPos?.lng ?? undefined,
    distFromPrevM: stop.distFromPrevM,
    etaMin: stop.etaMin,
    plannedTime: stop.plannedTime,
    plannedDate: plannedDate ?? undefined,
    customerCode: item.customerCode,
    loja: item.loja,
    statusAtTime: item.status,
    scoreAtTime: item.scoreTotal,
    shortReason: item.shortReason,
    suggestedOffer: ctx
      ? ((buildSuggestedOffer(ctx) ?? undefined) as Prisma.InputJsonValue | undefined)
      : undefined,
    expectedAmount: item.expectedAmount,
    origin: 'ENGINE' as const,
    signalsSnapshot: ctx ? (buildSnapshot(ctx) as unknown as Prisma.InputJsonValue) : undefined,
  }
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

  const [customers, sales, titles, recentVisits, sellerRows, windowRows] = await Promise.all([
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
      select: { id: true, idVendProt: true, visitsPerDay: true, vehicle: true },
    }),
    prisma.customerWindow.findMany({
      where: { companyId },
      select: { customerCode: true, loja: true, weekday: true, startTime: true, endTime: true },
    }),
  ])
  const sellers: Seller[] = sellerRows.map((s) => ({
    id: s.id,
    idVendProt: s.idVendProt as string,
    visitsPerDay: s.visitsPerDay ?? null,
    vehicle: (s.vehicle ?? null) as Vehicle | null,
  }))

  const salesByCustomer = new Map<string, SaleRecord[]>()
  const productDesc = new Map<string, string | null>()
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
    if (!productDesc.has(sale.productCode)) productDesc.set(sale.productCode, sale.productDesc)
  }

  const titlesByCustomer = new Map<string, TitleInput[]>()
  for (const title of titles) {
    const k = key(title.customerCode, title.loja)
    const list = titlesByCustomer.get(k) ?? []
    list.push({ balance: Number(title.balance), daysOverdue: title.daysOverdue })
    titlesByCustomer.set(k, list)
  }

  const visitedRecently = new Set(recentVisits.map((v) => key(v.customerCode, v.loja)))

  const windowsByKey = new Map<string, WindowRow[]>()
  for (const row of windowRows) {
    const k = key(row.customerCode, row.loja)
    const list = windowsByKey.get(k) ?? []
    list.push(row)
    windowsByKey.set(k, list)
  }

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
    const customerSales = salesByCustomer.get(k) ?? []
    const signal = computeCustomerSignal(input, customerSales, customerTitles, today, params)
    contexts.push({
      input,
      vendorCode: customer.vendorCode,
      name: customer.name,
      signal,
      titles: customerTitles,
      amount12m: customerSales.reduce((sum, s) => sum + s.amount, 0),
      products: new Set(customerSales.map((s) => s.productCode)),
      rfm: null,
      crossSell: [],
    })
  }
  const contextByKey = new Map(contexts.map((c) => [key(c.input.customerCode, c.input.loja), c]))

  // ─── RFM por carteira (E19): quintis dentro da carteira de cada vendedor ───
  for (const seller of sellers) {
    const portfolio = contexts.filter((c) => c.vendorCode === seller.idVendProt)
    const scores = computeRfm(
      portfolio.map((c) => ({
        key: key(c.input.customerCode, c.input.loja),
        daysSinceLastPurchase: c.signal.daysSinceLastPurchase,
        orders12m: c.signal.orders12m,
        amount12m: c.amount12m,
      }))
    )
    for (const c of portfolio) c.rfm = scores.get(key(c.input.customerCode, c.input.loja)) ?? null
  }

  // ─── Cross-sell (E19): pares = segmento do cadastro ou, sem ele, o segmento RFM ───
  const crossSell = computeCrossSell(
    contexts.map((c) => ({
      key: key(c.input.customerCode, c.input.loja),
      peerGroup: c.input.segment ?? c.rfm?.segment ?? null,
      products: c.products,
    })),
    productDesc,
    globalParams.cross_sell_min_pct
  )
  for (const c of contexts) c.crossSell = crossSell.get(key(c.input.customerCode, c.input.loja)) ?? []

  // ─── Planos por vendedor (ranking dentro da carteira) ───
  const scoresByCustomer = new Map<string, RankedItem>()
  let plansCreated = 0
  let plansSkipped = 0
  let weekPlansCreated = 0
  let weekPlansSkipped = 0
  const planDate = ymdToDate(today)
  const weekDays = businessDaysLeftInWeek(today, globalParams.saturday_workday)
  const weekStart = ymdToDate(mondayOf(today))

  // Coordenadas do cache de geocodificação (E15-F1) — precisão CITY não
  // posiciona pino no mapa, então fica de fora
  const geoRows = await prisma.geoAddress.findMany({
    where: { companyId, lat: { not: null }, precision: { not: 'CITY' } },
    select: { customerCode: true, loja: true, lat: true, lng: true },
  })
  const geoByKey = new Map(geoRows.map((g) => [key(g.customerCode, g.loja), g]))

  for (const seller of sellers) {
    const vendorCode = seller.idVendProt
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
    // Score de TODA a carteira — quem o vendedor puxou para hoje no plano da
    // semana pode não estar no top-K e ainda assim precisa de score no card
    const fullRanking = rankCustomers(rankable, rankable.length, globalParams)
    const scoreByKey = new Map(fullRanking.selected.map((i) => [key(i.customerCode, i.loja), i]))

    for (const item of [...fullRanking.selected, ...ranking.blocked]) {
      scoresByCustomer.set(key(item.customerCode, item.loja), item)
    }

    // Paradas que o vendedor moveu para hoje no plano da semana (E18): entram
    // no plano do dia na frente do ranking, sem estourar a capacidade
    const forcedKeys = await forcedForToday(companyId, vendorCode, weekStart, planDate)
    const forced = [...forcedKeys]
      .map((k) => scoreByKey.get(k))
      .filter((i): i is RankedItem => !!i && i.status !== 'BLOCKED')
    const selected = [
      ...forced,
      ...ranking.selected.filter((i) => !forcedKeys.has(key(i.customerCode, i.loja))),
    ].slice(0, Math.max(capacity, forced.length))

    // Plano existente editado pelo vendedor/gestor é intocável
    const existing = await prisma.visitPlan.findUnique({
      where: {
        companyId_vendorCode_date_kind: { companyId, vendorCode, date: planDate, kind: 'DAY' },
      },
      select: { id: true, status: true },
    })
    if (existing && existing.status !== 'GENERATED') {
      plansSkipped++
    } else {
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

      const routed = routeDay(
        selected,
        contextByKey,
        geoByKey,
        windowsByKey,
        weekdayOf(today),
        seller,
        globalParams
      )
      const expectedAmount = selected.reduce((sum, i) => sum + (i.expectedAmount ?? 0), 0)
      const blockedStops: RoutedStop<StopPayload>[] = ranking.blocked.map((item, index) => ({
        key: key(item.customerCode, item.loja),
        position: routed.length + index + 1,
        distFromPrevM: null,
        etaMin: null,
        plannedTime: null,
        payload: { item, ctx: contextByKey.get(key(item.customerCode, item.loja)) },
      }))

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
            create: [...routed, ...blockedStops].map((stop, index) =>
              itemCreate(stop, index + 1, geoByKey, null)
            ),
          },
        },
      })
      plansCreated++
    }

    // ─── Plano da semana (E18): hoje + os próximos dias úteis da semana ───
    if (weekDays.length >= 2) {
      const existingWeek = await prisma.visitPlan.findUnique({
        where: {
          companyId_vendorCode_date_kind: { companyId, vendorCode, date: weekStart, kind: 'WEEK' },
        },
        select: { id: true, status: true },
      })
      if (existingWeek && existingWeek.status !== 'GENERATED') {
        weekPlansSkipped++
        continue
      }
      if (existingWeek) await prisma.visitPlan.delete({ where: { id: existingWeek.id } })

      const chosen = new Set(selected.map((i) => key(i.customerCode, i.loja)))
      const weekItems: ReturnType<typeof itemCreate>[] = []
      let position = 0
      let weekExpected = 0
      const groupings: string[] = []
      for (const [dayIndex, ymd] of weekDays.entries()) {
        let dayItems: RankedItem[]
        let grouping: string | null
        if (dayIndex === 0) {
          dayItems = selected
          grouping = ranking.grouping
        } else {
          const remaining = rankable.filter((c) => !chosen.has(key(c.customerCode, c.loja)))
          const dayRanking = rankCustomers(remaining, capacity, globalParams)
          dayItems = dayRanking.selected
          grouping = dayRanking.grouping
        }
        if (grouping) groupings.push(grouping)
        for (const item of dayItems) chosen.add(key(item.customerCode, item.loja))
        const routedDay = routeDay(
          dayItems,
          contextByKey,
          geoByKey,
          windowsByKey,
          weekdayOf(ymd),
          seller,
          globalParams
        )
        for (const stop of routedDay) {
          position++
          weekItems.push(itemCreate(stop, position, geoByKey, ymdToDate(ymd)))
          weekExpected += stop.payload.item.expectedAmount ?? 0
        }
      }

      await prisma.visitPlan.create({
        data: {
          companyId,
          vendorCode,
          date: weekStart,
          kind: 'WEEK',
          engineVersion: ENGINE_VERSION,
          expectedAmount: Math.round(weekExpected * 100) / 100,
          grouping: [...new Set(groupings)].join(' · ') || null,
          status: 'GENERATED',
          items: { create: weekItems },
        },
      })
      weekPlansCreated++
    }
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
      rfmR: c.rfm?.r ?? null,
      rfmF: c.rfm?.f ?? null,
      rfmM: c.rfm?.m ?? null,
      rfmSegment: c.rfm?.segment ?? null,
      usualMix: c.signal.usualMix as unknown as Prisma.InputJsonValue,
      cutMix: c.signal.cutMix as unknown as Prisma.InputJsonValue,
      crossSell: c.crossSell as unknown as Prisma.InputJsonValue,
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
    weekPlansCreated,
    weekPlansSkipped,
  }
}

/**
 * Chaves dos clientes que o vendedor moveu para o dia no plano da semana
 * (só quando ele mexeu — plano EDITED). Plano gerado pelo motor não força nada:
 * o ranking do dia é sempre a fonte, salvo decisão explícita do vendedor.
 */
async function forcedForToday(
  companyId: string,
  vendorCode: string,
  weekStart: Date,
  planDate: Date
): Promise<Set<string>> {
  const week = await prisma.visitPlan.findUnique({
    where: {
      companyId_vendorCode_date_kind: { companyId, vendorCode, date: weekStart, kind: 'WEEK' },
    },
    select: {
      status: true,
      items: {
        where: { removedAt: null, plannedDate: planDate },
        orderBy: { position: 'asc' },
        select: { customerCode: true, loja: true },
      },
    },
  })
  if (!week || week.status !== 'EDITED') return new Set()
  return new Set((week.items ?? []).map((i) => key(i.customerCode, i.loja)))
}
