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

export function startOrderSession() {
  pilotTracker.startOrderTimer()
}

export async function submitOrder(
  payload: CreateOrderInput,
  meta?: { itemCount: number; totalValue: number },
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
