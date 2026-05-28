import { useSyncStore, selectPendingCount, selectHasPending, selectPendingItems, selectErrorItems } from '../../store/syncStore'
import { processSyncQueue } from '../../services/syncEngine'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)
jest.mock('../../lib/api', () => ({
  api: { post: jest.fn() },
}))
jest.mock('../../lib/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}))
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => jest.fn()),
}))
jest.mock('../../services/pilotTracking', () => ({
  pilotTracker: { track: jest.fn(), getOrderDuration: jest.fn().mockReturnValue(0), startOrderTimer: jest.fn() },
}))

const validPayload = { customerId: 'c1', branchId: 'b1', items: [{ productId: 'p1', quantity: 1 }] }

// Testa a lógica exposta por useSyncQueue diretamente via store
// (sem renderHook, pois @testing-library/react-native não está instalado)

function retryItem(id: string) {
  useSyncStore.setState((s) => ({
    queue: s.queue.map((item) =>
      item.id === id
        ? { ...item, status: 'pending' as const, attempts: 0, lastError: null }
        : item,
    ),
  }))
  return processSyncQueue()
}

beforeEach(() => {
  useSyncStore.setState({ queue: [], isSyncing: false, lastSyncAt: null, networkAvailable: true })
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('selectors de fila (expostos via useSyncQueue)', () => {
  it('pendingCount conta itens pending + error com attempts < maxAttempts', () => {
    const id1 = useSyncStore.getState().enqueue('order', {})
    const id2 = useSyncStore.getState().enqueue('order', {})
    useSyncStore.getState().markError(id2, 'err')
    expect(selectPendingCount(useSyncStore.getState())).toBe(2)
    useSyncStore.getState().markSynced(id1)
    expect(selectPendingCount(useSyncStore.getState())).toBe(1)
  })

  it('hasPending retorna false quando fila está vazia', () => {
    expect(selectHasPending(useSyncStore.getState())).toBe(false)
  })

  it('hasPending retorna true com item pending', () => {
    useSyncStore.getState().enqueue('order', {})
    expect(selectHasPending(useSyncStore.getState())).toBe(true)
  })

  it('pendingItems lista apenas itens pending', () => {
    const id1 = useSyncStore.getState().enqueue('order', {})
    const id2 = useSyncStore.getState().enqueue('order', {})
    useSyncStore.getState().markSynced(id2)
    const items = selectPendingItems(useSyncStore.getState())
    expect(items.map((i) => i.id)).toContain(id1)
    expect(items.map((i) => i.id)).not.toContain(id2)
  })

  it('errorItems lista apenas itens com status error', () => {
    const id1 = useSyncStore.getState().enqueue('order', {})
    const id2 = useSyncStore.getState().enqueue('order', {})
    useSyncStore.getState().markError(id1, 'falha')
    const items = selectErrorItems(useSyncStore.getState())
    expect(items.map((i) => i.id)).toContain(id1)
    expect(items.map((i) => i.id)).not.toContain(id2)
  })
})

describe('retryItem', () => {
  it('reseta item com error para pending com attempts=0', async () => {
    const id = useSyncStore.getState().enqueue('order', validPayload)
    useSyncStore.getState().markError(id, 'timeout')
    expect(useSyncStore.getState().queue.find((i) => i.id === id)?.attempts).toBe(1)

    await retryItem(id)

    const item = useSyncStore.getState().queue.find((i) => i.id === id)
    expect(item?.attempts).toBe(0)
    expect(item?.lastError).toBeNull()
  })

  it('reseta lastError junto com o status', async () => {
    const id = useSyncStore.getState().enqueue('order', validPayload)
    useSyncStore.getState().markError(id, 'mensagem de erro')
    await retryItem(id)
    const item = useSyncStore.getState().queue.find((i) => i.id === id)
    expect(item?.lastError).toBeNull()
  })
})

describe('dismissSynced', () => {
  it('clearSynced remove itens synced da fila', () => {
    const id1 = useSyncStore.getState().enqueue('order', {})
    const id2 = useSyncStore.getState().enqueue('order', {})
    useSyncStore.getState().markSynced(id1)
    useSyncStore.getState().clearSynced()
    const ids = useSyncStore.getState().queue.map((i) => i.id)
    expect(ids).not.toContain(id1)
    expect(ids).toContain(id2)
  })
})
