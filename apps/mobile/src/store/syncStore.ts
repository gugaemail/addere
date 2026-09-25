import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SyncQueueItem, SyncStatus } from '../types/sync'

function generateId(): string {
  const bytes = new Uint8Array(16)
  // Sem crypto disponível o enqueue não pode falhar — perderia o pedido offline
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

interface SyncStoreState {
  queue: SyncQueueItem[]
  /**
   * Usuário logado — a fila é do aparelho, e a API grava o pedido em nome de
   * quem envia: cada item leva o id de quem o criou e só o dono vê e envia.
   * Mantido pelo auth.store a cada troca de sessão.
   */
  ownerId: string | null
  isSyncing: boolean
  lastSyncAt: string | null
  networkAvailable: boolean
  justSyncedOrderAt: string | null

  enqueue: (type: SyncQueueItem['type'], payload: unknown) => string
  setOwner: (ownerId: string | null) => void
  markSyncing: (id: string) => void
  markSynced: (id: string) => void
  markError: (id: string, error: string) => void
  markFailedPermanently: (id: string, error: string) => void
  setNetworkAvailable: (available: boolean) => void
  clearSynced: () => void
  setIsSyncing: (value: boolean) => void
  setLastSyncAt: (at: string) => void
  clearJustSyncedOrder: () => void
}

export const useSyncStore = create<SyncStoreState>()(
  persist(
    (set, get) => ({
      queue: [],
      ownerId: null,
      isSyncing: false,
      lastSyncAt: null,
      networkAvailable: true,
      justSyncedOrderAt: null,

      enqueue: (type, payload) => {
        const id = generateId()
        const item: SyncQueueItem = {
          id,
          type,
          payload,
          status: 'pending',
          attempts: 0,
          maxAttempts: 5,
          lastError: null,
          createdAt: new Date().toISOString(),
          syncedAt: null,
          userId: get().ownerId ?? undefined,
        }
        set((s) => ({ queue: [...s.queue, item] }))
        return id
      },

      setOwner: (ownerId) => set({ ownerId }),

      markSyncing: (id) =>
        set((s) => ({
          queue: s.queue.map((item) =>
            item.id === id ? { ...item, status: 'syncing' as SyncStatus } : item
          ),
        })),

      markSynced: (id) =>
        set((s) => {
          const syncedItem = s.queue.find((i) => i.id === id)
          return {
            queue: s.queue.map((item) =>
              item.id === id
                ? { ...item, status: 'synced' as SyncStatus, syncedAt: new Date().toISOString() }
                : item
            ),
            lastSyncAt: new Date().toISOString(),
            justSyncedOrderAt:
              syncedItem?.type === 'order' ? new Date().toISOString() : s.justSyncedOrderAt,
          }
        }),

      markFailedPermanently: (id, error) =>
        set((s) => ({
          queue: s.queue.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'error' as SyncStatus,
                  attempts: item.maxAttempts,
                  lastError: error,
                }
              : item
          ),
        })),

      markError: (id, error) =>
        set((s) => ({
          queue: s.queue.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'error' as SyncStatus,
                  attempts: item.attempts + 1,
                  lastError: error,
                }
              : item
          ),
        })),

      setNetworkAvailable: (available) => set({ networkAvailable: available }),

      clearSynced: () =>
        set((s) => ({ queue: s.queue.filter((item) => item.status !== 'synced') })),

      setIsSyncing: (value) => set({ isSyncing: value }),

      setLastSyncAt: (at) => set({ lastSyncAt: at }),

      clearJustSyncedOrder: () => set({ justSyncedOrderAt: null }),
    }),
    {
      name: 'addere-sync-queue',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        queue: state.queue,
        ownerId: state.ownerId,
        lastSyncAt: state.lastSyncAt,
      }),
      // Se o app morreu no meio de um envio, o item ficou 'syncing' no storage;
      // sem este reset ele nunca mais entraria no filtro de processamento
      onRehydrateStorage: () => (state) => {
        if (!state) return
        state.queue = state.queue
          // Itens de antes da fila ter dono não têm como ser atribuídos a
          // ninguém — ficariam invisíveis para sempre
          .filter((item) => item.userId)
          .map((item) =>
            item.status === 'syncing' ? { ...item, status: 'pending' as SyncStatus } : item
          )
      },
    }
  )
)

/** Só os itens do usuário logado — o resto da fila é de outra sessão. */
export const selectOwnQueue = (state: SyncStoreState) =>
  state.queue.filter((item) => (item.userId ?? null) === state.ownerId)

export const selectPendingCount = (state: SyncStoreState) =>
  selectOwnQueue(state).filter(
    (item) =>
      item.status === 'pending' || (item.status === 'error' && item.attempts < item.maxAttempts)
  ).length

export const selectHasPending = (state: SyncStoreState) => selectPendingCount(state) > 0

export const selectPendingItems = (state: SyncStoreState) =>
  selectOwnQueue(state).filter(
    (item) =>
      item.status === 'pending' ||
      item.status === 'syncing' ||
      (item.status === 'error' && item.attempts < item.maxAttempts)
  )

export const selectErrorItems = (state: SyncStoreState) =>
  selectOwnQueue(state).filter((item) => item.status === 'error')
