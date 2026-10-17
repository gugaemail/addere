// Painel da Gestão Addere (plano 018) — helpers puros da tela /gestao,
// testados em __tests__/billing-dashboard.test.ts (a página não tem teste de
// render).
//
// Dinheiro chega da API como string com duas casas ("12167.50"), já somado em
// Decimal. Aqui nada é somado de novo: Number() só no mapeamento para o
// gráfico, porque o recharts precisa de número. O texto usa formatBrl.
import { civilDaySaoPaulo, type BillingDashboardDto, type RevenueMonth } from '@addere/types'

const MONTHS_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const

const MONTHS_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const

function parseMonth(month: string): { year: string; index: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(month)
  const index = m ? Number(m[2]) - 1 : -1
  if (!m || index < 0 || index > 11) throw new RangeError(`mês inválido: ${month}`)
  return { year: m[1], index }
}

/** '2026-10' → 'out/26' (eixo do gráfico) */
export function monthLabel(month: string): string {
  const { year, index } = parseMonth(month)
  return `${MONTHS_SHORT[index]}/${year.slice(2)}`
}

/** '2026-10' → 'outubro de 2026' (tooltip e tabela) */
export function monthLongLabel(month: string): string {
  const { year, index } = parseMonth(month)
  return `${MONTHS_LONG[index]} de ${year}`
}

let compactFormatter: Intl.NumberFormat | null = null

/** 12500 → 'R$ 12,5 mil' (eixo Y). O Intl põe espaço inseparável depois do R$. */
export function brlCompact(value: number): string {
  compactFormatter ??= new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  })
  return compactFormatter.format(value)
}

export interface RevenueChartPoint {
  month: string
  label: string
  billed: number
  received: number
}

/** Os 12 meses no formato do recharts. Só exibição: nada é somado aqui. */
export function revenueChartData(revenue12m: RevenueMonth[]): RevenueChartPoint[] {
  return revenue12m.map((m) => ({
    month: m.month,
    label: monthLabel(m.month),
    billed: Number(m.billed),
    received: Number(m.received),
  }))
}

/** Algum mês com faturado ou recebido diferente de zero? */
export function hasRevenue(revenue12m: RevenueMonth[]): boolean {
  return revenue12m.some((m) => Number(m.billed) !== 0 || Number(m.received) !== 0)
}

/** Ocupação em percentual inteiro, arredondado para baixo; null sem limite. */
export function seatsPct(seats: { used: number; limit: number }): number | null {
  if (seats.limit === 0) return null
  return Math.floor((seats.used * 100) / seats.limit)
}

/**
 * O estado "nenhum contrato ativo ainda": sem contrato ACTIVE, sem fatura em
 * aberto e sem receita nos 12 meses. Os KPIs de dinheiro e o gráfico somem;
 * a situação e as pendências continuam.
 */
export function isEmptyDashboard(dto: BillingDashboardDto): boolean {
  return (
    dto.mrr.activeContracts === 0 && dto.receivable.open.count === 0 && !hasRevenue(dto.revenue12m)
  )
}

const DAY_MS = 86_400_000

/**
 * Dias civis em São Paulo entre um instante (ISO) e hoje ('YYYY-MM-DD', o
 * `today` do DTO). Nunca negativo.
 */
export function daysSince(iso: string, today: string): number {
  const from = civilDaySaoPaulo(new Date(iso)).getTime()
  const to = new Date(`${today}T00:00:00Z`).getTime()
  return Math.max(0, Math.round((to - from) / DAY_MS))
}

/** 0 → 'hoje'; 1 → 'há 1 dia'; 4 → 'há 4 dias' */
export function agoLabel(days: number): string {
  if (days <= 0) return 'hoje'
  return days === 1 ? 'há 1 dia' : `há ${days} dias`
}

/** Dias até o vencimento ('YYYY-MM-DD'): 0 → 'hoje'; 1 → 'amanhã'; 5 → 'em 5 dias' */
export function dueInLabel(dueDate: string, today: string): string {
  const days = Math.round(
    (new Date(`${dueDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / DAY_MS
  )
  if (days <= 0) return 'hoje'
  return days === 1 ? 'amanhã' : `em ${days} dias`
}

/** 1 → '1 dia'; 10 → '10 dias' */
export function daysLabel(days: number): string {
  return days === 1 ? '1 dia' : `${days} dias`
}
