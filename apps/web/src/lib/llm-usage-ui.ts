import type { LlmCost, LlmUsageRow, UsdBrlRateDto } from '@addere/types'
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

/** "01/10" para o eixo do gráfico diário */
export function dayLabel(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}
