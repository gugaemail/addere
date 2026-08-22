// Expurgo de retenção/LGPD (E4, §2.13) — roda dentro do nightly e via job PURGE.
import { prisma } from '@addere/db'
import type { IntelligenceConfig } from '@addere/types'

const GPS_RETENTION_DAYS = 90 // D4: GPS zerado após 90 dias
const DAY_MS = 24 * 60 * 60 * 1000

export interface PurgeResult {
  llmCache: number
  messages: number
  feedbackComments: number
  visitNotes: number
  visitGps: number
}

export async function purgeCompany(
  companyId: string,
  config: IntelligenceConfig,
  now: Date = new Date()
): Promise<PurgeResult> {
  const retentionCutoff = new Date(now.getTime() - config.retentionDays * DAY_MS)
  const gpsCutoff = new Date(now.getTime() - GPS_RETENTION_DAYS * DAY_MS)

  const llmCache = await prisma.intelLlmCache.deleteMany({
    where: { companyId, expiresAt: { lt: now } },
  })
  const messages = await prisma.customerMessage.deleteMany({
    where: { companyId, generatedAt: { lt: retentionCutoff } },
  })
  const feedbackComments = await prisma.intelFeedback.updateMany({
    where: { companyId, createdAt: { lt: retentionCutoff }, comment: { not: null } },
    data: { comment: null },
  })
  const visitNotes = await prisma.visit.updateMany({
    where: { companyId, arrivedAt: { lt: retentionCutoff }, notes: { not: null } },
    data: { notes: null },
  })
  const visitGps = await prisma.visit.updateMany({
    where: { companyId, arrivedAt: { lt: gpsCutoff }, lat: { not: null } },
    data: { lat: null, lng: null, accuracyM: null },
  })

  return {
    llmCache: llmCache.count,
    messages: messages.count,
    feedbackComments: feedbackComments.count,
    visitNotes: visitNotes.count,
    visitGps: visitGps.count,
  }
}
