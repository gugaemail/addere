import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate, requirePermission } from '../../middleware/authenticate'
import { requireCompany } from '../../middleware/require-company'
import { unprocessable, AppError } from '../../lib/errors'
import { createOrderSchema, updateOrderSchema } from './orders.schema'
import {
  listOrders,
  getOrderStats,
  getOrder,
  createOrder,
  updateOrder,
  cancelOrder,
  resetOrderToPending,
} from './orders.service'
import { getEffectivePermissions } from '../permissions/permissions.service'
import { resolveOrderOwners } from '../users/data-scope'
import { syncOrderToProtheus, consultOrderStatus } from '../sync/sync.service'
import { notFound } from '../../lib/errors'

// O módulo de sync ainda lança Error puro — até a migração dele, os erros de
// integração viram 422 aqui em vez de caírem como 500 no handler global
function toUnprocessable(err: unknown): never {
  if (err instanceof AppError) throw err
  throw unprocessable((err as Error).message)
}

// Leituras: o vendedor vê os próprios pedidos; o gerente, os da equipe
function ownersOf(request: FastifyRequest): Promise<string[]> {
  return resolveOrderOwners(request.user.sub, request.user.role)
}

export default async function ordersRoutes(app: FastifyInstance) {
  const auth = { preHandler: [authenticate, requireCompany] }

  // GET /orders/stats — deve vir antes de /:id para não conflitar
  app.get('/stats', auth, async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = await getOrderStats(await ownersOf(request), request.user.companyId!)
    return reply.send(stats)
  })

  // GET /orders?limit=5
  app.get('/', auth, async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit } = request.query as { limit?: string }
    const MAX_PAGE_SIZE = 500
    const raw = parseInt(limit ?? '', 10)
    const parsedLimit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_PAGE_SIZE) : 100
    const orders = await listOrders(await ownersOf(request), request.user.companyId!, parsedLimit)
    return reply.send(orders)
  })

  // GET /orders/:id
  app.get('/:id', auth, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const order = await getOrder(await ownersOf(request), request.user.companyId!, id)
    if (!order) throw notFound('Pedido não encontrado')
    return reply.send(order)
  })

  // POST /orders
  app.post(
    '/',
    { ...auth, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = createOrderSchema.parse(request.body)
      const permissions = await getEffectivePermissions(request.user.sub, request.user.role)
      const order = await createOrder(request.user.sub, request.user.companyId!, input, permissions)
      return reply.status(201).send(order)
    }
  )

  // PUT /orders/:id — atualiza pedido PENDING
  app.put('/:id', auth, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const input = updateOrderSchema.parse(request.body)
    const permissions = await getEffectivePermissions(request.user.sub, request.user.role)
    const order = await updateOrder(
      request.user.sub,
      request.user.companyId!,
      id,
      input,
      permissions
    )
    return reply.send(order)
  })

  // GET /orders/:id/status — consulta status do pedido no Protheus via apiConsPed
  app.get('/:id/status', auth, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    try {
      const result = await consultOrderStatus(id, request.user.companyId!)
      return reply.send(result)
    } catch (err) {
      toUnprocessable(err)
    }
  })

  // POST /orders/:id/sync — envia pedido PENDING ao Protheus
  app.post(
    '/:id/sync',
    { ...auth, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      try {
        const result = await syncOrderToProtheus(id, request.user.companyId!)
        return reply.send(result)
      } catch (err) {
        toUnprocessable(err)
      }
    }
  )

  // PATCH /orders/:id/reset-pending — reverte pedido SYNCED para PENDING (requer permissão orders.reset_pending)
  app.patch(
    '/:id/reset-pending',
    { preHandler: [requirePermission('orders.reset_pending'), requireCompany] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string }
      const order = await resetOrderToPending(request.user.companyId!, id)
      return reply.send(order)
    }
  )

  // PATCH /orders/:id/cancel — cancela pedido PENDING (dono do pedido ou admin)
  app.patch('/:id/cancel', auth, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const order = await cancelOrder(request.user.sub, request.user.companyId!, id)
    return reply.send(order)
  })
}
