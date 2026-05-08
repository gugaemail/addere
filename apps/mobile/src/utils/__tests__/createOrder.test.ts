import { submitOrder } from '../createOrder'
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

import { api } from '../../lib/api'

const mockPost = api.post as jest.Mock

const payload = {
  customerId: 'c1',
  branchId: 'b1',
  items: [{ productId: 'p1', quantity: 1 }],
}

beforeEach(() => {
  useSyncStore.setState({
    queue: [],
    isSyncing: false,
    lastSyncAt: null,
    networkAvailable: true,
  })
  mockPost.mockReset()
})

describe('submitOrder', () => {
  it('enfileira imediatamente se offline', async () => {
    useSyncStore.setState({ networkAvailable: false })
    const result = await submitOrder(payload)
    expect(result.queued).toBe(true)
    expect(result.synced).toBe(false)
    expect(mockPost).not.toHaveBeenCalled()
    expect(useSyncStore.getState().queue).toHaveLength(1)
  })

  it('tenta API se online e retorna synced:true no sucesso', async () => {
    const orderData = { id: 'order-xyz', status: 'PENDING' }
    mockPost.mockResolvedValueOnce({ data: orderData })
    const result = await submitOrder(payload)
    expect(result.synced).toBe(true)
    expect(result.queued).toBe(false)
    expect(result.data).toEqual(orderData)
    expect(useSyncStore.getState().queue).toHaveLength(0)
  })

  it('enfileira se API falhar e retorna queued:true', async () => {
    mockPost.mockRejectedValueOnce(new Error('network error'))
    const result = await submitOrder(payload)
    expect(result.queued).toBe(true)
    expect(result.synced).toBe(false)
    expect(useSyncStore.getState().queue).toHaveLength(1)
    expect(useSyncStore.getState().queue[0].status).toBe('pending')
  })
})
