export type SyncStatus = 'pending' | 'syncing' | 'error' | 'synced'

// Tipos da fila offline (E12): pedido + operações da Inteligência.
// Cada tipo tem endpoint/validação próprios em services/syncHandlers.ts;
// idempotência no servidor por clientId (visita) e por construção (planPatch).
export type SyncItemType =
  | 'order'
  | 'visit'
  | 'visitResult'
  | 'feedback'
  | 'planPatch'
  | 'messageSent'

export interface SyncQueueItem {
  id: string
  type: SyncItemType
  payload: unknown
  status: SyncStatus
  attempts: number
  maxAttempts: number
  lastError: string | null
  createdAt: string
  syncedAt: string | null
}
