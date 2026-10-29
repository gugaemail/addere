import { prisma } from '@addere/db'
import type {
  LlmBudgetDto,
  LlmBudgetInput,
  LlmCost,
  LlmFallbackRow,
  LlmUsageDay,
  LlmUsageDetailDto,
  LlmUsageListDto,
  LlmUsageListItemDto,
  LlmUsageMonth,
  LlmUsageRow,
  UsdBrlRateDto,
} from '@addere/types'
import { env } from '../../lib/env'
import { notFound } from '../../lib/errors'
import { changedFields, recordBillingEvent } from './billing-events'
import { billableTokens, llmCostUsd, modelPrice, type TokenCounts } from './llm-pricing'
import { modelState, recentEvalRuns } from './llm-model.service'
import { getUsdBrlRate } from './usd-brl'

// Custo de IA por empresa (Gestão Addere): soma intel_llm_calls do mês (em São
// Paulo), precifica pelo modelo de cada chamada e converte pela PTAX. Inclui
// tudo o que foi ao modelo — também as tentativas reprovadas no self-check e o
// eval —, porque é o que a Anthropic cobra.

const SP_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const HISTORY_MONTHS = 3 // o PURGE apaga o registro com 90 dias
const EVAL_VENDOR = 'eval' // vendorCode dos casos de regressão (EVAL_VENDOR_CODE do agente)
const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM-DD' em São Paulo */
const spDay = (date: Date) => SP_DAY.format(date)

/** Início do mês 'YYYY-MM' em São Paulo (sem horário de verão desde 2019) */
const monthStart = (month: string) => new Date(`${month}-01T00:00:00-03:00`)

