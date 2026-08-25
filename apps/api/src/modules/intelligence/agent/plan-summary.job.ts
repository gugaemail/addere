// Job PLAN (E6): gera a frase da home (Hoje) por vendedor após o motor rodar.
// Sem LLM disponível, os planos ficam com llmSummary=null (fallback só-motor).
import { prisma } from '@addere/db'
import { unprocessable } from '../../../lib/errors'
import { ymdSaoPaulo } from '../engine/business-days'
import { registerJobHandler } from '../jobs/registry'
import { generateWithGuardrails } from './agent.service'
import { llmAvailable } from './client'
import { buildTenantContext, systemBlocks } from './tenant-context'
import { buildTodayPrompt, TODAY_SCHEMA, type TodayOutput } from './prompts/today'
import { Pseudonymizer } from './pseudonymizer'
import type { TodayFacts } from './facts'
import type { SelfCheckFacts } from './self-check'

export function registerPlanJob(): void {
  registerJobHandler('PLAN', planSummaryHandler)
}

export async function planSummaryHandler(companyId: string): Promise<unknown> {
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) throw unprocessable('Empresa não encontrada')
  if (!llmAvailable()) return { generated: 0, skipped: 'llm_off' }

  const today = ymdSaoPaulo(new Date())
  const planDate = new Date(
    Date.UTC(Number(today.slice(0, 4)), Number(today.slice(4, 6)) - 1, Number(today.slice(6, 8)))
  )
  const plans = await prisma.visitPlan.findMany({
    where: { companyId, date: planDate, kind: 'DAY' },
    include: { items: { where: { removedAt: null }, orderBy: { position: 'asc' } } },
  })

  const lastSync = await prisma.intelJobRun.findFirst({
    where: { companyId, job: { in: ['NIGHTLY', 'SYNC', 'REFRESH'] }, status: 'OK' },
    orderBy: { startedAt: 'desc' },
    select: { finishedAt: true },
  })
  const lastSyncAt = lastSync?.finishedAt
    ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      }).format(lastSync.finishedAt)
    : null

  const tenantContext = await buildTenantContext(company)
  const system = systemBlocks(tenantContext)

  let generated = 0
  let fallback = 0
  for (const plan of plans) {
    const pseudonymizer = new Pseudonymizer()
    const customerKeys = plan.items.map((i) => `${i.customerCode}|${i.loja}`)
    const names = await prisma.customer.findMany({
      where: { companyId, protheusCode: { in: plan.items.map((i) => i.customerCode) } },
      select: { protheusCode: true, loja: true, name: true },
    })
    const nameByKey = new Map(names.map((c) => [`${c.protheusCode}|${c.loja ?? '01'}`, c.name]))

    const facts: TodayFacts = {
      date: today,
      grouping: plan.grouping,
      goal:
        plan.goalGap === null
          ? null
          : {
              goalAmount: null,
              soldAmount: null,
              gap: Number(plan.goalGap).toFixed(2),
              perBusinessDay: null,
              lateCoverage: null,
            },
      plan: plan.items.map((item) => ({
        position: item.position,
        pseudonym: pseudonymizer.code(`${item.customerCode}|${item.loja}`),
        status: item.statusAtTime,
        shortReason: item.shortReason,
        expectedAmount: item.expectedAmount === null ? null : Number(item.expectedAmount).toFixed(2),
      })),
      freshness: { lastSyncAt },
    }

    const selfCheckFacts: SelfCheckFacts = {
      customers: facts.plan.map((p) => ({ pseudonym: p.pseudonym, status: p.status })),
      numbers: [
        ...facts.plan.flatMap((p) => [
          p.position,
          ...(p.expectedAmount === null ? [] : [Number(p.expectedAmount)]),
        ]),
        ...(facts.goal?.gap ? [Number(facts.goal.gap)] : []),
      ],
      freshnessLine: null, // a home mostra o frescor em pill própria (E13)
    }

    const result = await generateWithGuardrails<TodayOutput>({
      companyId,
      kind: 'today',
      vendorCode: plan.vendorCode,
      targetKey: today,
      system,
      userPrompt: buildTodayPrompt(facts),
      schema: TODAY_SCHEMA as unknown as Record<string, unknown>,
      factsPayload: facts,
      selfCheckFacts,
      extractText: (data) => `${data.homeLine}\n${data.planText}`,
    })

    if (result.data) {
      await prisma.visitPlan.update({
        where: { id: plan.id },
        data: { llmSummary: pseudonymizer.rehydrate(result.data.homeLine, nameByKey) },
      })
      generated++
      void customerKeys
    } else {
      fallback++
    }
  }

  return { plans: plans.length, generated, fallback }
}
