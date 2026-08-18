export type SyncStatus = 'pending' | 'syncing' | 'error' | 'synced'

export interface SyncQueueItem {
  id: string
  type: 'order'
  payload: unknown
  status: SyncStatus
  attempts: number
  maxAttempts: number
  lastError: string | null
  createdAt: string
  syncedAt: string | null
}
