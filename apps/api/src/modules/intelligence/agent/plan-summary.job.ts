// Job PLAN (E6): gera a frase da home (Hoje) por vendedor após o motor rodar.
// Sem LLM disponível, os planos ficam com llmSummary=null (fallback só-motor).
//
// Custo de IA: de madrugada, a frase só sai para quem usou o app no dia útil
// anterior — licença parada não gasta. Quem volta a usar ganha a frase ao
// abrir a home (fillDaySummary). O resumo da semana deixou de ser gerado: o
// app nunca o mostrou, e o motor remonta a semana toda noite.
import { prisma } from '@addere/db'
import type { Company, Prisma } from '@prisma/client'
import { unprocessable } from '../../../lib/errors'
import { captureError } from '../../../lib/sentry'
import { dateToYmdUtc, previousBusinessDay, ymdSaoPaulo, ymdToDate } from '../engine/business-days'
import { resolveParameters } from '../engine/parameters'
import { registerJobHandler } from '../jobs/registry'
import { generateWithGuardrails } from './agent.service'
import { llmAvailable } from './client'
import { spDayStart } from './limits'
import { buildTenantContext, systemBlocks } from './tenant-context'
import { buildTodayPrompt, TODAY_SCHEMA, type TodayOutput } from './prompts/today'
import { Pseudonymizer } from './pseudonymizer'
import type { TodayFacts } from './facts'
import {
  extractNumbers,
  freshnessLine,
  HOME_LINE_MAX_CHARS,
  type SelfCheckFacts,
} from './self-check'

export function registerPlanJob(): void {
  registerJobHandler('PLAN', planSummaryHandler)
}

/** Conta motivos de fallback sem explodir cardinalidade (números viram N). */
function countReason(reasons: Record<string, number>, reason: string | undefined): void {
  const key = (reason ?? 'desconhecido').replace(/\d+(?:[.,]\d+)?/g, 'N').slice(0, 80)
  reasons[key] = (reasons[key] ?? 0) + 1
}

const PLAN_ITEMS = {
  items: { where: { removedAt: null }, orderBy: { position: 'asc' } },
} satisfies Prisma.VisitPlanInclude
type DayPlan = Prisma.VisitPlanGetPayload<{ include: typeof PLAN_ITEMS }>

/** O que toda frase do dia usa: data, contexto do tenant e o frescor do sync */
interface DayContext {
  companyId: string
  today: string // YYYYMMDD em São Paulo
  system: ReturnType<typeof systemBlocks>
  lastSyncAt: string | null
}

