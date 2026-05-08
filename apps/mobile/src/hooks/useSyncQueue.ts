import {
  useSyncStore,
  selectPendingCount,
  selectHasPending,
  selectPendingItems,
  selectErrorItems,
} from '../store/syncStore'
import { processSyncQueue } from '../services/syncEngine'
import type { CreateOrderInput } from '@addere/types'

export function useSyncQueue() {
  const queue           = useSyncStore((s) => s.queue)
  const isSyncing       = useSyncStore((s) => s.isSyncing)
  const lastSyncAt      = useSyncStore((s) => s.lastSyncAt)
  const networkAvailable = useSyncStore((s) => s.networkAvailable)
  const pendingCount    = useSyncStore(selectPendingCount)
  const hasPending      = useSyncStore(selectHasPending)
  const pendingItems    = useSyncStore(selectPendingItems)
  const errorItems      = useSyncStore(selectErrorItems)

  const { enqueue, markError, clearSynced } = useSyncStore.getState()

  function enqueueOrder(payload: CreateOrderInput) {
    return enqueue('order', payload)
  }

  function syncNow() {
    return processSyncQueue()
  }

  function retryItem(id: string) {
    useSyncStore.setState((s) => ({
      queue: s.queue.map((item) =>
        item.id === id
          ? { ...item, status: 'pending', attempts: 0, lastError: null }
          : item,
      ),
    }))
    syncNow()
  }

  function dismissSynced() {
    clearSynced()
  }

  return {
    queue,
    pendingCount,
    hasPending,
    isSyncing,
    lastSyncAt,
    networkAvailable,
    pendingItems,
    errorItems,
    enqueueOrder,
    syncNow,
    retryItem,
    dismissSynced,
  }
}
