import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import fastifyRateLimit from '@fastify/rate-limit'
import ordersRoutes from '../orders.routes'

vi.mock('../orders.service', () => ({
  listOrders: vi.fn(),
  getOrder: vi.fn(),
  getOrderStats: vi.fn(),
  createOrder: vi.fn(),
  updateOrder: vi.fn(),
  cancelOrder: vi.fn(),
  resetOrderToPending: vi.fn(),
}))

vi.mock('../../sync/sync.service', () => ({
  syncOrderToProtheus: vi.fn(),
  consultOrderStatus: vi.fn(),
}))

vi.mock('../../permissions/permissions.service', () => ({
  getEffectivePermissions: vi.fn().mockResolvedValue(new Set(['orders.create', 'orders.reset_pending'])),
}))

import { listOrders, getOrder, createOrder } from '../orders.service'

const mockListOrders = listOrders as ReturnType<typeof vi.fn>
const mockGetOrder = getOrder as ReturnType<typeof vi.fn>
const mockCreateOrder = createOrder as ReturnType<typeof vi.fn>

const JWT_SECRET = 'test-secret-bola'

async function buildApp() {
  const app = Fastify({ logger: false })
  await app.register(fastifyCookie, { secret: 'cookie-secret' })
  await app.register(fastifyRateLimit, { global: false })
  await app.register(fastifyJwt, { secret: JWT_SECRET, sign: { expiresIn: '1h' } })
  await app.register(ordersRoutes, { prefix: '/orders' })
  await app.ready()
  return app
}

function makeToken(app: Awaited<ReturnType<typeof buildApp>>, payload: object) {
  return app.jwt.sign(payload)
}

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => { app = await buildApp() })
afterAll(async () => { await app.close() })
beforeEach(() => vi.clearAllMocks())

// ─── BOLA: companyId sempre vem do JWT, nunca do request ──────────────────

