import { api } from '../lib/api'
import { useSyncStore } from '../store/syncStore'
import { queryClient } from '../lib/query-client'
import { pilotTracker } from '../services/pilotTracking'
import type { CreateOrderInput, Order } from '@addere/types'

export interface SubmitOrderResult {
  queued: boolean
  synced: boolean
  data?: Order
}

/**
 * O pedido vale como check-in (plano 006) só para quem tem o plano do dia: a
 * visita implícita vai para /intel/app/visits, que exige a Inteligência ligada
 * e código de vendedor. Sem os dois a API recusa (403/422), e cada pedido
 * deixava na fila um envio com erro "requer ação manual".
 */
export function logsImplicitVisit(input: {
  intelEnabled: boolean
  hasVendorCode: boolean
  protheusCode?: string | null
  loja?: string | null
}): boolean {
  return input.intelEnabled && input.hasVendorCode && !!input.protheusCode && !!input.loja
}

// Chamado quando o wizard de novo pedido ganha foco: inicia o timer de
// duração e registra o evento ORDER_STARTED no tracking do piloto
export function startOrderSession() {
  pilotTracker.startOrderTimer()
  pilotTracker.track({ type: 'ORDER_STARTED' })
}

export async function submitOrder(
  payload: CreateOrderInput,
  meta?: { itemCount: number; totalValue: number }
): Promise<SubmitOrderResult> {
  const { networkAvailable, enqueue } = useSyncStore.getState()

  if (!networkAvailable) {
    enqueue('order', payload)
    pilotTracker.track({
      type: 'ORDER_COMPLETED',
      metadata: {
        durationMs: pilotTracker.getOrderDuration(),
        itemCount: meta?.itemCount ?? 0,
        totalValue: meta?.totalValue ?? 0,
        wasOffline: true,
      },
    })
    return { queued: true, synced: false }
  }

  try {
    const { data } = await api.post<Order>('/orders', payload)
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    pilotTracker.track({
      type: 'ORDER_COMPLETED',
      metadata: {
        durationMs: pilotTracker.getOrderDuration(),
        itemCount: meta?.itemCount ?? 0,
        totalValue: meta?.totalValue ?? 0,
        wasOffline: false,
      },
    })
    return { queued: false, synced: true, data }
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status !== undefined && status >= 400 && status < 500) {
      throw err
    }
    enqueue('order', payload)
    pilotTracker.track({
      type: 'ORDER_COMPLETED',
      metadata: {
        durationMs: pilotTracker.getOrderDuration(),
        itemCount: meta?.itemCount ?? 0,
        totalValue: meta?.totalValue ?? 0,
        wasOffline: true,
      },
    })
    return { queued: true, synced: false }
  }
}
