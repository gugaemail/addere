// Montagem dos DTOs do plano/home do vendedor (E7).
// Fase 2: plano da semana (kind WEEK, itens com plannedDate — E18) e
// hora prevista recalculada quando o vendedor reordena (E16).
import { prisma } from '@addere/db'
import type { PlanKind, Prisma, Vehicle, VisitPlan, VisitPlanItem } from '@prisma/client'
import type { SignalsSnapshot, VisitPlanDto, VisitPlanItemDto } from '@addere/types'
import { DEFAULT_INTEL_PARAMETERS } from '@addere/types'
import {
  businessDaysRemaining,
  dateToYmdUtc,
  mondayOf,
  weekdayOf,
  ymdSaoPaulo,
  ymdToDate,
} from '../engine/business-days'
import { resolveParameters, type ParameterOverride } from '../engine/parameters'
import { annotateSequence, clockToMinutes, type RoutableStop } from '../engine/routing'

const STALE_HOURS = 26 // sem sync há mais de ~1 dia → pill de atenção

export async function getFreshness(companyId: string) {
  const lastSync = await prisma.intelJobRun.findFirst({
    where: { companyId, job: { in: ['NIGHTLY', 'SYNC', 'REFRESH'] }, status: 'OK' },
    orderBy: { startedAt: 'desc' },
    select: { finishedAt: true },
  })
  const lastSyncAt = lastSync?.finishedAt?.toISOString() ?? null
  const stale =
    !lastSync?.finishedAt ||
    Date.now() - lastSync.finishedAt.getTime() > STALE_HOURS * 3_600_000
  return { lastSyncAt, stale }
}

export function todayPlanDate(now: Date = new Date()): Date {
  return ymdToDate(ymdSaoPaulo(now))
}

/** Segunda-feira (meia-noite UTC) da semana que contém o dia — chave do plano WEEK. */
export function weekPlanDate(date: Date = new Date()): Date {
  return ymdToDate(mondayOf(ymdSaoPaulo(date)))
}

/** Idem, a partir de um dia civil já em UTC (ex.: o `date` da query). */
export function weekPlanDateOf(day: Date): Date {
  return ymdToDate(mondayOf(dateToYmdUtc(day)))
}

async function buildGoal(companyId: string, vendorCode: string) {
  const period = ymdSaoPaulo(new Date()).slice(0, 6)
  const snapshot = await prisma.goalSnapshot.findFirst({
    where: { companyId, vendorCode, period },
    orderBy: { capturedAt: 'desc' },
    select: { goalAmount: true, soldAmount: true },
  })
  if (!snapshot) return null

  const goalAmount = snapshot.goalAmount === null ? null : Number(snapshot.goalAmount)
  const soldAmount = snapshot.soldAmount === null ? null : Number(snapshot.soldAmount)
  const gap = goalAmount === null ? null : Math.max(0, goalAmount - (soldAmount ?? 0))
  const businessDays = businessDaysRemaining(new Date(), DEFAULT_INTEL_PARAMETERS.saturday_workday)

  // Cobertura de atrasados: Σ ticket×prob dos LATE/AT_RISK da carteira (§4.2)
  const portfolio = await prisma.customer.findMany({
    where: { companyId, vendorCode, active: true, protheusCode: { not: null } },
    select: { protheusCode: true, loja: true },
  })
  const signals = await prisma.customerSignal.findMany({
    where: {
      companyId,
      status: { in: ['LATE', 'AT_RISK'] },
      customerCode: { in: portfolio.map((c) => c.protheusCode as string) },
    },
    select: { customerCode: true, loja: true, avgTicket: true, purchaseProb: true },
  })
  const portfolioKeys = new Set(portfolio.map((c) => `${c.protheusCode}|${c.loja ?? '01'}`))
  const lateCoverage = signals
    .filter((s) => portfolioKeys.has(`${s.customerCode}|${s.loja}`))
    .reduce((sum, s) => sum + Number(s.avgTicket ?? 0) * Number(s.purchaseProb ?? 0), 0)

  return {
    goalAmount: goalAmount?.toFixed(2) ?? null,
    soldAmount: soldAmount?.toFixed(2) ?? null,
    gap: gap?.toFixed(2) ?? null,
    perBusinessDay: gap === null || businessDays <= 0 ? null : (gap / businessDays).toFixed(2),
    lateCoverage: lateCoverage.toFixed(2),
  }
}

