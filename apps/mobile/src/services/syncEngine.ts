import { AppState, AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { api } from '../lib/api'
import { queryClient } from '../lib/query-client'
import { useSyncStore } from '../store/syncStore'
import type { SyncQueueItem } from '../types/sync'
import type { CreateOrderInput } from '@addere/types'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function getSyncDelay(attempts: number): number {
  if (attempts === 0) return 0
  if (attempts >= 5) return 30_000
  return 1_000 * Math.pow(2, attempts - 1)
}

async function processItem(item: SyncQueueItem): Promise<void> {
  const { markSyncing, markSynced, markError } = useSyncStore.getState()

  markSyncing(item.id)

  try {
    if (item.type === 'order') {
      await api.post('/orders', item.payload as CreateOrderInput)
    }
    markSynced(item.id)
    queryClient.invalidateQueries({ queryKey: ['orders'] })
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
      (err instanceof Error ? err.message : 'Erro desconhecido')
    markError(item.id, msg)
  }
}

export async function processSyncQueue(): Promise<void> {
  const state = useSyncStore.getState()

  if (!state.networkAvailable) return
  if (state.isSyncing) return

  const items = state.queue.filter(
    (item) =>
      item.status === 'pending' ||
      (item.status === 'error' && item.attempts < item.maxAttempts),
  )

  if (items.length === 0) return

  state.setIsSyncing(true)

  try {
    for (const item of items) {
      const delay = getSyncDelay(item.attempts)
      if (delay > 0) await sleep(delay)
      await processItem(item)
    }
  } finally {
    useSyncStore.getState().setIsSyncing(false)
    useSyncStore.getState().setLastSyncAt(new Date().toISOString())
  }
}

export function startSyncListener(): () => void {
  let intervalId: ReturnType<typeof setInterval> | null = null

  const handleAppStateChange = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      processSyncQueue()
    }
  }

  const appStateSubscription = AppState.addEventListener('change', handleAppStateChange)

  const netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    const available = state.isConnected ?? false
    useSyncStore.getState().setNetworkAvailable(available)
    if (available) {
      processSyncQueue()
    }
  })

  intervalId = setInterval(() => {
    const { networkAvailable } = useSyncStore.getState()
    if (networkAvailable) {
      processSyncQueue()
    }
  }, 30_000)

  return () => {
    appStateSubscription.remove()
    netInfoUnsubscribe()
    if (intervalId) clearInterval(intervalId)
  }
}
