export type SyncStatus = 'pending' | 'syncing' | 'error' | 'synced'

export interface SyncQueueItem {
  id: string
  type: 'order' | 'order_update'
  payload: unknown
  status: SyncStatus
  attempts: number
  maxAttempts: number
  lastError: string | null
  createdAt: string
  syncedAt: string | null
}

export interface SyncState {
  queue: SyncQueueItem[]
  isSyncing: boolean
  lastSyncAt: string | null
  networkAvailable: boolean
}
