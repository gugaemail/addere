// Cliente bloqueado no Protheus (plano 010): aparece em todo lugar com o selo
// Bloqueado — o mesmo do status BLOCKED do motor (StatusPill) — e só não
// recebe pedido. A regra em si é isCustomerBlocked (@addere/types), a mesma
// que a API usa para recusar o pedido com 422.
import { isCustomerBlocked, type Customer, type CustomerStatus } from '@addere/types'

/** Seletor de cliente do pedido: o bloqueado aparece desabilitado, nunca escondido. */
export function canOrderFor(customer: Pick<Customer, 'msblql'>): boolean {
  return !isCustomerBlocked(customer.msblql)
}

/**
 * Selo Bloqueado vindo do cadastro (msblql) na Ficha. Quando o motor já mostra
 * BLOCKED no status, não repete o selo.
 */
export function showRegistryBlockedBadge(
  msblql: string | null | undefined,
  engineStatus: CustomerStatus | null
): boolean {
  return isCustomerBlocked(msblql) && engineStatus !== 'BLOCKED'
}
