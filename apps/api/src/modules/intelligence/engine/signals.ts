// Sinais por cliente (E5, doc §4.1) — puro, determinístico, testável com fixtures.
import type { CustomerStatus, SignalConfidence } from '@addere/types'
import type { EngineParameters } from './parameters'
import { diffDays } from './business-days'
import { computeDegradedSignal } from './degraded'

// ─── Entradas (independentes do Prisma — fixtures nos golden tests) ───

export interface SaleRecord {
  orderRef: string
  date: string // YYYYMMDD
  productCode: string
  productDesc: string | null
  amount: number
}

export interface CustomerInput {
  customerCode: string
  loja: string
  msblql: string | null // '1' = bloqueado no cadastro
  creditLimit: number | null
  ultcom: string | null // YYYYMMDD — sustenta o modo degradado (§2.7)
  segment: string | null
  city: string | null
  district: string | null
}

export interface TitleInput {
  balance: number
  daysOverdue: number | null
}

export interface MixProduct {
  productCode: string
  productDesc: string | null
}

export interface CustomerSignalResult {
  status: CustomerStatus
  confidence: SignalConfidence
  cycleDays: number | null
  daysSinceLastPurchase: number | null
  orders12m: number
  avgTicket: number | null
  trendPct: number | null
  purchaseProb: number
  usualMix: MixProduct[]
  cutMix: MixProduct[]
  reasons: string[]
  degraded: boolean
}