type PlanWithItems = VisitPlan & { items: VisitPlanItem[] }

export async function buildPlanDto(
  plan: PlanWithItems,
  companyId: string
): Promise<VisitPlanDto> {
  const customers = await prisma.customer.findMany({
    where: { companyId, protheusCode: { in: plan.items.map((i) => i.customerCode) } },
    select: { protheusCode: true, loja: true, name: true, address: true, municipio: true, phone: true },
  })
  const byKey = new Map(customers.map((c) => [`${c.protheusCode}|${c.loja ?? '01'}`, c]))

  const items: VisitPlanItemDto[] = [...plan.items]
    .sort((a, b) => a.position - b.position)
    .map((item) => {
      const customer = byKey.get(`${item.customerCode}|${item.loja}`)
      return {
        id: item.id,
        position: item.position,
        customerCode: item.customerCode,
        loja: item.loja,
        customerName: customer?.name ?? item.customerCode,
        customerAddress: customer
          ? [customer.address, customer.municipio].filter(Boolean).join(', ') || null
          : null,
        customerPhone: customer?.phone ?? null,
        statusAtTime: item.statusAtTime,
        shortReason: item.shortReason,
        suggestedOffer: (item.suggestedOffer ?? null) as VisitPlanItemDto['suggestedOffer'],
        expectedAmount: item.expectedAmount === null ? null : Number(item.expectedAmount).toFixed(2),
        origin: item.origin,
        removedAt: item.removedAt?.toISOString() ?? null,
        signals: (item.signalsSnapshot ?? null) as SignalsSnapshot | null,
        lat: item.lat === null ? null : Number(item.lat),
        lng: item.lng === null ? null : Number(item.lng),
        plannedTime: item.plannedTime ?? null,
        distFromPrevM: item.distFromPrevM ?? null,
        etaMin: item.etaMin ?? null,
        plannedDate: item.plannedDate ? item.plannedDate.toISOString().slice(0, 10) : null,
      }
    })

  return {
    id: plan.id,
    date: plan.date.toISOString().slice(0, 10),
    kind: plan.kind,
    status: plan.status,
    generatedAt: plan.generatedAt.toISOString(),
    grouping: plan.grouping,
    expectedAmount: plan.expectedAmount === null ? null : Number(plan.expectedAmount).toFixed(2),
    llmSummary: plan.llmSummary,
    items,
    freshness: await getFreshness(companyId),
    goal: await buildGoal(companyId, plan.vendorCode),
  }
}

export async function getPlanForDate(
  companyId: string,
  vendorCode: string,
  date: Date,
  kind: PlanKind = 'DAY'
): Promise<PlanWithItems | null> {
  return prisma.visitPlan.findUnique({
    where: { companyId_vendorCode_date_kind: { companyId, vendorCode, date, kind } },
    include: { items: { orderBy: { position: 'asc' } } },
  }) as Promise<PlanWithItems | null>
}

export interface PersistItem {
  id: string
  position: number
  removed: boolean
  plannedDate?: string | null
}

/**
 * Recalcula distância/deslocamento/hora prevista da ordem que o vendedor
 * decidiu (E16): a sequência é dele, os números são do motor. Sem coordenadas
 * nos itens (empresa sem geocodificação), devolve tudo nulo — nada a anotar.
 */
