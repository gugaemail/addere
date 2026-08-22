// Disparo de job com lock por tenant em IntelJobRun (E3; estendido na E4 com
// handler explícito p/ backfill, lock configurável, progresso e Sentry).
// O lock (lockedUntil) impede execução concorrente do mesmo job na mesma
// empresa — inclusive entre instâncias, por viver no banco.
import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'
import type { IntelJob } from '@addere/types'
import { captureError } from '../../../lib/sentry'
import { getJobHandler, type IntelJobHandler } from './registry'

const DEFAULT_LOCK_MINUTES = 15

export interface StartJobOptions {
  /** Handler explícito (ex.: backfill) — sem ele, usa o registry */
  handler?: IntelJobHandler
  /** Duração do lock em minutos (backfill usa um valor folgado) */
  lockMinutes?: number
  /** Metadata inicial gravado na criação do run */
  metadata?: Record<string, unknown>
}

export interface StartJobResult {
  started: boolean
  runId: string
  /** Presente quando started=false: execução que segura o lock */
  activeRunId?: string
}

export async function startJobRun(
  companyId: string,
  job: IntelJob,
  opts: StartJobOptions = {}
): Promise<StartJobResult> {
  const now = new Date()

  const active = await prisma.intelJobRun.findFirst({
    where: { companyId, job, status: 'RUNNING', lockedUntil: { gt: now } },
    select: { id: true },
  })
  if (active) return { started: false, runId: active.id, activeRunId: active.id }

  const lockMinutes = opts.lockMinutes ?? DEFAULT_LOCK_MINUTES
  const run = await prisma.intelJobRun.create({
    data: {
      companyId,
      job,
      status: 'RUNNING',
      lockedUntil: new Date(now.getTime() + lockMinutes * 60_000),
      metadata: (opts.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    select: { id: true },
  })

  // Execução em background — a rota responde 202 imediatamente
  void executeJob(companyId, job, run.id, opts.handler)

  return { started: true, runId: run.id }
}

/** Renova o lock durante execuções longas (backfill janela a janela). */
export async function extendLock(runId: string, minutes: number): Promise<void> {
  await prisma.intelJobRun.update({
    where: { id: runId },
    data: { lockedUntil: new Date(Date.now() + minutes * 60_000) },
  })
}

/** Grava progresso/resultado parcial no metadata do run (tela Consultas/Saúde). */
export async function updateRunMetadata(
  runId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await prisma.intelJobRun.update({
    where: { id: runId },
    data: { metadata: metadata as Prisma.InputJsonValue },
  })
}

async function executeJob(
  companyId: string,
  job: IntelJob,
  runId: string,
  explicitHandler?: IntelJobHandler
): Promise<void> {
  const handler = explicitHandler ?? getJobHandler(job)
  try {
    if (!handler) {
      await finishRun(runId, 'ERROR', 'Job ainda não implementado')
      return
    }
    await handler(companyId, runId)
    await finishRun(runId, 'OK', null)
  } catch (err) {
    captureError(err, { module: 'intel-jobs', job, companyId, runId })
    await finishRun(runId, 'ERROR', (err as Error).message.slice(0, 500)).catch(() => undefined)
  }
}

async function finishRun(runId: string, status: 'OK' | 'ERROR', error: string | null) {
  await prisma.intelJobRun.update({
    where: { id: runId },
    data: { status, error, finishedAt: new Date(), lockedUntil: null },
  })
}