export const PURCHASE_PROB: Record<CustomerStatus, number> = {
  ON_CYCLE: 0.8,
  LATE: 0.5,
  AT_RISK: 0.2,
  NEW: 0.3,
  INACTIVE: 0.05,
  BLOCKED: 0,
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

interface DistinctOrder {
  orderRef: string
  date: string
  total: number
  products: Map<string, string | null>
}

/** Agrupa itens por pedido distinto, ordenado por data (a base de tudo). */
export function distinctOrders(sales: SaleRecord[]): DistinctOrder[] {
  const byRef = new Map<string, DistinctOrder>()
  for (const sale of sales) {
    let order = byRef.get(sale.orderRef)
    if (!order) {
      order = { orderRef: sale.orderRef, date: sale.date, total: 0, products: new Map() }
      byRef.set(sale.orderRef, order)
    }
    if (sale.date < order.date) order.date = sale.date
    order.total += sale.amount
    if (!order.products.has(sale.productCode)) order.products.set(sale.productCode, sale.productDesc)
  }
  return [...byRef.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

interface BlockCheck {
  blocked: boolean
  reason: string | null
}

function checkBlocked(
  customer: CustomerInput,
  titles: TitleInput[],
  params: EngineParameters
): BlockCheck {
  if (customer.msblql === '1') return { blocked: true, reason: 'Bloqueado no cadastro (MSBLQL)' }

  const maxOverdue = titles.reduce((max, t) => Math.max(max, t.daysOverdue ?? 0), 0)
  if (maxOverdue > params.blocked_days) {
    return { blocked: true, reason: `Título vencido há ${maxOverdue} dias` }
  }

  const openBalance = titles.reduce((sum, t) => sum + t.balance, 0)
  if (customer.creditLimit !== null && customer.creditLimit > 0 && openBalance > customer.creditLimit) {
    return { blocked: true, reason: 'Limite de crédito estourado' }
  }

  return { blocked: false, reason: null }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Calcula os sinais de um cliente a partir das vendas de 12 meses.
 * BLOCKED sobrepõe qualquer outro status (doc §4.1); sem vendas carregadas,
 * cai no modo degradado via Customer.ultcom (§2.7).
 */
export function computeCustomerSignal(
  customer: CustomerInput,
  sales: SaleRecord[],
  titles: TitleInput[],
  today: string,
  params: EngineParameters
): CustomerSignalResult {
  const block = checkBlocked(customer, titles, params)

  if (sales.length === 0) {
    return computeDegradedSignal(customer, today, params, block.blocked ? block.reason : null)
  }

  const orders = distinctOrders(sales)
  const orders12m = orders.length
  const last = orders[orders.length - 1]
  const daysSince = diffDays(last.date, today)

  // Ciclo: mediana dos intervalos entre pedidos distintos
  const gaps: number[] = []
  for (let i = 1; i < orders.length; i++) gaps.push(diffDays(orders[i - 1].date, orders[i].date))
  const cycleDays = orders12m >= 2 ? median(gaps) : null

  const confidence: SignalConfidence = orders12m >= 8 ? 'HIGH' : orders12m >= 3 ? 'MEDIUM' : 'LOW'

  // Ticket médio 12m e tendência (3m vs 12m)
  const avgTicket = round2(orders.reduce((sum, o) => sum + o.total, 0) / orders12m)
  const threeMonthsAgo = shiftDays(today, -90)
  const recent = orders.filter((o) => o.date >= threeMonthsAgo)
  let trendPct: number | null = null
  if (recent.length > 0 && avgTicket > 0) {
    const recentTicket = recent.reduce((sum, o) => sum + o.total, 0) / recent.length
    trendPct = round2(((recentTicket - avgTicket) / avgTicket) * 100)
  }

  // Mix habitual: produtos em ≥2 dos últimos 3 pedidos; cortado: habitual fora do último
  const last3 = orders.slice(-3)
  const seenIn = new Map<string, { count: number; desc: string | null }>()
  for (const order of last3) {
    for (const [code, desc] of order.products) {
      const entry = seenIn.get(code)
      if (entry) entry.count++
      else seenIn.set(code, { count: 1, desc })
    }
  }
  const usualMix: MixProduct[] = [...seenIn.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([productCode, v]) => ({ productCode, productDesc: v.desc }))
    .sort((a, b) => a.productCode.localeCompare(b.productCode))
  const cutMix = usualMix.filter((p) => !last.products.has(p.productCode))

  // Status — BLOCKED sobrepõe; depois NEW; depois a régua de dias × ciclo
  let status: CustomerStatus
  if (block.blocked) status = 'BLOCKED'
  else if (orders12m < params.cycle_min_orders) status = 'NEW'
  else if (daysSince > params.active_days) status = 'INACTIVE'
  else if (
    (cycleDays !== null && daysSince > params.risk_factor * cycleDays) ||
    daysSince > params.risk_days
  )
    status = 'AT_RISK'
  else if (cycleDays !== null && daysSince > params.late_factor * cycleDays) status = 'LATE'
  else status = 'ON_CYCLE'

  // Motivos em PT — frases prontas para o card (doc §4.1)
  const reasons: string[] = []
  if (block.blocked && block.reason) reasons.push(block.reason)
  if (cycleDays !== null) reasons.push(`Compra a cada ${cycleDays} dias, está no dia ${daysSince}`)
  else reasons.push(`Última compra há ${daysSince} dias`)
  if (status === 'NEW') reasons.push(`Cliente novo — ${orders12m} pedido(s) em 12 meses`)
  if (status === 'INACTIVE') reasons.push(`Sem compra há ${daysSince} dias`)
  if (trendPct !== null && trendPct < -25) reasons.push(`Ticket caiu ${Math.abs(Math.round(trendPct))}% vs 12 meses`)
  for (const cut of cutMix.slice(0, 2)) {
    reasons.push(`Deixou de levar ${cut.productDesc ?? cut.productCode}`)
  }

  return {
    status,
    confidence,
    cycleDays,
    daysSinceLastPurchase: daysSince,
    orders12m,
    avgTicket,
    trendPct,
    purchaseProb: PURCHASE_PROB[status],
    usualMix,
    cutMix,
    reasons,
    degraded: false,
  }
}

/** Soma dias a uma data YYYYMMDD (negativo volta no tempo). */
export function shiftDays(ymd: string, days: number): string {
  const date = new Date(
    Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(4, 6)) - 1, Number(ymd.slice(6, 8)))
  )
  date.setUTCDate(date.getUTCDate() + days)
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
}
