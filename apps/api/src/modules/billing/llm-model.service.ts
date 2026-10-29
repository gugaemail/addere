import { prisma } from '@addere/db'
import type { LlmEvalResult, LlmEvalRunDto, LlmModelId, LlmUsageDetailDto } from '@addere/types'
import { env } from '../../lib/env'
import { conflict, notFound, unprocessable } from '../../lib/errors'
import { llmAvailable } from '../intelligence/agent/client'
import { startJobRun } from '../intelligence/jobs/run-job'
import { recordBillingEvent } from './billing-events'

// Modelo do agente por empresa (custo de IA). O teste é o eval de regressão
// rodando como job (intelligence/eval/eval.job.ts); a troca só é aceita com o
// eval mais recente daquele modelo aprovado, e voltar ao padrão é sempre livre.

const EVAL_LOCK_MINUTES = 30 // ~26 casos, até 2 idas ao modelo cada
const EVAL_RUNS_SHOWN = 6
const APPROVAL_VALID_DAYS = 30

type ModelState = LlmUsageDetailDto['model']

export function modelState(llmModel: string | null): ModelState {
  return {
    current: llmModel ?? env.INTEL_LLM_MODEL,
    default: env.INTEL_LLM_MODEL,
    custom: Boolean(llmModel),
  }
}

function evalRunDto(
  run: {
    id: string
    status: 'RUNNING' | 'OK' | 'ERROR'
    startedAt: Date
    finishedAt: Date | null
    error: string | null
    metadata: unknown
    lockedUntil?: Date | null
  },
  now: Date = new Date()
): LlmEvalRunDto {
  const metadata = (run.metadata ?? {}) as { model?: unknown; result?: LlmEvalResult }
  // Rodando com a trava vencida: o processo caiu no meio (deploy, restart).
  // Sem isto a ficha ficaria "rodando" para sempre e o botão, travado
  const interrupted = run.status === 'RUNNING' && !!run.lockedUntil && run.lockedUntil <= now
  return {
    id: run.id,
    status: interrupted ? 'ERROR' : run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    error: interrupted ? 'Teste interrompido (o servidor reiniciou) — rode de novo' : run.error,
    model: typeof metadata.model === 'string' ? metadata.model : '',
    result: metadata.result ?? null,
  }
}

/** Testes de modelo mais recentes da empresa, do mais novo ao mais antigo */
export async function recentEvalRuns(companyId: string): Promise<LlmEvalRunDto[]> {
  const runs = await prisma.intelJobRun.findMany({
    where: { companyId, job: 'EVAL' },
    orderBy: { startedAt: 'desc' },
    take: EVAL_RUNS_SHOWN,
    select: {
      id: true,
      status: true,
      startedAt: true,
      finishedAt: true,
      error: true,
      metadata: true,
      lockedUntil: true,
    },
  })
  return runs.map((run) => evalRunDto(run))
}

export async function startLlmEval(
  companyId: string,
  model: LlmModelId
): Promise<{ runId: string }> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  })
  if (!company) throw notFound('Cliente não encontrado')
  if (!llmAvailable())
    throw unprocessable('A IA está desligada neste ambiente (sem chave da Anthropic)')

  const run = await startJobRun(companyId, 'EVAL', {
    metadata: { model },
    lockMinutes: EVAL_LOCK_MINUTES,
  })
  if (!run.started) throw conflict('Já tem um teste de modelo rodando para este cliente')
  return { runId: run.runId }
}

export async function updateLlmModel(
  companyId: string,
  model: LlmModelId | null,
  actorId: string,
  now: Date = new Date()
): Promise<ModelState> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { llmModel: true },
  })
  if (!company) throw notFound('Cliente não encontrado')

  // Escolher o modelo do ambiente é o mesmo que voltar ao padrão
  const target = model === env.INTEL_LLM_MODEL ? null : model
  if (target === company.llmModel) return modelState(company.llmModel)

  if (target !== null) {
    const since = new Date(now.getTime() - APPROVAL_VALID_DAYS * 86_400_000)
    const runs = await prisma.intelJobRun.findMany({
      where: { companyId, job: 'EVAL', status: 'OK', startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        error: true,
        metadata: true,
      },
    })
    const latest = runs.map((run) => evalRunDto(run)).find((run) => run.model === target)
    if (!latest?.result?.approved) {
      throw unprocessable(
        `Rode o teste com este modelo e tenha o resultado aprovado (nos últimos ${APPROVAL_VALID_DAYS} dias) antes de trocar`
      )
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.company.update({
      where: { id: companyId },
      data: { llmModel: target },
      select: { llmModel: true },
    })
    await recordBillingEvent(tx, {
      type: 'LLM_MODEL_UPDATED',
      companyId,
      actorId,
      fields: ['llmModel'],
    })
    return modelState(updated.llmModel)
  })
}
