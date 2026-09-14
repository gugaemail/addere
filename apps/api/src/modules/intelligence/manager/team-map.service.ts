// Consultas do mapa da equipe (E20) — carrega planos do dia, visitas com GPS
// e nomes; a montagem é pura em team-map.ts.
import { prisma } from '@addere/db'
import type { TeamMapDto } from '@addere/types'
import { getFreshness } from '../app/plan.service'
import { buildTeamMap } from './team-map'
import type { TeamScope } from './manager.service'
import { addDays, ymdToUtcDate } from './range'
import { ymdSaoPaulo } from '../engine/business-days'

export async function buildTeamMapForDay(
  companyId: string,
  scope: TeamScope,
  anchorYmd: string
): Promise<TeamMapDto> {
  const isoDate = `${anchorYmd.slice(0, 4)}-${anchorYmd.slice(4, 6)}-${anchorYmd.slice(6, 8)}`
  const sellers = await prisma.user.findMany({
    where: {
      companyId,
      active: true,
      idVendProt: { not: null },
      ...(scope.managerId ? { managerId: scope.managerId } : {}),
    },
    select: { id: true, name: true, idVendProt: true },
    orderBy: { name: 'asc' },
  })
  const vendorCodes = sellers.map((s) => s.idVendProt as string)
  const freshness = await getFreshness(companyId)
  if (vendorCodes.length === 0) {
    return { date: isoDate, sellers: [], lastSyncAt: freshness.lastSyncAt }
  }

  const [plans, visits] = await Promise.all([
    prisma.visitPlan.findMany({
      where: { companyId, vendorCode: { in: vendorCodes }, kind: 'DAY', date: ymdToUtcDate(anchorYmd) },
      select: {
        vendorCode: true,
        grouping: true,
        items: {
          select: {
            id: true,
            position: true,
            customerCode: true,
            loja: true,
            statusAtTime: true,
            lat: true,
            lng: true,
            plannedTime: true,
            removedAt: true,
          },
        },
      },
    }),
    // Rede larga em UTC (±1 dia) e recorte fino pelo dia civil de São Paulo
    prisma.visit.findMany({
      where: {
        companyId,
        vendorCode: { in: vendorCodes },
        arrivedAt: { gte: ymdToUtcDate(addDays(anchorYmd, -1)), lte: ymdToUtcDate(addDays(anchorYmd, 2)) },
      },
      select: { vendorCode: true, planItemId: true, customerCode: true, loja: true, arrivedAt: true, lat: true, lng: true },
    }),
  ])

  const codes = new Set<string>()
  for (const plan of plans) for (const item of plan.items) codes.add(item.customerCode)
  for (const visit of visits) codes.add(visit.customerCode)
  const customers =
    codes.size === 0
      ? []
      : await prisma.customer.findMany({
          where: { companyId, protheusCode: { in: [...codes] } },
          select: { protheusCode: true, loja: true, name: true },
        })
  const nameByKey = new Map(customers.map((c) => [`${c.protheusCode}|${c.loja ?? '01'}`, c.name]))

  return buildTeamMap({
    date: isoDate,
    sellers: sellers.map((s) => ({ userId: s.id, name: s.name, vendorCode: s.idVendProt as string })),
    plans: plans.map((p) => ({
      vendorCode: p.vendorCode,
      grouping: p.grouping,
      items: p.items.map((i) => ({
        id: i.id,
        position: i.position,
        customerCode: i.customerCode,
        loja: i.loja,
        statusAtTime: i.statusAtTime,
        lat: i.lat === null ? null : Number(i.lat),
        lng: i.lng === null ? null : Number(i.lng),
        plannedTime: i.plannedTime,
        removed: i.removedAt !== null,
      })),
    })),
    visits: visits
      .filter((v) => ymdSaoPaulo(v.arrivedAt) === anchorYmd)
      .map((v) => ({
        vendorCode: v.vendorCode,
        planItemId: v.planItemId,
        customerCode: v.customerCode,
        loja: v.loja,
        arrivedAt: v.arrivedAt.toISOString(),
        lat: v.lat === null ? null : Number(v.lat),
        lng: v.lng === null ? null : Number(v.lng),
      })),
    nameByKey,
    lastSyncAt: freshness.lastSyncAt,
  })
}
