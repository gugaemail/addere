import { getSyncDelay, processSyncQueue } from '../syncEngine'
import { useSyncStore } from '../../store/syncStore'

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

import { api } from '../../lib/api'

const mockPost = api.post as jest.Mock

function resetStore(overrides = {}) {
  useSyncStore.setState({
    queue: [],
    isSyncing: false,
    lastSyncAt: null,
    networkAvailable: true,
    ...overrides,
  })
}

beforeEach(() => {
  resetStore()
  mockPost.mockReset()
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
})

describe('getSyncDelay', () => {
  it('retorna 0 para 0 tentativas', () => expect(getSyncDelay(0)).toBe(0))
  it('retorna 1000 para 1 tentativa', () => expect(getSyncDelay(1)).toBe(1_000))
  it('retorna 2000 para 2 tentativas', () => expect(getSyncDelay(2)).toBe(2_000))
  it('retorna 4000 para 3 tentativas', () => expect(getSyncDelay(3)).toBe(4_000))
  it('retorna 8000 para 4 tentativas', () => expect(getSyncDelay(4)).toBe(8_000))
  it('retorna 30000 para 5+ tentativas', () => {
    expect(getSyncDelay(5)).toBe(30_000)
    expect(getSyncDelay(10)).toBe(30_000)
  })
})

describe('processSyncQueue', () => {
  it('não processa se offline', async () => {
    resetStore({ networkAvailable: false })
    useSyncStore.getState().enqueue('order', {})
    await processSyncQueue()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('não processa se já está sincronizando', async () => {
    resetStore({ isSyncing: true })
    useSyncStore.getState().enqueue('order', {})
    await processSyncQueue()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('não processa se fila está vazia', async () => {
    await processSyncQueue()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('marca como synced após sucesso', async () => {
    mockPost.mockResolvedValueOnce({ data: { id: 'order-1' } })
    const id = useSyncStore.getState().enqueue('order', { customerId: 'c1' })
    await processSyncQueue()
    const item = useSyncStore.getState().queue.find((i) => i.id === id)
    expect(item?.status).toBe('synced')
  })

  it('marca como error após falha', async () => {
    mockPost.mockRejectedValueOnce(new Error('network error'))
    const id = useSyncStore.getState().enqueue('order', {})
    await processSyncQueue()
    const item = useSyncStore.getState().queue.find((i) => i.id === id)
    expect(item?.status).toBe('error')
    expect(item?.attempts).toBe(1)
    expect(item?.lastError).toBe('network error')
  })

  it('processa múltiplos itens sequencialmente', async () => {
    const callOrder: string[] = []
    mockPost.mockImplementation((_url: string, data: { customerId?: string }) => {
      callOrder.push(data?.customerId ?? '?')
      return Promise.resolve({ data: {} })
    })

    useSyncStore.getState().enqueue('order', { customerId: 'first' })
    useSyncStore.getState().enqueue('order', { customerId: 'second' })

    await processSyncQueue()

    expect(callOrder).toEqual(['first', 'second'])
    expect(mockPost).toHaveBeenCalledTimes(2)
  })

  it('não tenta item com error e attempts >= maxAttempts', async () => {
    const id = useSyncStore.getState().enqueue('order', {})
    for (let i = 0; i < 5; i++) useSyncStore.getState().markError(id, 'err')
    await processSyncQueue()
    expect(mockPost).not.toHaveBeenCalled()
  })
})
