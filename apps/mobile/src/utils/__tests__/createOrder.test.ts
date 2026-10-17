import { submitOrder, logsImplicitVisit } from '../createOrder'
import { useSyncStore } from '../../store/syncStore'

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../../lib/api', () => ({
  api: { post: jest.fn() },
}))
jest.mock('../../lib/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn() },
}))
jest.mock('../../services/pilotTracking', () => ({
  pilotTracker: {
    track: jest.fn(),
    getOrderDuration: jest.fn().mockReturnValue(0),
    startOrderTimer: jest.fn(),
  },
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

// O pedido vale como check-in (plano 006) só para quem tem o plano do dia. Sem
// isso, a trilha Dashboard ganhava um envio recusado na fila a cada pedido.
describe('logsImplicitVisit', () => {
  const base = { intelEnabled: true, hasVendorCode: true, protheusCode: '000123', loja: '01' }

  it('registra a visita para quem tem Inteligência e código de vendedor', () => {
    expect(logsImplicitVisit(base)).toBe(true)
  })

  it('não registra com a Inteligência desligada (a API responde 403)', () => {
    expect(logsImplicitVisit({ ...base, intelEnabled: false })).toBe(false)
  })

  it('não registra sem código de vendedor (a API responde 422)', () => {
    expect(logsImplicitVisit({ ...base, hasVendorCode: false })).toBe(false)
  })

  it('não registra cliente sem código ou loja do Protheus', () => {
    expect(logsImplicitVisit({ ...base, protheusCode: null })).toBe(false)
    expect(logsImplicitVisit({ ...base, loja: '' })).toBe(false)
  })
})
