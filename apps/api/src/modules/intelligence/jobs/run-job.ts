// Disparo de job com lock por tenant em IntelJobRun (E3).
// O lock (lockedUntil) impede execução concorrente do mesmo job na mesma
// empresa — inclusive entre instâncias, por viver no banco.
import { prisma } from '@addere/db'
import type { IntelJob } from '@addere/types'
import { getJobHandler } from './registry'

const LOCK_MINUTES = 15

export interface StartJobResult {
  started: boolean
  runId: string
  /** Presente quando started=false: execução que segura o lock */
  activeRunId?: string
}

export async function startJobRun(companyId: string, job: IntelJob): Promise<StartJobResult> {
  const now = new Date()

  const active = await prisma.intelJobRun.findFirst({
    where: { companyId, job, status: 'RUNNING', lockedUntil: { gt: now } },
    select: { id: true },
  })
  if (active) return { started: false, runId: active.id, activeRunId: active.id }

  const run = await prisma.intelJobRun.create({
    data: {
      companyId,
      job,
      status: 'RUNNING',
      lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000),
    },
    select: { id: true },
  })

  // Execução em background — a rota responde 202 imediatamente
  void executeJob(companyId, job, run.id)

  return { started: true, runId: run.id }
}

async function executeJob(companyId: string, job: IntelJob, runId: string): Promise<void> {
  const handler = getJobHandler(job)
  try {
    if (!handler) {
      await finishRun(runId, 'ERROR', 'Job ainda não implementado (entrega E4)')
      return
    }
    await handler(companyId, runId)
    await finishRun(runId, 'OK', null)
  } catch (err) {
    await finishRun(runId, 'ERROR', (err as Error).message.slice(0, 500)).catch(() => undefined)
  }
}

async function finishRun(runId: string, status: 'OK' | 'ERROR', error: string | null) {
  await prisma.intelJobRun.update({
    where: { id: runId },
    data: { status, error, finishedAt: new Date(), lockedUntil: null },
  })
}