async function dayContext(company: Company): Promise<DayContext> {
  const lastSync = await prisma.intelJobRun.findFirst({
    where: { companyId: company.id, job: { in: ['NIGHTLY', 'SYNC', 'REFRESH'] }, status: 'OK' },
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

  return {
    companyId: company.id,
    today: ymdSaoPaulo(new Date()),
    system: systemBlocks(await buildTenantContext(company)),
    lastSyncAt,
  }
}

/** Gera e grava a frase do Hoje de um plano. Devolve o motivo quando não sai. */
async function summarizeDayPlan(
  ctx: DayContext,
  plan: DayPlan
): Promise<{ ok: true } | { ok: false; reason: string | undefined }> {
  const pseudonymizer = new Pseudonymizer()
  const names = await prisma.customer.findMany({
    where: {
      companyId: ctx.companyId,
      protheusCode: { in: plan.items.map((i) => i.customerCode) },
    },
    select: { protheusCode: true, loja: true, name: true },
  })
  const nameByKey = new Map(names.map((c) => [`${c.protheusCode}|${c.loja ?? '01'}`, c.name]))

  const facts: TodayFacts = {
    date: ctx.today,
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
    freshness: { lastSyncAt: ctx.lastSyncAt },
  }

  const expected = facts.plan.flatMap((p) =>
    p.expectedAmount === null ? [] : [Number(p.expectedAmount)]
  )
  const selfCheckFacts: SelfCheckFacts = {
    // Valor previsto e motivo curto são de cada cliente; posição, total de
    // paradas, gap e total previsto são globais. O motivo vai nos fatos ("Compra
    // a cada 30 dias, está no dia 45") e o modelo explica a prioridade com ele.
    // Sem os números dele, "número fora dos fatos" foi o motivo de 6 dos 9
    // só-motor do Hoje na semana (Saúde, 29/10)
    customers: facts.plan.map((p) => ({
      pseudonym: p.pseudonym,
      status: p.status,
      numbers: [
        ...(p.expectedAmount === null ? [] : [Number(p.expectedAmount)]),
        ...extractNumbers(p.shortReason ?? ''),
      ],
    })),
    numbers: [
      facts.plan.length,
      ...facts.plan.map((p) => p.position),
      ...(facts.goal?.gap ? [Number(facts.goal.gap)] : []),
      ...(expected.length > 1 ? [expected.reduce((sum, v) => sum + v, 0)] : []),
    ],
    // O prompt exige a linha; sem informá-la aqui, "03:12" virava número
    // fora dos fatos e todo vendedor caía em só-motor (a home mostra o
    // frescor em pill própria, mas o planText do modelo ainda termina com ela)
    freshnessLine: freshnessLine(ctx.lastSyncAt),
  }

  const result = await generateWithGuardrails<TodayOutput>({
    companyId: ctx.companyId,
    kind: 'today',
    vendorCode: plan.vendorCode,
    targetKey: ctx.today,
    system: ctx.system,
    userPrompt: buildTodayPrompt(facts),
    schema: TODAY_SCHEMA as unknown as Record<string, unknown>,
    factsPayload: facts,
    selfCheckFacts,
    extractText: (data) => `${data.homeLine}\n${data.planText}`,
    validate: (data) =>
      data.homeLine.trim().length > HOME_LINE_MAX_CHARS
        ? [`homeLine com mais de ${HOME_LINE_MAX_CHARS} caracteres`]
        : [],
  })

  const summary = result.data
    ? pseudonymizer.rehydrateStrict(result.data.homeLine, nameByKey)
    : null
  if (!summary) return { ok: false, reason: result.data ? 'pseudônimo sem nome' : result.reason }
  await prisma.visitPlan.update({ where: { id: plan.id }, data: { llmSummary: summary } })
  return { ok: true }
}

/**
 * Vendedores que usaram o app desde o início do dia útil anterior (São Paulo):
 * na segunda, vale quem usou na sexta (ou no sábado, se a empresa trabalha).
 */
export async function activeVendorCodes(companyId: string, today: string): Promise<Set<string>> {
  const overrides = await prisma.intelParameter.findMany({ where: { companyId } })
  const params = resolveParameters(
    overrides.map((row) => ({ key: row.key, value: row.value, segment: row.segment }))
  )
  const since = previousBusinessDay(today, params.saturday_workday)
  const users = await prisma.user.findMany({
    where: {
      companyId,
      idVendProt: { not: null },
      lastAppSeenAt: {
        gte: new Date(
          `${since.slice(0, 4)}-${since.slice(4, 6)}-${since.slice(6, 8)}T00:00:00-03:00`
        ),
      },
    },
    select: { idVendProt: true },
  })
  return new Set(users.map((u) => u.idVendProt as string))
}

export async function planSummaryHandler(companyId: string): Promise<unknown> {
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) throw unprocessable('Empresa não encontrada')
  if (!llmAvailable()) return { generated: 0, skipped: 'llm_off' }

  const ctx = await dayContext(company)
  const [plans, active] = await Promise.all([
    prisma.visitPlan.findMany({
      where: { companyId, date: ymdToDate(ctx.today), kind: 'DAY' },
      include: PLAN_ITEMS,
    }),
    activeVendorCodes(companyId, ctx.today),
  ])

  let generated = 0
  let fallback = 0
  let inactive = 0
  const reasons: Record<string, number> = {} // vai para intel_job_runs.metadata.steps
  for (const plan of plans) {
    if (!active.has(plan.vendorCode)) {
      inactive++
      continue
    }
    const result = await summarizeDayPlan(ctx, plan)
    if (result.ok) {
      generated++
    } else {
      fallback++
      countReason(reasons, result.reason)
    }
  }

  // Nenhuma frase gerada com o LLM ligado = a assinatura dos dois incidentes
  // (Hoje em só-motor desde a v1; zero chamadas de 25 a 30/09), que passaram
  // dias sem ninguém ver. Vai para o Sentry com os motivos. Quem não usou o
  // app ontem não conta: noite sem ninguém ativo não é incidente.
  if (generated === 0 && fallback > 0) {
    captureError(new Error('Job PLAN sem nenhuma frase do agente'), {
      module: 'intel-agent',
      companyId,
      plans: plans.length,
      reasons,
    })
  }

  return { plans: plans.length, generated, fallback, inactive, reasons }
}

// ─── Frase sob demanda: quem não usou o app no dia útil anterior ───────────
// A home dispara e não espera (o modelo leva segundos); a frase aparece na
// próxima leitura da home. Uma tentativa por plano por processo: falhou, fica
// o texto do motor — sem isso, cada abertura da home pagaria de novo.

const ATTEMPT_TTL_MS = 36 * 3_600_000
const attempted = new Map<string, number>()

/** Limpa as tentativas em memória — só para testes */
export function resetFillAttempts(): void {
  attempted.clear()
}

export async function fillDaySummary(companyId: string, planId: string): Promise<void> {
  if (!llmAvailable()) return
  const now = Date.now()
  for (const [id, at] of attempted) if (now - at > ATTEMPT_TTL_MS) attempted.delete(id)
  if (attempted.has(planId)) return
  attempted.set(planId, now)

  try {
    const [company, plan] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId } }),
      prisma.visitPlan.findFirst({
        where: { id: planId, companyId, kind: 'DAY' },
        include: PLAN_ITEMS,
      }),
    ])
    if (!company || !plan || plan.llmSummary) return
    // A madrugada já pagou uma tentativa e ela falhou: não paga outra no mesmo dia
    const failedToday = await prisma.intelLlmCall.count({
      where: {
        companyId,
        kind: 'today',
        vendorCode: plan.vendorCode,
        source: 'engine',
        attempts: { gt: 0 },
        createdAt: { gte: spDayStart(new Date(now)) },
      },
    })
    if (failedToday > 0) return
    const ctx = await dayContext(company)
    if (dateToYmdUtc(plan.date) !== ctx.today) return // plano de outro dia
    await summarizeDayPlan(ctx, plan)
  } catch (err) {
    captureError(err, { module: 'intel-agent', step: 'fill-day-summary' })
  }
}
