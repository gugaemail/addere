import { Resend } from 'resend'
import { prisma } from '@addere/db'
import {
  avgOrderDuration, syncSuccessRate, offlineOrderRate,
  avgQueueDuration, totalOrders,
} from '../metrics/pilot'
import { WeeklyPilotReport } from '../../emails/WeeklyPilotReport'

function weekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

function generateHighlights(
  cur: Record<string, number | null>,
  prev: Record<string, number | null>,
): string[] {
  const highlights: string[] = []
  if (cur.syncRate !== null && prev.syncRate !== null) {
    if (cur.syncRate >= 98) highlights.push(`Taxa de sync excelente: ${cur.syncRate}% — meta de 98% atingida.`)
    else if (cur.syncRate < prev.syncRate) highlights.push(`Taxa de sync caiu de ${prev.syncRate}% para ${cur.syncRate}% — verificar conectividade.`)
  }
  if (cur.syncRate !== null && cur.syncRate < 95) {
    highlights.push('Taxa de sync abaixo de 95% — investigar falhas de sincronização.')
  }
  if (cur.avgDuration !== null) {
    const mins = Math.round(cur.avgDuration / 60_000)
    highlights.push(mins <= 5
      ? `Tempo médio por pedido: ${mins}min — dentro da meta.`
      : `Tempo médio por pedido: ${mins}min — acima da meta de 5 min.`)
  }
  if (cur.offlineRate !== null && cur.offlineRate >= 50) {
    highlights.push(`${cur.offlineRate}% dos pedidos foram feitos em campo — ótima adoção.`)
  }
  if (cur.total !== null && prev.total !== null && cur.total > prev.total) {
    const growth = Math.round(((cur.total - prev.total) / Math.max(prev.total, 1)) * 100)
    highlights.push(`Volume de pedidos cresceu ${growth}% em relação à semana anterior.`)
  }
  return highlights.length > 0 ? highlights : ['Dados insuficientes para destaques automáticos.']
}

export async function sendWeeklyReport(pilotId: string, to: string[]): Promise<void> {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY não configurada')

  const pilot = await prisma.pilot.findUniqueOrThrow({
    where: { id: pilotId },
    select: { clientName: true, startDate: true, endDate: true, status: true },
  })

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - 7)
  const prevWeekStart = new Date(now)
  prevWeekStart.setDate(now.getDate() - 14)

  const [
    curAvg, prevAvg,
    curSync, prevSync,
    curOffline, prevOffline,
    curQueue, prevQueue,
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

  const feedbackRows = await prisma.pilotFeedback.findMany({
    where: { pilotId, createdAt: { gte: weekStart } },
    select: { rating: true, comment: true },
  })

  const highlights = generateHighlights(
    { syncRate: curSync, avgDuration: curAvg, offlineRate: curOffline, total: curTotal },
    { syncRate: prevSync, avgDuration: prevAvg, offlineRate: prevOffline, total: prevTotal },
  )

  const report = {
    clientName: pilot.clientName,
    weekNumber: weekNumber(now),
    período: { start: weekStart.toISOString(), end: now.toISOString() },
    métricas: {
      avgOrderDuration: { current: curAvg, previous: prevAvg },
      syncSuccessRate: { current: curSync, previous: prevSync },
      offlineOrderRate: { current: curOffline, previous: prevOffline },
      avgQueueDuration: { current: curQueue, previous: prevQueue },
      totalOrders: { current: curTotal, previous: prevTotal },
    },
    highlights,
    feedbacks: {
      positive: feedbackRows.filter((f) => f.rating === 'positive').length,
      negative: feedbackRows.filter((f) => f.rating === 'negative').length,
      comments: feedbackRows.filter((f) => f.rating === 'negative').map((f) => f.comment),
    },
  }

  const resend = new Resend(process.env.RESEND_API_KEY)

  await resend.emails.send({
    from: 'Addere Pilot <piloto@addere.com.br>',
    to,
    subject: `Relatório semanal — ${report.clientName} — Semana ${report.weekNumber}`,
    react: WeeklyPilotReport({ report }),
  })
}
