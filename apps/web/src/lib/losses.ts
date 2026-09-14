// Helpers puros de "Onde estou perdendo" (E21) — testados em __tests__/losses.test.ts.
// A tela só formata o que a API decompôs; nada aqui recalcula receita.
import type { LossComponentDto, LossCustomerDto, LossKind, LossesReportDto } from '@addere/types'
import { brl, formatDiffPct, rangeLabel } from './intel-helpers'

export type LossTone = 'success' | 'warning' | 'danger' | 'neutral'

/** Ordem fixa dos componentes na linha da tela: perdas primeiro, ganhos por último. */
export const LOSS_KINDS: LossKind[] = ['STOPPED', 'REDUCED', 'PRODUCT_DROP', 'GAINED']

export const LOSS_KIND_META: Record<
  LossKind,
  { label: string; tone: LossTone; phrase: (count: number) => string }
> = {
  STOPPED: {
    label: 'Pararam de comprar',
    tone: 'danger',
    phrase: (n) => (n === 1 ? '1 cliente parou de comprar' : `${n} clientes pararam de comprar`),
  },
  REDUCED: {
    label: 'Compraram menos',
    tone: 'warning',
    phrase: (n) => (n === 1 ? '1 cliente comprou menos' : `${n} clientes compraram menos`),
  },
  PRODUCT_DROP: {
    label: 'Produtos em queda',
    tone: 'warning',
    phrase: (n) => (n === 1 ? '1 produto em queda' : `${n} produtos em queda`),
  },
  GAINED: {
    label: 'Ganhos',
    tone: 'success',
    phrase: (n) =>
      n === 1 ? '1 cliente ganho ou recuperado' : `${n} clientes ganhos ou recuperados`,
  },
}

export const BASELINE_OPTIONS = [3, 6] as const
export type BaselineMonths = (typeof BASELINE_OPTIONS)[number]

/** Número de uma string Decimal da API; vazio/inválido vira 0. */
export function toAmount(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

/** R$ com sinal explícito ('+R$ 1.234,50' / '-R$ 1.234,50'); zero sem sinal. */
export function signedBrl(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return brl(0)
  return `${n < 0 ? '-' : '+'}${brl(Math.abs(n))}`
}

/** Tom do KPI pela direção: perda em vermelho, ganho em verde, empate neutro. */
export function diffTone(value: string | number | null | undefined): LossTone {
  const n = toAmount(value)
  if (n < 0) return 'danger'
  if (n > 0) return 'success'
  return 'neutral'
}

/** Os 4 componentes na ordem fixa; os que a API não mandou entram zerados. */
export function componentsByKind(components: LossComponentDto[]): LossComponentDto[] {
  return LOSS_KINDS.map(
    (kind) => components.find((c) => c.kind === kind) ?? { kind, amount: '0', count: 0 }
  )
}

/**
 * Frase determinística para quando o agente não escreveu (text = null): só o
 * que está nos totais e nos componentes — nenhuma conclusão que o motor não
 * sustenta.
 */
export function lossesSummaryText(
  report: Pick<LossesReportDto, 'period' | 'totals' | 'components'>,
  scopeLabel = 'Equipe inteira'
): string {
  const { totals, period } = report
  const base = toAmount(totals.baselineAmount)
  const current = toAmount(totals.currentAmount)
  const diff = toAmount(totals.diffAmount)
  const when = rangeLabel(period)
  const months = period.baselineMonths
  const baseLabel = `base de ${months} ${months === 1 ? 'mês' : 'meses'}`

  if (base === 0) {
    return `${scopeLabel}, ${when}: receita de ${brl(current)}, sem base comparável nos ${months} meses anteriores.`
  }

  let head: string
  if (diff === 0) {
    head = `${scopeLabel}, ${when}: receita de ${brl(current)}, igual à ${baseLabel} (${brl(base)}).`
  } else {
    const direction = diff < 0 ? 'abaixo' : 'acima'
    head = `${scopeLabel}, ${when}: receita de ${brl(current)}, ${signedBrl(diff)} (${formatDiffPct(totals.diffPct)}) ${direction} da ${baseLabel} (${brl(base)}).`
  }

  const parts = componentsByKind(report.components)
    .filter((c) => c.count > 0 || toAmount(c.amount) !== 0)
    .map((c) => `${LOSS_KIND_META[c.kind].phrase(c.count)} (${signedBrl(c.amount)})`)

  return parts.length > 0 ? `${head} ${parts.join('; ')}.` : head
}

export const LOSS_PLAN_REASON_PREFIX = 'Onde estou perdendo: '

export interface PlanItemFromLoss {
  vendorCode: string
  customerCode: string
  loja: string
  shortReason: string
}

/**
 * Corpo do POST /intel/manager/plan-items para o botão "Pôr no plano".
 * Sem vendedor não há plano onde pôr — devolve null e a tela desabilita.
 */
export function planItemFromLoss(
  customer: Pick<LossCustomerDto, 'vendorCode' | 'customerCode' | 'loja' | 'reason'>
): PlanItemFromLoss | null {
  if (!customer.vendorCode) return null
  return {
    vendorCode: customer.vendorCode,
    customerCode: customer.customerCode,
    loja: customer.loja,
    shortReason: `${LOSS_PLAN_REASON_PREFIX}${customer.reason}`.slice(0, 120),
  }
}

/** Chave estável de um cliente (código + loja) para marcar linhas na tela. */
export function customerKey(customer: Pick<LossCustomerDto, 'customerCode' | 'loja'>): string {
  return `${customer.customerCode}-${customer.loja}`
}
