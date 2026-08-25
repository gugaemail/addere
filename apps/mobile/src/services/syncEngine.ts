import { AppState, AppStateStatus } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import * as Sentry from '@sentry/react-native'
import { getApiErrorMessage } from '../lib/errors'
import { queryClient } from '../lib/query-client'
import { useSyncStore } from '../store/syncStore'
import { pilotTracker } from './pilotTracking'
import { syncHandlers } from './syncHandlers'
import type { SyncQueueItem } from '../types/sync'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function getSyncDelay(attempts: number): number {
  if (attempts === 0) return 0
  if (attempts >= 5) return 30_000
  return 1_000 * Math.pow(2, attempts - 1)
}

async function processItem(item: SyncQueueItem): Promise<void> {
  const { markSyncing, markSynced, markError, markFailedPermanently } = useSyncStore.getState()

  const handler = syncHandlers[item.type]
  markSyncing(item.id)

  try {
    // Tipo desconhecido (downgrade do app?) ou payload malformado nunca vai
    // sincronizar — falha permanente, sem retentativas
    if (!handler || !handler.validate(item.payload)) {
      markFailedPermanently(item.id, 'Payload inválido: estrutura incorreta')
      Sentry.captureMessage('Item da fila de sync com payload inválido', {
        level: 'error',
        extra: { itemId: item.id, type: item.type, createdAt: item.createdAt },
        tags: { module: 'sync_engine' },
      })
      return
    }
    await handler.send(item.payload)
    markSynced(item.id)
    for (const key of handler.invalidates) {
      queryClient.invalidateQueries({ queryKey: key })
    }

    if (item.type === 'order') {
      const queuedDurationMs = Date.now() - new Date(item.createdAt).getTime()
      pilotTracker.track({ type: 'ORDER_SYNCED', metadata: { queuedDurationMs } })
    }
  } catch (err: unknown) {
    const msg = getApiErrorMessage(err)
    markError(item.id, msg)

    if (item.attempts + 1 >= item.maxAttempts) {
      // LGPD: lastError pode citar dados do cliente nos tipos da Inteligência —
      // só o pedido (reportPayload) manda o erro completo ao Sentry
      Sentry.captureEvent({
        message: 'Item da fila atingiu máximo de tentativas sem sync',
        level: 'error',
        extra: {
          itemId: item.id,
          type: item.type,
          attempts: item.attempts + 1,
          ...(handler?.reportPayload ? { lastError: msg } : {}),
          createdAt: item.createdAt,
        },
        tags: { module: 'sync_engine' },
      })

      if (item.type === 'order') {
        pilotTracker.track({
          type: 'ORDER_SYNC_FAILED',
          metadata: { attempts: item.attempts + 1, lastError: msg },
        })
      }
    }
  }
}

export async function processSyncQueue(): Promise<void> {
  const state = useSyncStore.getState()

  if (!state.networkAvailable) return
  // Guarda de reentrância: tudo entre este check e setIsSyncing(true) é síncrono,
  // então chamadas concorrentes (AppState + NetInfo + interval) não passam juntas
  if (state.isSyncing) return

  const items = state.queue.filter(
    (item) =>
      item.status === 'pending' || (item.status === 'error' && item.attempts < item.maxAttempts)
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
      processSyncQueue().catch((err) => Sentry.captureException(err))
    }
  }

  const appStateSubscription = AppState.addEventListener('change', handleAppStateChange)

  const netInfoUnsubscribe = NetInfo.addEventListener((state) => {
    // Só desliga com um `false` explícito. Quando o NetInfo não sabe responder
    // (isConnected null/undefined — acontece no simulador e em aparelho real),
    // assumir offline faz a fila parar de esvaziar mesmo com rede boa. Tentar e
    // falhar é seguro: o item volta para a fila com backoff e nada se perde.
    const available = state.isConnected !== false
    useSyncStore.getState().setNetworkAvailable(available)
    if (available) {
      processSyncQueue().catch((err) => Sentry.captureException(err))
    }
  })

  intervalId = setInterval(() => {
    const { networkAvailable } = useSyncStore.getState()
    if (networkAvailable) {
      processSyncQueue().catch((err) => Sentry.captureException(err))
    }
  }, 30_000)

  return () => {
    appStateSubscription.remove()
    netInfoUnsubscribe()
    if (intervalId) clearInterval(intervalId)
  }
}
