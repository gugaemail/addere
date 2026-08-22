// Montagem dos DTOs do plano/home do vendedor (E7).
import { prisma } from '@addere/db'
import type { Prisma, VisitPlan, VisitPlanItem } from '@prisma/client'
import type { SignalsSnapshot, VisitPlanDto, VisitPlanItemDto } from '@addere/types'
import { DEFAULT_INTEL_PARAMETERS } from '@addere/types'
import { businessDaysRemaining, ymdSaoPaulo } from '../engine/business-days'

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
  const today = ymdSaoPaulo(now)
  return new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(4, 6)) - 1, Number(today.slice(6, 8)))
  )
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
        plannedTime: item.plannedTime,
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
  date: Date
): Promise<PlanWithItems | null> {
  return prisma.visitPlan.findUnique({
    where: { companyId_vendorCode_date_kind: { companyId, vendorCode, date, kind: 'DAY' } },
    include: { items: { orderBy: { position: 'asc' } } },
  }) as Promise<PlanWithItems | null>
}

export async function persistPlanEdit(
  planId: string,
  grouping: string | null,
  items: { id: string; position: number; removed: boolean }[],
  edited: boolean
): Promise<void> {
  const updates: Prisma.PrismaPromise<unknown>[] = items.map((item) =>
    prisma.visitPlanItem.update({
      where: { id: item.id },
      data: {
        position: item.position,
        removedAt: item.removed ? new Date() : null,
      },
    })
  )
  updates.push(
    prisma.visitPlan.update({
      where: { id: planId },
      data: { grouping, ...(edited ? { status: 'EDITED' } : {}) },
    })
  )
  await prisma.$transaction(updates)
}
