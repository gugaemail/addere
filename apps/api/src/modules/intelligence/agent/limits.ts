// Limites de custo do agente: teto diário de tokens por vendedor e orçamento
// mensal da empresa. Os dois só valem para quem vai ao modelo — o cache não
// custa nada, e o eval é teste da Addere (mas o custo dele entra no mês).
import { prisma } from '@addere/db'
import type { LlmBudgetDto } from '@addere/types'
import { env } from '../../../lib/env'
import { captureError } from '../../../lib/sentry'
import { sendLlmBudgetAlert, type BudgetAlertLevel } from '../../billing/llm-budget-alert'
import { budgetDto, budgetUsedPct, companyMonthUsage } from '../../billing/llm-usage.service'

const SP_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Meia-noite de hoje em São Paulo — o teto do vendedor zera aí, não às 21h (UTC) */
export function spDayStart(now: Date): Date {
  return new Date(`${SP_DAY.format(now)}T00:00:00-03:00`)
}

/** Modelo e orçamento da empresa: o que a geração precisa saber antes de ir ao modelo */
export interface CompanyLlmSettings {
  model: string
  budget: LlmBudgetDto
}

export async function companyLlmSettings(companyId: string): Promise<CompanyLlmSettings> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { llmModel: true, llmMonthlyTokenBudget: true, llmMonthlyBudgetBrl: true },
  })
  return {
    model: company?.llmModel ?? env.INTEL_LLM_MODEL,
    budget: company ? budgetDto(company) : { tokens: null, brl: null },
  }
}

/**
 * Tokens cobráveis do vendedor hoje. Soma o registro de chamadas, não o cache:
 * o cache só guardava a geração aprovada (tentativa reprovada gastava e não
 * contava). input_tokens da API exclui o que passou pelo cache de prompt; a
 * gravação (cache_creation, 1,25×) conta no teto e a leitura (0,1×) fica de
 * fora de propósito — é o desconto que o cache dá.
 */
export async function vendorTokensToday(
  companyId: string,
  vendorCode: string,
  now: Date = new Date()
): Promise<number> {
  const sum = await prisma.intelLlmCall.aggregate({
    where: { companyId, vendorCode, createdAt: { gte: spDayStart(now) } },
    _sum: { inputTokens: true, outputTokens: true, cacheCreationTokens: true },
  })
  return (
    (sum._sum.inputTokens ?? 0) + (sum._sum.outputTokens ?? 0) + (sum._sum.cacheCreationTokens ?? 0)
  )
}

/**
 * Teto diário do vendedor (cadastro do usuário, padrão 100 mil). Geração sem
 * vendedor — as perdas da equipe toda ('*') — fica com o teto do ambiente.
 */
export async function vendorDailyCap(companyId: string, vendorCode: string): Promise<number> {
  const user = await prisma.user.findFirst({
    where: { companyId, idVendProt: vendorCode },
    select: { llmDailyTokenCap: true },
  })
  return user?.llmDailyTokenCap ?? env.INTEL_LLM_DAILY_TOKEN_CAP
}

// O % do orçamento é recalculado no máximo a cada minuto por empresa: soma o
// mês inteiro e consulta a PTAX, caro demais para cada geração
const BUDGET_TTL_MS = 60_000
const budgetCache = new Map<string, { at: number; pct: number | null }>()
// Aviso já tratado neste processo (o dedupeKey no banco garante o "uma vez só")
const alerted = new Set<string>()

/** Limpa o estado em memória — só para testes */
export function resetLimitsState(): void {
  budgetCache.clear()
  alerted.clear()
}

/**
 * % usado do orçamento do mês; null sem orçamento. Aos 80 % e aos 100 % avisa
 * a Addere (uma vez por nível e por mês), sem segurar a geração.
 */
export async function monthlyBudgetPct(
  companyId: string,
  budget: LlmBudgetDto,
  now: Date = new Date()
): Promise<number | null> {
  if (budget.tokens === null && budget.brl === null) return null
  const key = `${companyId}|${budget.tokens}|${budget.brl}`
  const cached = budgetCache.get(key)
  if (cached && now.getTime() - cached.at < BUDGET_TTL_MS) return cached.pct

  const usage = await companyMonthUsage(companyId, now)
  const pct = budgetUsedPct(usage, budget)
  budgetCache.set(key, { at: now.getTime(), pct })

  const level: BudgetAlertLevel | null =
    pct === null ? null : pct >= 100 ? 100 : pct >= 80 ? 80 : null
  const alertKey = `${companyId}|${usage.month}|${level}`
  if (level !== null && pct !== null && !alerted.has(alertKey)) {
    alerted.add(alertKey)
    void sendLlmBudgetAlert({
      companyId,
      month: usage.month,
      level,
      pct,
      tokens: usage.tokens,
      costBrl: usage.costBrl,
      budgetTokens: budget.tokens,
      budgetBrl: budget.brl,
    })
      .then((outcome) => {
        // Resend recusou: a reserva foi desfeita, então o próximo cálculo tenta de novo
        if (outcome === 'failed') alerted.delete(alertKey)
      })
      .catch((err: unknown) => {
        alerted.delete(alertKey)
        captureError(err, { module: 'intel-agent', step: 'budget-alert', level })
      })
  }
  return pct
}