describe('GET /orders — BOLA (Broken Object Level Authorization)', () => {
  it('retorna 401 sem token de autenticação', async () => {
    const res = await app.inject({ method: 'GET', url: '/orders' })
    expect(res.statusCode).toBe(401)
  })

  it('retorna 403 para SUPERADMIN sem companyId (acesso isolado por empresa)', async () => {
    const token = makeToken(app, { sub: 'admin-1', role: 'SUPERADMIN', companyId: null })

    const res = await app.inject({
      method: 'GET',
      url: '/orders',
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(403)
    expect(mockListOrders).not.toHaveBeenCalled()
  })

  it('chama listOrders com o companyId do JWT, não com qualquer valor externo', async () => {
    const token = makeToken(app, { sub: 'user-1', role: 'SALESPERSON', companyId: 'company-A' })
    mockListOrders.mockResolvedValue([])

    await app.inject({
      method: 'GET',
      url: '/orders',
      headers: { Authorization: `Bearer ${token}` },
    })

    // Garante que o service recebe o companyId do JWT (company-A), não outro valor
    expect(mockListOrders).toHaveBeenCalledWith('user-1', 'company-A', expect.any(Number))
  })

  it('usuário de company-A não pode ver pedidos de company-B (companyId do JWT prevalece)', async () => {
    const tokenCompanyA = makeToken(app, { sub: 'user-a', role: 'SALESPERSON', companyId: 'company-A' })
    mockListOrders.mockResolvedValue([])

    await app.inject({
      method: 'GET',
      // Mesmo que a URL pudesse passar um filtro, o companyId vem do JWT
      url: '/orders?companyId=company-B',
      headers: { Authorization: `Bearer ${tokenCompanyA}` },
    })

    // O service só recebe company-A (do JWT), nunca company-B (da query string)
    expect(mockListOrders).toHaveBeenCalledWith('user-a', 'company-A', expect.any(Number))
    expect(mockListOrders).not.toHaveBeenCalledWith(expect.anything(), 'company-B', expect.anything())
  })
})

// ─── BOLA: GET /orders/:id ────────────────────────────────────────────────

describe('GET /orders/:id — BOLA', () => {
  it('retorna 401 sem token', async () => {
    const res = await app.inject({ method: 'GET', url: '/orders/order-xyz' })
    expect(res.statusCode).toBe(401)
  })

  it('retorna 404 quando o pedido não pertence à empresa do JWT', async () => {
    const token = makeToken(app, { sub: 'user-a', role: 'SALESPERSON', companyId: 'company-A' })
    // Service retorna null porque o pedido pertence a company-B, não company-A
    mockGetOrder.mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: '/orders/order-from-company-B',
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(404)
    // Service foi chamado com companyId de company-A (JWT), não company-B
    expect(mockGetOrder).toHaveBeenCalledWith('user-a', 'company-A', 'order-from-company-B')
  })

  it('retorna 200 quando o pedido pertence à empresa do JWT', async () => {
    const token = makeToken(app, { sub: 'user-a', role: 'SALESPERSON', companyId: 'company-A' })
    const order = { id: 'order-1', companyId: 'company-A', status: 'PENDING' }
    mockGetOrder.mockResolvedValue(order)

    const res = await app.inject({
      method: 'GET',
      url: '/orders/order-1',
      headers: { Authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().companyId).toBe('company-A')
  })
})

// ─── POST /orders — companyId não pode ser injetado pelo cliente ──────────

describe('POST /orders — companyId do JWT é inviolável', () => {
  it('retorna 401 sem token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      payload: { customerId: 'c1', branchId: 'b1', items: [{ productId: 'p1', quantity: 1 }] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('cria pedido com companyId do JWT mesmo que o body tente enviar outro', async () => {
    const token = makeToken(app, { sub: 'user-a', role: 'SALESPERSON', companyId: 'company-A' })
    const order = { id: 'new-order', companyId: 'company-A' }
    mockCreateOrder.mockResolvedValue(order)

    await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        customerId: 'c1',
        branchId: 'b1',
        items: [{ productId: 'p1', quantity: 1 }],
        // Tentativa de injetar companyId no body — deve ser ignorado
        companyId: 'company-B',
      },
    })

    // createOrder sempre recebe companyId do JWT (company-A), nunca do body
    expect(mockCreateOrder).toHaveBeenCalledWith(
      'user-a',
      'company-A', // companyId do JWT, não company-B do body
      expect.any(Object),
      expect.any(Set),
    )
  })

  it('retorna 403 para SUPERADMIN sem companyId', async () => {
    const token = makeToken(app, { sub: 'sa-1', role: 'SUPERADMIN', companyId: null })

    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { Authorization: `Bearer ${token}` },
      payload: { customerId: 'c1', branchId: 'b1', items: [] },
    })

    expect(res.statusCode).toBe(403)
    expect(mockCreateOrder).not.toHaveBeenCalled()
  })
})

// ─── Cross-company: dois tokens diferentes, mesmo endpoint ───────────────

describe('Isolamento multi-tenant — dois usuários de empresas diferentes', () => {
  it('cada usuário só vê seus próprios pedidos (companyId isolado por JWT)', async () => {
    const tokenA = makeToken(app, { sub: 'user-a', role: 'SALESPERSON', companyId: 'company-A' })
    const tokenB = makeToken(app, { sub: 'user-b', role: 'SALESPERSON', companyId: 'company-B' })

    mockListOrders
      .mockResolvedValueOnce([{ id: 'order-a1', companyId: 'company-A' }])
      .mockResolvedValueOnce([{ id: 'order-b1', companyId: 'company-B' }])

    const [resA, resB] = await Promise.all([
      app.inject({ method: 'GET', url: '/orders', headers: { Authorization: `Bearer ${tokenA}` } }),
      app.inject({ method: 'GET', url: '/orders', headers: { Authorization: `Bearer ${tokenB}` } }),
    ])

    expect(resA.json()[0].companyId).toBe('company-A')
    expect(resB.json()[0].companyId).toBe('company-B')

    // Garante que cada chamada recebeu o companyId correto
    expect(mockListOrders).toHaveBeenNthCalledWith(1, 'user-a', 'company-A', expect.any(Number))
    expect(mockListOrders).toHaveBeenNthCalledWith(2, 'user-b', 'company-B', expect.any(Number))
  })
})
