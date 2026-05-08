import { api } from '../lib/api'
import { useSyncStore } from '../store/syncStore'
import { queryClient } from '../lib/query-client'
import type { CreateOrderInput, Order } from '@addere/types'

export interface SubmitOrderResult {
  queued: boolean
  synced: boolean
  data?: Order
}

export async function submitOrder(payload: CreateOrderInput): Promise<SubmitOrderResult> {
  const { networkAvailable, enqueue } = useSyncStore.getState()

  if (!networkAvailable) {
    enqueue('order', payload)
    return { queued: true, synced: false }
  }

  try {
    const { data } = await api.post<Order>('/orders', payload)
    queryClient.invalidateQueries({ queryKey: ['orders'] })
    return { queued: false, synced: true, data }
  } catch {
    enqueue('order', payload)
    return { queued: true, synced: false }
  }
}
