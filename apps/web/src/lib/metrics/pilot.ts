import { prisma } from '@addere/db'
import type { PilotDashboardMetrics, Pilot } from '@addere/types'

export async function avgOrderDuration(pilotId: string, since: Date): Promise<number | null> {
  const events = await prisma.pilotEvent.findMany({
    where: { pilotId, eventType: 'ORDER_COMPLETED', occurredAt: { gte: since } },
  })
  const durations = events
    .map((e) => (e.metadata as Record<string, unknown>)?.durationMs as number | undefined)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  return durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null
}

export async function syncSuccessRate(pilotId: string, since: Date): Promise<number | null> {
  const [synced, failed] = await Promise.all([
    prisma.pilotEvent.count({ where: { pilotId, eventType: 'ORDER_SYNCED', occurredAt: { gte: since } } }),
    prisma.pilotEvent.count({ where: { pilotId, eventType: 'ORDER_SYNC_FAILED', occurredAt: { gte: since } } }),
  ])
  const total = synced + failed
  return total > 0 ? Math.round((synced / total) * 100) : null
}

export async function offlineOrderRate(pilotId: string, since: Date): Promise<number | null> {
  const events = await prisma.pilotEvent.findMany({
    where: { pilotId, eventType: 'ORDER_COMPLETED', occurredAt: { gte: since } },
  })
  const total = events.length
  const offline = events.filter(
    (e) => (e.metadata as Record<string, unknown>)?.wasOffline === true,
  ).length
  return total > 0 ? Math.round((offline / total) * 100) : null
}

export async function avgQueueDuration(pilotId: string, since: Date): Promise<number | null> {
  const events = await prisma.pilotEvent.findMany({
    where: { pilotId, eventType: 'ORDER_SYNCED', occurredAt: { gte: since } },
  })
  const durations = events
    .map((e) => (e.metadata as Record<string, unknown>)?.queuedDurationMs as number | undefined)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  return durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null
}

export async function totalOrders(pilotId: string, since: Date): Promise<number> {
  return prisma.pilotEvent.count({
    where: { pilotId, eventType: 'ORDER_COMPLETED', occurredAt: { gte: since } },
  })
}

function deltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

export async function getFullDashboardMetrics(pilotId: string): Promise<PilotDashboardMetrics> {
  const pilot = await prisma.pilot.findUniqueOrThrow({
    where: { id: pilotId },
    select: { id: true, clientName: true, startDate: true, endDate: true, status: true, companyId: true, createdAt: true },
  })

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 7)
  const prevWeekStart = new Date(now)
  prevWeekStart.setDate(now.getDate() - 14)

  const [
    curAvgDuration, prevAvgDuration,
    curSyncRate, prevSyncRate,
    curOfflineRate, prevOfflineRate,
    curQueueDuration, prevQueueDuration,
    curTotal, prevTotal,
  ] = await Promise.all([
    avgOrderDuration(pilotId, weekStart),
    avgOrderDuration(pilotId, prevWeekStart),
    syncSuccessRate(pilotId, weekStart),
    syncSuccessRate(pilotId, prevWeekStart),
    offlineOrderRate(pilotId, weekStart),
    offlineOrderRate(pilotId, prevWeekStart),
    avgQueueDuration(pilotId, weekStart),
    avgQueueDuration(pilotId, prevWeekStart),
    totalOrders(pilotId, weekStart),
    totalOrders(pilotId, prevWeekStart),
  ])

  // Pedidos por dia nos últimos 14 dias
  const dailyEvents = await prisma.pilotEvent.findMany({
    where: { pilotId, eventType: 'ORDER_COMPLETED', occurredAt: { gte: prevWeekStart } },
    select: { occurredAt: true, metadata: true },
  })

  const dailyMap: Record<string, { total: number; offline: number }> = {}
  for (const e of dailyEvents) {
    const key = e.occurredAt.toISOString().slice(0, 10)
    if (!dailyMap[key]) dailyMap[key] = { total: 0, offline: 0 }
    dailyMap[key].total++
    if ((e.metadata as Record<string, unknown>)?.wasOffline === true) dailyMap[key].offline++
  }
  const dailyOrders = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(prevWeekStart)
    d.setDate(prevWeekStart.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    return { date: key, ...(dailyMap[key] ?? { total: 0, offline: 0 }) }
  })

  // Atividade por rep
  const reps = await prisma.user.findMany({
    where: {
      companyId: pilot.companyId,
      role: 'SALESPERSON',
      active: true,
    },
    select: { id: true, name: true },
  })

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const repActivity = await Promise.all(
    reps.map(async (rep) => {
      const [ordersToday, ordersTotal, lastEvent, synced, failed] = await Promise.all([
        prisma.pilotEvent.count({
          where: { pilotId, repId: rep.id, eventType: 'ORDER_COMPLETED', occurredAt: { gte: todayStart } },
        }),
        prisma.pilotEvent.count({
          where: { pilotId, repId: rep.id, eventType: 'ORDER_COMPLETED' },
        }),
        prisma.pilotEvent.findFirst({
          where: { pilotId, repId: rep.id },
          orderBy: { occurredAt: 'desc' },
          select: { occurredAt: true },
        }),
        prisma.pilotEvent.count({
          where: { pilotId, repId: rep.id, eventType: 'ORDER_SYNCED', occurredAt: { gte: weekStart } },
        }),
        prisma.pilotEvent.count({
          where: { pilotId, repId: rep.id, eventType: 'ORDER_SYNC_FAILED', occurredAt: { gte: weekStart } },
        }),
      ])
      const total = synced + failed
      return {
        repId: rep.id,
        repName: rep.name,
        ordersToday,
        ordersTotal,
        lastActiveAt: lastEvent?.occurredAt.toISOString() ?? null,
        syncRate: total > 0 ? Math.round((synced / total) * 100) : null,
      }
    }),
  )

  // Feedbacks negativos recentes
  const negativeFeedbacks = await prisma.pilotFeedback.findMany({
    where: { pilotId, rating: 'negative' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { rep: { select: { name: true } } },
  })

  const pilotOut: Pilot = {
    id: pilot.id,
    clientName: pilot.clientName,
    startDate: pilot.startDate.toISOString(),
    endDate: pilot.endDate.toISOString(),
    status: pilot.status as 'ACTIVE' | 'COMPLETED' | 'CANCELLED',
    companyId: pilot.companyId,
    createdAt: pilot.createdAt.toISOString(),
  }

  return {
    pilot: pilotOut,
    since: weekStart.toISOString(),
    avgOrderDuration: { current: curAvgDuration, previous: prevAvgDuration, deltaPercent: deltaPercent(curAvgDuration, prevAvgDuration) },
    syncSuccessRate: { current: curSyncRate, previous: prevSyncRate, deltaPercent: deltaPercent(curSyncRate, prevSyncRate) },
    offlineOrderRate: { current: curOfflineRate, previous: prevOfflineRate, deltaPercent: deltaPercent(curOfflineRate, prevOfflineRate) },
    avgQueueDuration: { current: curQueueDuration, previous: prevQueueDuration, deltaPercent: deltaPercent(curQueueDuration, prevQueueDuration) },
    totalOrders: { current: curTotal, previous: prevTotal, deltaPercent: deltaPercent(curTotal, prevTotal) },
    dailyOrders,
    repActivity,
    recentNegativeFeedbacks: negativeFeedbacks.map((f) => ({
      id: f.id,
      repName: f.rep.name,
      comment: f.comment,
      createdAt: f.createdAt.toISOString(),
    })),
  }
}