async function reannotate(
  plan: PlanWithItems,
  ordered: PersistItem[]
): Promise<Map<string, { distFromPrevM: number | null; etaMin: number | null; plannedTime: string | null }>> {
  const result = new Map<string, { distFromPrevM: number | null; etaMin: number | null; plannedTime: string | null }>()
  const byId = new Map(plan.items.map((i) => [i.id, i]))
  const active = ordered.filter((i) => !i.removed && byId.has(i.id))
  if (!active.some((i) => byId.get(i.id)?.lat !== null && byId.get(i.id)?.lat !== undefined)) {
    return result
  }

  const [overrides, seller, windows] = await Promise.all([
    prisma.intelParameter.findMany({
      where: { companyId: plan.companyId },
      select: { key: true, value: true, segment: true },
    }),
    prisma.user.findFirst({
      where: { companyId: plan.companyId, idVendProt: plan.vendorCode, active: true },
      select: { vehicle: true },
    }),
    prisma.customerWindow.findMany({
      where: { companyId: plan.companyId, customerCode: { in: plan.items.map((i) => i.customerCode) } },
      select: { customerCode: true, loja: true, weekday: true, startTime: true, endTime: true },
    }),
  ])
  const params = resolveParameters(overrides as ParameterOverride[])
  const opts = {
    dayStartHour: params.day_start_hour,
    visitMinutes: params.visit_minutes,
    avgSpeedKmh: params.avg_speed_kmh,
    vehicle: (seller?.vehicle ?? null) as Vehicle | null,
  }

  // Um dia por vez: no plano da semana cada dia recomeça às day_start_hour
  const days = new Map<string, PersistItem[]>()
  for (const item of active) {
    const day = item.plannedDate ?? (byId.get(item.id)?.plannedDate?.toISOString().slice(0, 10) ?? '')
    const list = days.get(day) ?? []
    list.push(item)
    days.set(day, list)
  }

  for (const [day, items] of days) {
    const weekday = day ? weekdayOf(day.replace(/-/g, '')) : weekdayOf(dateToYmdUtc(plan.date))
    const stops: RoutableStop<string>[] = items
      .sort((a, b) => a.position - b.position)
      .map((item) => {
        const row = byId.get(item.id) as VisitPlanItem
        const rowWindows = windows
          .filter((w) => w.customerCode === row.customerCode && w.loja === row.loja && w.weekday === weekday)
          .map((w) => ({ startMin: clockToMinutes(w.startTime) ?? 0, endMin: clockToMinutes(w.endTime) ?? 0 }))
          .filter((w) => w.endMin > w.startMin)
        // Bloqueados não entram na rota (seção "resolver", sem hora)
        const blocked = row.statusAtTime === 'BLOCKED'
        return {
          key: item.id,
          lat: blocked || row.lat === null ? null : Number(row.lat),
          lng: blocked || row.lng === null ? null : Number(row.lng),
          windows: rowWindows,
          payload: item.id,
        }
      })
    for (const stop of annotateSequence(stops, opts)) {
      result.set(stop.key, {
        distFromPrevM: stop.distFromPrevM,
        etaMin: stop.etaMin,
        plannedTime: stop.plannedTime,
      })
    }
  }
  return result
}

export async function persistPlanEdit(
  plan: PlanWithItems,
  grouping: string | null,
  items: PersistItem[],
  edited: boolean
): Promise<void> {
  const annotations = await reannotate(plan, items)
  const updates: Prisma.PrismaPromise<unknown>[] = items.map((item) => {
    const geo = annotations.get(item.id)
    return prisma.visitPlanItem.update({
      where: { id: item.id },
      data: {
        position: item.position,
        removedAt: item.removed ? new Date() : null,
        ...(item.plannedDate !== undefined
          ? { plannedDate: item.plannedDate ? ymdToDate(item.plannedDate.replace(/-/g, '')) : null }
          : {}),
        ...(geo ?? (item.removed ? {} : {})),
      },
    })
  })
  updates.push(
    prisma.visitPlan.update({
      where: { id: plan.id },
      data: { grouping, ...(edited ? { status: 'EDITED' } : {}) },
    })
  )
  await prisma.$transaction(updates)
}