function addMonths(month: string, n: number): string {
  const [year, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, m - 1 + n, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function daysInMonth(month: string): number {
  const [year, m] = month.split('-').map(Number)
  return new Date(Date.UTC(year, m, 0)).getUTCDate()
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits

/** Acumulador de tokens e custo — uma por empresa, tipo, vendedor, dia ou modelo */
class Bucket {
  tokens = 0
  usd = 0
  savingsUsd = 0
  generations = 0

  add(model: string | null, t: TokenCounts) {
    this.generations += 1
    this.tokens += billableTokens(t)
    if (!model) return // só-motor sem ida ao modelo: nada a cobrar
    const { usd, savingsUsd } = llmCostUsd(modelPrice(model).price, t)
    this.usd += usd
    this.savingsUsd += savingsUsd
  }

  cost(rate: UsdBrlRateDto): LlmCost {
    return toCost(this.tokens, this.usd, rate)
  }
}

function toCost(tokens: number, usd: number, rate: UsdBrlRateDto): LlmCost {
  return {
    tokens: Math.round(tokens),
    costUsd: round(usd, 4),
    costBrl: rate.rate === null ? null : round(usd * rate.rate, 2),
  }
}

function getBucket<K>(map: Map<K, Bucket>, key: K): Bucket {
  let bucket = map.get(key)
  if (!bucket) {
    bucket = new Bucket()
    map.set(key, bucket)
  }
  return bucket
}

export function budgetDto(company: {
  llmMonthlyTokenBudget: number | null
  llmMonthlyBudgetBrl: { toString(): string } | null
}): LlmBudgetDto {
  return {
    tokens: company.llmMonthlyTokenBudget,
    brl: company.llmMonthlyBudgetBrl === null ? null : Number(company.llmMonthlyBudgetBrl),
  }
}

function pctOf(used: number | null, budget: number | null): number | null {
  if (used === null || !budget) return null
  return round((used / budget) * 100, 1)
}

const TOKEN_SUM = {
  inputTokens: true,
  outputTokens: true,
  cacheCreationTokens: true,
  cacheReadTokens: true,
} as const

function tokenCounts(sum: Partial<Record<keyof TokenCounts, number | null>>): TokenCounts {
  return {
    inputTokens: sum.inputTokens ?? 0,
    outputTokens: sum.outputTokens ?? 0,
    cacheCreationTokens: sum.cacheCreationTokens ?? 0,
    cacheReadTokens: sum.cacheReadTokens ?? 0,
  }
}

// ─── Consumo do mês de uma empresa (orçamento do agente) ───────────────────

export interface MonthUsage {
  month: string // 'YYYY-MM' em São Paulo
  tokens: number // cobráveis
  costBrl: number | null // null sem câmbio
}

/** O mesmo número que a ficha mostra: tudo o que foi ao modelo no mês, eval incluído */
export async function companyMonthUsage(companyId: string, now: Date): Promise<MonthUsage> {
  const month = spDay(now).slice(0, 7)
  const [rate, groups] = await Promise.all([
    getUsdBrlRate(now),
    prisma.intelLlmCall.groupBy({
      by: ['model'],
      where: { companyId, createdAt: { gte: monthStart(month) } },
      _sum: TOKEN_SUM,
    }),
  ])
  const bucket = new Bucket()
  for (const group of groups) bucket.add(group.model, tokenCounts(group._sum))
  const cost = bucket.cost(rate)
  return { month, tokens: cost.tokens, costBrl: cost.costBrl }
}

/** Custo de um teste de modelo: as chamadas do eval desde o início do run */
export async function evalCostSince(companyId: string, since: Date, now: Date): Promise<LlmCost> {
  const [rate, groups] = await Promise.all([
    getUsdBrlRate(now),
    prisma.intelLlmCall.groupBy({
      by: ['model'],
      where: { companyId, vendorCode: EVAL_VENDOR, createdAt: { gte: since } },
      _sum: TOKEN_SUM,
    }),
  ])
  const bucket = new Bucket()
  for (const group of groups) bucket.add(group.model, tokenCounts(group._sum))
  return bucket.cost(rate)
}

/** O maior % usado entre os dois orçamentos; null sem orçamento */
export function budgetUsedPct(
  usage: { tokens: number; costBrl: number | null },
  budget: LlmBudgetDto
): number | null {
  const pcts = [pctOf(usage.tokens, budget.tokens), pctOf(usage.costBrl, budget.brl)].filter(
    (p): p is number => p !== null
  )
  return pcts.length > 0 ? Math.max(...pcts) : null
}

// ─── Lista de clientes: custo do mês corrente ──────────────────────────────

export async function listLlmUsage(now: Date): Promise<LlmUsageListDto> {
  const month = spDay(now).slice(0, 7)
  const [rate, groups, companies] = await Promise.all([
    getUsdBrlRate(now),
    prisma.intelLlmCall.groupBy({
      by: ['companyId', 'model'],
      where: { createdAt: { gte: monthStart(month) } },
      _sum: TOKEN_SUM,
    }),
    prisma.company.findMany({
      select: { id: true, llmMonthlyTokenBudget: true, llmMonthlyBudgetBrl: true },
    }),
  ])

  const byCompany = new Map<string, Bucket>()
  const total = new Bucket()
  for (const group of groups) {
    const counts = tokenCounts(group._sum)
    getBucket(byCompany, group.companyId).add(group.model, counts)
    total.add(group.model, counts)
  }

  const items: LlmUsageListItemDto[] = []
  for (const company of companies) {
    const budget = budgetDto(company)
    const bucket = byCompany.get(company.id)
    if (!bucket && budget.tokens === null && budget.brl === null) continue
    const cost = (bucket ?? new Bucket()).cost(rate)
    items.push({ companyId: company.id, ...cost, budget, budgetPct: budgetUsedPct(cost, budget) })
  }

  return { month, rate, total: total.cost(rate), companies: items }
}

// ─── Ficha: resumo e estatística do mês ────────────────────────────────────

function rows(
  map: Map<string, Bucket>,
  totalUsd: number,
  rate: UsdBrlRateDto,
  label: (key: string) => string | null
): LlmUsageRow[] {
  return [...map.entries()]
    .map(([key, bucket]) => ({
      key,
      label: label(key),
      generations: bucket.generations,
      ...bucket.cost(rate),
      pct: totalUsd > 0 ? round((bucket.usd / totalUsd) * 100, 1) : 0,
    }))
    .sort((a, b) => b.costUsd - a.costUsd || b.tokens - a.tokens)
}

export async function getLlmUsage(companyId: string, now: Date): Promise<LlmUsageDetailDto> {
  const today = spDay(now)
  const month = today.slice(0, 7)
  const from = monthStart(month)
  const previous = Array.from({ length: HISTORY_MONTHS - 1 }, (_, i) =>
    addMonths(month, i - (HISTORY_MONTHS - 1))
  )

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { llmMonthlyTokenBudget: true, llmMonthlyBudgetBrl: true, llmModel: true },
  })
  if (!company) throw notFound('Cliente não encontrado')

  const [rate, calls, users, evals, ...history] = await Promise.all([
    getUsdBrlRate(now),
    prisma.intelLlmCall.findMany({
      where: { companyId, createdAt: { gte: from } },
      select: {
        kind: true,
        vendorCode: true,
        source: true,
        reason: true,
        attempts: true,
        model: true,
        createdAt: true,
        ...TOKEN_SUM,
      },
    }),
    prisma.user.findMany({
      where: { companyId, idVendProt: { not: null } },
      select: { idVendProt: true, name: true, llmDailyTokenCap: true },
    }),
    recentEvalRuns(companyId),
    ...previous.map((m) =>
      prisma.intelLlmCall.groupBy({
        by: ['model'],
        where: { companyId, createdAt: { gte: monthStart(m), lt: monthStart(addMonths(m, 1)) } },
        _sum: TOKEN_SUM,
      })
    ),
  ])

  const total = new Bucket()
  const byKind = new Map<string, Bucket>()
  const byVendor = new Map<string, Bucket>()
  const byDay = new Map<string, Bucket>()
  const byModel = new Map<string, Bucket>()
  const sources = { llm: 0, cache: 0, engine: 0 }
  const capDays = new Set<string>()
  const vendorCapDays = new Map<string, Set<string>>()
  const fallbacks = new Map<string, LlmFallbackRow>()
  let retried = 0
  const tokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
  let modelCalls = 0

  for (const call of calls) {
    const day = spDay(call.createdAt)
    total.add(call.model, call)
    getBucket(byKind, call.kind).add(call.model, call)
    getBucket(byVendor, call.vendorCode).add(call.model, call)
    getBucket(byDay, day).add(call.model, call)
    if (call.model) getBucket(byModel, call.model).add(call.model, call)
    if (call.source === 'llm' || call.source === 'cache' || call.source === 'engine') {
      sources[call.source] += 1
    }
    if (call.reason === 'daily_cap') {
      capDays.add(day)
      vendorCapDays.set(call.vendorCode, (vendorCapDays.get(call.vendorCode) ?? new Set()).add(day))
    }
    if (call.source === 'engine') {
      const reason = call.reason ?? 'desconhecido'
      const key = `${call.kind}|${reason}`
      const row = fallbacks.get(key) ?? { kind: call.kind, reason, count: 0, attempts: 0 }
      row.count += 1
      row.attempts += call.attempts
      fallbacks.set(key, row)
    } else if (call.source === 'llm' && call.attempts > 1) {
      retried += 1
    }
    tokens.input += call.inputTokens
    tokens.output += call.outputTokens
    tokens.cacheWrite += call.cacheCreationTokens
    tokens.cacheRead += call.cacheReadTokens
    modelCalls += call.attempts
  }

  const names = new Map(users.map((u) => [u.idVendProt ?? '', u.name]))
  const caps = new Map(users.map((u) => [u.idVendProt ?? '', u.llmDailyTokenCap]))
  const daily: LlmUsageDay[] = []
  for (let d = 1; d <= Number(today.slice(8, 10)); d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`
    daily.push({ date, ...(byDay.get(date) ?? new Bucket()).cost(rate) })
  }

  // Ritmo do mês: o consumido até agora estendido até o último dia (mínimo de
  // um dia decorrido, para a madrugada do dia 1 não multiplicar por 30 mil)
  const elapsedDays = Math.max(1, (now.getTime() - from.getTime()) / DAY_MS)
  const factor = daysInMonth(month) / elapsedDays
  const projection = toCost(total.tokens * factor, total.usd * factor, rate)

  const current = total.cost(rate)
  const budget = budgetDto(company)
  const usedPct = budgetUsedPct(current, budget)
  const historyRows: LlmUsageMonth[] = previous.map((m, i) => {
    const bucket = new Bucket()
    for (const group of history[i]) bucket.add(group.model, tokenCounts(group._sum))
    return { month: m, ...bucket.cost(rate) }
  })
  historyRows.push({ month, ...current })

  return {
    companyId,
    month,
    rate,
    totals: {
      ...current,
      generations: calls.length,
      modelCalls,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cacheWriteTokens: tokens.cacheWrite,
      cacheReadTokens: tokens.cacheRead,
      cacheSavingsUsd: round(total.savingsUsd, 4),
      cacheSavingsBrl: rate.rate === null ? null : round(total.savingsUsd * rate.rate, 2),
    },
    sources,
    projection,
    budget: {
      ...budget,
      tokensPct: pctOf(current.tokens, budget.tokens),
      brlPct: pctOf(current.costBrl, budget.brl),
      paused: usedPct !== null && usedPct >= 100,
    },
    defaultDailyCap: env.INTEL_LLM_DAILY_TOKEN_CAP,
    daysAtCap: capDays.size,
    fallbacks: [...fallbacks.values()].sort(
      (a, b) =>
        b.count - a.count || a.kind.localeCompare(b.kind) || a.reason.localeCompare(b.reason)
    ),
    retried,
    model: modelState(company.llmModel),
    evals,
    daily,
    byKind: rows(byKind, total.usd, rate, () => null),
    byVendor: rows(byVendor, total.usd, rate, (code) => names.get(code) ?? null).map((row) => ({
      ...row,
      dailyCap: caps.get(row.key) ?? null,
      daysAtCap: vendorCapDays.get(row.key)?.size ?? 0,
    })),
    byModel: [...byModel.entries()]
      .map(([model, bucket]) => ({ model, priced: modelPrice(model).priced, ...bucket.cost(rate) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    history: historyRows,
  }
}

// ─── Orçamento ─────────────────────────────────────────────────────────────

export async function updateLlmBudget(
  companyId: string,
  input: LlmBudgetInput,
  actorId: string
): Promise<LlmBudgetDto> {
  const before = await prisma.company.findUnique({
    where: { id: companyId },
    select: { llmMonthlyTokenBudget: true, llmMonthlyBudgetBrl: true },
  })
  if (!before) throw notFound('Cliente não encontrado')

  const data = { llmMonthlyTokenBudget: input.tokens, llmMonthlyBudgetBrl: input.brl }
  const fields = changedFields(
    before,
    data,
    ['llmMonthlyTokenBudget', 'llmMonthlyBudgetBrl'],
    ['llmMonthlyBudgetBrl']
  )
  if (fields.length === 0) return budgetDto(before)

  return prisma.$transaction(async (tx) => {
    const updated = await tx.company.update({
      where: { id: companyId },
      data,
      select: { llmMonthlyTokenBudget: true, llmMonthlyBudgetBrl: true },
    })
    await recordBillingEvent(tx, { type: 'LLM_BUDGET_UPDATED', companyId, actorId, fields })
    return budgetDto(updated)
  })
}
