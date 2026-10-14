// Snapshot de sinais de UM cliente para os fatos do agente — fonte única.
// A rota de mensagem e o eval montavam o snapshot à mão com os títulos em
// aberto zerados: o modelo escrevia para um cliente bloqueado por título
// vencido achando que ele não devia nada.
import { prisma } from '@addere/db'
import type { RfmSegment, SignalsSnapshot } from '@addere/types'
import { daysOverdueOn, ymdSaoPaulo } from '../engine/business-days'

/** Snapshot a partir da linha de CustomerSignal + títulos (mesma forma do plano). */
export async function loadSnapshot(
  companyId: string,
  code: string,
  loja: string
): Promise<SignalsSnapshot | null> {
  const signal = await prisma.customerSignal.findUnique({
    where: { companyId_customerCode_loja: { companyId, customerCode: code, loja } },
  })
  if (!signal) return null
  const titles = await prisma.openTitle.findMany({
    where: { companyId, customerCode: code, loja },
    select: { balance: true, dueDate: true },
  })
  const today = ymdSaoPaulo(new Date())
  return {
    status: signal.status,
    confidence: signal.confidence,
    cycleDays: signal.cycleDays,
    daysSinceLastPurchase: signal.daysSinceLastPurchase,
    orders12m: signal.orders12m,
    avgTicket: signal.avgTicket?.toString() ?? null,
    trendPct: signal.trendPct === null ? null : Number(signal.trendPct),
    usualMix: (signal.usualMix ?? []) as SignalsSnapshot['usualMix'],
    cutMix: (signal.cutMix ?? []) as SignalsSnapshot['cutMix'],
    openTitles: {
      count: titles.length,
      totalBalance: titles.reduce((sum, t) => sum + Number(t.balance), 0).toFixed(2),
      maxDaysOverdue: titles.reduce<number | null>(
        (max, t) => Math.max(max ?? 0, daysOverdueOn(t.dueDate, today)),
        null
      ),
    },
    reasons: (signal.reasons ?? []) as string[],
    rfmSegment: (signal.rfmSegment ?? null) as RfmSegment | null,
    crossSell: (signal.crossSell ?? []) as SignalsSnapshot['crossSell'],
  }
}
