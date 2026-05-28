import { getSyncDelay, processSyncQueue, startSyncListener } from '../syncEngine'
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
const mockNetInfoAddEventListener = jest.fn(() => jest.fn())
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: (...args: unknown[]) => mockNetInfoAddEventListener(...args),
}))
jest.mock('../pilotTracking', () => ({
  pilotTracker: { track: jest.fn(), getOrderDuration: jest.fn().mockReturnValue(0), startOrderTimer: jest.fn() },
}))

import { AppState } from 'react-native'
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

  it('reseta isSyncing para false mesmo após erro', async () => {
    mockPost.mockRejectedValueOnce(new Error('crash'))
    useSyncStore.getState().enqueue('order', {})
    await processSyncQueue()
    expect(useSyncStore.getState().isSyncing).toBe(false)
  })

  it('reprocessa item error com attempts < maxAttempts', async () => {
    jest.useRealTimers()
    mockPost.mockResolvedValueOnce({ data: {} })
    const id = useSyncStore.getState().enqueue('order', {})
    // força estado de erro sem incrementar attempts via markError (para manter delay=0)
    useSyncStore.setState((s) => ({
      queue: s.queue.map((i) => i.id === id ? { ...i, status: 'error' as const, attempts: 0 } : i),
    }))
    await processSyncQueue()
    const item = useSyncStore.getState().queue.find((i) => i.id === id)
    expect(item?.status).toBe('synced')
    jest.useFakeTimers()
  })
})

describe('startSyncListener', () => {
  let appStateSpy: jest.SpyInstance

  beforeEach(() => {
    mockNetInfoAddEventListener.mockReset()
    mockNetInfoAddEventListener.mockReturnValue(jest.fn())
    appStateSpy = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as ReturnType<typeof AppState.addEventListener>)
  })

  afterEach(() => {
    appStateSpy.mockRestore()
  })

  it('registra listener no NetInfo ao iniciar', () => {
    const cleanup = startSyncListener()
    expect(mockNetInfoAddEventListener).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('registra listener no AppState ao iniciar', () => {
    const cleanup = startSyncListener()
    expect(appStateSpy).toHaveBeenCalledWith('change', expect.any(Function))
    cleanup()
  })

  it('chama processSyncQueue quando network fica disponível', async () => {
    jest.useRealTimers()
    let netInfoCallback: ((state: { isConnected: boolean }) => void) | null = null
    mockNetInfoAddEventListener.mockImplementation((cb: (state: { isConnected: boolean }) => void) => {
      netInfoCallback = cb
      return jest.fn()
    })
    mockPost.mockResolvedValue({ data: {} })
    useSyncStore.getState().enqueue('order', {})

    const cleanup = startSyncListener()
    netInfoCallback!({ isConnected: true })
    await new Promise((r) => setTimeout(r, 50))

    expect(mockPost).toHaveBeenCalled()
    cleanup()
    jest.useFakeTimers()
  })

  it('chama processSyncQueue quando app volta ao foreground', async () => {
    jest.useRealTimers()
    let appStateCallback: ((state: string) => void) | null = null
    appStateSpy.mockImplementation((_event: string, cb: (state: string) => void) => {
      appStateCallback = cb
      return { remove: jest.fn() }
    })
    mockPost.mockResolvedValue({ data: {} })
    useSyncStore.getState().enqueue('order', {})

    const cleanup = startSyncListener()
    appStateCallback!('active')
    await new Promise((r) => setTimeout(r, 50))

    expect(mockPost).toHaveBeenCalled()
    cleanup()
    jest.useFakeTimers()
  })

  it('cleanup remove listener do NetInfo e do AppState', () => {
    const mockNetInfoUnsub = jest.fn()
    const mockAppStateRemove = jest.fn()
    mockNetInfoAddEventListener.mockReturnValue(mockNetInfoUnsub)
    appStateSpy.mockReturnValue({ remove: mockAppStateRemove })

    const cleanup = startSyncListener()
    cleanup()

    expect(mockNetInfoUnsub).toHaveBeenCalled()
    expect(mockAppStateRemove).toHaveBeenCalled()
  })
})
