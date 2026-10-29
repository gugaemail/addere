// Job EVAL (custo de IA): a regressão do agente com um modelo — o da empresa
// ou um candidato mais barato —, disparada pela ficha de custo de IA na Gestão.
// Grava o placar e o custo no metadata do run; a troca de modelo da empresa só
// é aceita com um eval aprovado daquele modelo (billing/llm-model.service).
import { prisma } from '@addere/db'
import { LLM_MODEL_IDS, type LlmEvalResult } from '@addere/types'
import { unprocessable } from '../../../lib/errors'
import { evalCostSince } from '../../billing/llm-usage.service'
import { registerJobHandler } from '../jobs/registry'
import { updateRunMetadata } from '../jobs/run-job'
import { freezeEvalCases, runEval } from './eval.service'

const MAX_FAILURES = 10
const MAX_VIOLATIONS = 4

export function registerEvalJob(): void {
  registerJobHandler('EVAL', evalJobHandler)
}

export async function evalJobHandler(
  companyId: string,
  runId: string
): Promise<{ model: string; result: LlmEvalResult }> {
  const run = await prisma.intelJobRun.findUnique({
    where: { id: runId },
    select: { metadata: true, startedAt: true },
  })
  const model = (run?.metadata as { model?: unknown } | null)?.model
  if (!run || typeof model !== 'string' || !(LLM_MODEL_IDS as readonly string[]).includes(model)) {
    throw unprocessable('Modelo do eval inválido')
  }
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) throw unprocessable('Empresa não encontrada')

  // Primeiro teste da empresa: congela os casos a partir dos sinais atuais
  if ((await prisma.evalCase.count({ where: { companyId } })) === 0) {
    const created = await freezeEvalCases(company)
    if (created === 0) {
      throw unprocessable('Sem sinais de clientes para montar o eval — rode o motor antes')
    }
  }

  const summary = await runEval(company, { model })
  const ran = summary.total - summary.skipped
  const cost = await evalCostSince(companyId, run.startedAt, new Date())
  const result: LlmEvalResult = {
    total: summary.total,
    passed: summary.passed,
    passedFirst: summary.passedFirst,
    passedRetry: summary.passedRetry,
    failed: summary.failed,
    blockedFailed: summary.blockedFailed,
    skipped: summary.skipped,
    approved: summary.approved,
    promptVersion: summary.promptVersion,
    cost,
    costPerCaseUsd: ran > 0 ? Math.round((cost.costUsd / ran) * 1e6) / 1e6 : 0,
    // Só os motivos: o texto reprovado fica no CLI (intel:eval), não no painel
    failures: summary.notFirst.slice(0, MAX_FAILURES).map((item) => ({
      kind: item.kind,
      status: item.status,
      result: item.result,
      violations: item.rejected.flatMap((r) => r.violations).slice(0, MAX_VIOLATIONS),
    })),
  }

  const metadata = { model, result }
  await updateRunMetadata(runId, metadata)
  return metadata
}
