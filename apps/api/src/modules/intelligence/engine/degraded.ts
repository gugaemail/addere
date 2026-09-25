// Modo degradado (E5, plano §2.7): sem SalesItem carregado, os sinais saem de
// Customer.ultcom — sem ciclo/ticket/mix, confiança sempre baixa.
import type { CustomerStatus } from '@addere/types'
import type { EngineParameters } from './parameters'
import { diffDays } from './business-days'
import type { CustomerInput, CustomerSignalResult } from './signals'
import { PURCHASE_PROB } from './signals'

export function computeDegradedSignal(
  customer: CustomerInput,
  today: string,
  params: EngineParameters,
  blockedReason: string | null
): CustomerSignalResult {
  const daysSince =
    customer.ultcom && /^\d{8}$/.test(customer.ultcom) ? diffDays(customer.ultcom, today) : null

  let status: CustomerStatus
  if (blockedReason) status = 'BLOCKED'
  else if (daysSince === null) status = 'NEW'
  else if (daysSince > params.active_days) status = 'INACTIVE'
  else if (daysSince > params.risk_days) status = 'AT_RISK'
  else status = 'ON_CYCLE' // sem ciclo não dá para separar LATE de ON_CYCLE

  const reasons: string[] = []
  if (blockedReason) reasons.push(blockedReason)
  reasons.push(
    daysSince === null
      ? 'Sem histórico de compra no cadastro'
      : `Última compra há ${daysSince} dias (cadastro)`
  )
  reasons.push('Sinais limitados — histórico de vendas ainda não carregado')

  return {
    status,
    confidence: 'LOW',
    cycleDays: null,
    daysSinceLastPurchase: daysSince,
    orders12m: 0,
    avgTicket: null,
    trendPct: null,
    purchaseProb: PURCHASE_PROB[status],
    usualMix: [],
    cutMix: [],
    reasons,
    degraded: true,
  }
}
