import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSyncStore, selectPendingCount, selectHasPending } from '../syncStore'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
)

function getStore() {
  return useSyncStore.getState()
}

beforeEach(() => {
  useSyncStore.setState({ queue: [], isSyncing: false, lastSyncAt: null, networkAvailable: true })
  jest.clearAllMocks()
})

describe('enqueue', () => {
  it('adiciona item com status pending', () => {
    const id = getStore().enqueue('order', { customerId: 'c1' })
    const item = useSyncStore.getState().queue.find((i) => i.id === id)
    expect(item).toBeDefined()
    expect(item?.status).toBe('pending')
    expect(item?.attempts).toBe(0)
    expect(item?.maxAttempts).toBe(5)
    expect(item?.lastError).toBeNull()
    expect(item?.syncedAt).toBeNull()
  })

  it('gera id único para cada item', () => {
    const id1 = getStore().enqueue('order', {})
    const id2 = getStore().enqueue('order', {})
    expect(id1).not.toBe(id2)
  })
})

describe('markSynced', () => {
  it('atualiza status para synced e seta syncedAt', () => {
    const id = getStore().enqueue('order', {})
    getStore().markSynced(id)
    const item = useSyncStore.getState().queue.find((i) => i.id === id)
    expect(item?.status).toBe('synced')
    expect(item?.syncedAt).not.toBeNull()
  })

  it('atualiza lastSyncAt no store', () => {
    const id = getStore().enqueue('order', {})
    getStore().markSynced(id)
    expect(useSyncStore.getState().lastSyncAt).not.toBeNull()
  })
})

describe('markError', () => {
  it('incrementa attempts e salva lastError', () => {
    const id = getStore().enqueue('order', {})
    getStore().markError(id, 'timeout')
    const item = useSyncStore.getState().queue.find((i) => i.id === id)
    expect(item?.status).toBe('error')
    expect(item?.attempts).toBe(1)
    expect(item?.lastError).toBe('timeout')
  })

  it('incrementa attempts a cada chamada', () => {
    const id = getStore().enqueue('order', {})
    getStore().markError(id, 'err1')
    getStore().markError(id, 'err2')
    const item = useSyncStore.getState().queue.find((i) => i.id === id)
    expect(item?.attempts).toBe(2)
    expect(item?.lastError).toBe('err2')
  })
})

describe('pendingCount', () => {
  it('conta itens pending e error com attempts < maxAttempts', () => {
    const id1 = getStore().enqueue('order', {})
    const id2 = getStore().enqueue('order', {})
    getStore().markError(id2, 'err')

    const count = selectPendingCount(useSyncStore.getState())
    expect(count).toBe(2)
  })

  it('não conta itens synced', () => {
    const id = getStore().enqueue('order', {})
    getStore().markSynced(id)
    expect(selectPendingCount(useSyncStore.getState())).toBe(0)
  })

  it('não conta itens error com attempts >= maxAttempts', () => {
    const id = getStore().enqueue('order', {})
    for (let i = 0; i < 5; i++) getStore().markError(id, 'err')
    expect(selectPendingCount(useSyncStore.getState())).toBe(0)
  })
})

describe('hasPending', () => {
  it('retorna true quando há itens pendentes', () => {
    getStore().enqueue('order', {})
    expect(selectHasPending(useSyncStore.getState())).toBe(true)
  })

  it('retorna false quando fila está vazia', () => {
    expect(selectHasPending(useSyncStore.getState())).toBe(false)
  })
})

describe('clearSynced', () => {
  it('remove apenas itens synced', () => {
    const id1 = getStore().enqueue('order', {})
    const id2 = getStore().enqueue('order', {})
    getStore().markSynced(id1)
    getStore().clearSynced()
    const ids = useSyncStore.getState().queue.map((i) => i.id)
    expect(ids).not.toContain(id1)
    expect(ids).toContain(id2)
  })
})

describe('persist', () => {
  it('chama AsyncStorage.setItem ao mudar o estado', async () => {
    getStore().enqueue('order', { test: true })
    await new Promise((r) => setTimeout(r, 50))
    expect(AsyncStorage.setItem).toHaveBeenCalled()
  })
})
