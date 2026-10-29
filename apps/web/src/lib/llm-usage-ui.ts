import {
  LLM_MODEL_OPTIONS,
  type LlmCost,
  type LlmEvalResult,
  type LlmUsageRow,
  type UsdBrlRateDto,
} from '@addere/types'
import { agentKindLabel } from './intel-helpers'
import { formatCurrency } from './utils'

// Custo de IA na Gestão Addere: formatação e faixas do orçamento. Puro — a
// tela e os testes usam as mesmas regras.

/** A partir daqui o orçamento fica em alerta (âmbar); 100% = estourado (vermelho) */
export const BUDGET_WARNING_PCT = 80

export type BudgetStatus = 'ok' | 'warning' | 'over'

export function budgetStatus(pct: number | null): BudgetStatus | null {
  if (pct === null) return null
  if (pct >= 100) return 'over'
  if (pct >= BUDGET_WARNING_PCT) return 'warning'
  return 'ok'
}

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  ok: 'Dentro do orçamento',
  warning: 'Perto do limite',
  over: 'Orçamento estourado',
}

let usdFormatter: Intl.NumberFormat | undefined

export function formatUsd(value: number): string {
  usdFormatter ??= new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return usdFormatter.format(value)
}

/** Em R$ quando há câmbio; sem câmbio, em US$ */
export function formatCost(cost: Pick<LlmCost, 'costBrl' | 'costUsd'>): string {
  return cost.costBrl === null ? formatUsd(cost.costUsd) : formatCurrency(cost.costBrl)
}

/** 980 → "980"; 12.400 → "12,4 mil"; 1.550.000 → "1,55 mi" */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  if (tokens < 1_000_000) {
    return `${(tokens / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  }
  return `${(tokens / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
}

export function formatPct(pct: number): string {
  return `${pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/** "PTAX de 29/10/2026: R$ 5,3744" */
export function rateLabel(rate: UsdBrlRateDto): string {
  if (rate.rate === null) return 'Sem cotação do dólar — valores em US$'
  const value = rate.rate.toLocaleString('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })
  const day = rate.quotedAt
    ? new Date(rate.quotedAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : null
  return day ? `PTAX de ${day}: R$ ${value}` : `PTAX: R$ ${value}`
}

/** Vendedor pelo nome; o eval e a visão da equipe têm nome próprio */
export function vendorLabel(row: Pick<LlmUsageRow, 'key' | 'label'>): string {
  if (row.label) return row.label
  if (row.key === 'eval') return 'Testes de regressão (eval)'
  if (row.key === '*') return 'Equipe toda (gerente)'
  return `Vendedor ${row.key}`
}

export function kindLabel(row: Pick<LlmUsageRow, 'key'>): string {
  return agentKindLabel(row.key)
}

/** Custo do mês como % da mensalidade do contrato; null sem contrato ou sem câmbio */
export function pctOfMonthlyFee(
  costBrl: number | null,
  monthlyTotal: string | null
): number | null {
  const fee = Number(monthlyTotal)
  if (costBrl === null || !monthlyTotal || !Number.isFinite(fee) || fee <= 0) return null
  return Math.round((costBrl / fee) * 1000) / 10
}

/** Nome curto do modelo ("Haiku 5.5"); fora da lista, o id */
export function modelLabel(model: string): string {
  return LLM_MODEL_OPTIONS.find((option) => option.id === model)?.label ?? model
}

/** Teto diário do vendedor: "100 mil/dia"; 0 = IA desligada; null = padrão */
export function dailyCapLabel(cap: number | null | undefined, defaultCap: number): string {
  if (cap === 0) return 'IA desligada'
  return `${formatTokens(cap ?? defaultCap)}/dia`
}

const FALLBACK_REASONS: Record<string, string> = {
  daily_cap: 'Teto diário do vendedor atingido',
  monthly_budget: 'Orçamento do mês atingido',
  llm_off: 'IA desligada no ambiente',
  facts_leak: 'Dado fora da lista permitida (barrado antes de sair)',
  'resposta truncada': 'Resposta cortada no limite de tamanho',
  'recusa do modelo': 'Recusa do modelo',
  self_check: 'Reprovada no autocheck',
}

/** Motivo do só-motor em português ("self_check: número fora dos fatos: N" → "Reprovada no autocheck: …") */
export function fallbackReasonLabel(reason: string): string {
  if (FALLBACK_REASONS[reason]) return FALLBACK_REASONS[reason]
  if (reason.startsWith('self_check: ')) {
    return `${FALLBACK_REASONS.self_check}: ${reason.slice('self_check: '.length)}`
  }
  return reason
}

/** "92% de primeira · 0 falha em bloqueado · US$ 0,0010 por caso" */
export function evalScoreLine(result: LlmEvalResult): string {
  const ran = result.total - result.skipped
  const first = ran > 0 ? Math.round((result.passedFirst / ran) * 100) : 0
  const perCase = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(result.costPerCaseUsd)
  return [
    `${first}% de primeira (${result.passedFirst} de ${ran})`,
    `${result.blockedFailed} falha(s) em bloqueado`,
    `${perCase} por caso`,
  ].join(' · ')
}

/** "01/10" para o eixo do gráfico diário */
export function dayLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}
