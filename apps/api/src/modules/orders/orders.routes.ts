import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { createOrderSchema, updateOrderSchema } from './orders.schema'
import { listOrders, getOrderStats, getOrder, createOrder, updateOrder, cancelOrder, resetOrderToPending } from './orders.service'
import { syncOrderToProtheus, consultOrderStatus } from '../sync/sync.service'

export default async function ordersRoutes(app: FastifyInstance) {
  // GET /orders/stats — deve vir antes de /:id para não conflitar
  app.get('/stats', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })
    const stats = await getOrderStats(request.user.sub, companyId)
    return reply.send(stats)
  })

  // GET /orders?limit=5
  app.get('/', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })
    const { limit } = request.query as { limit?: string }
    const MAX_PAGE_SIZE = 500
    const raw = parseInt(limit ?? '', 10)
    const parsedLimit = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_PAGE_SIZE) : 100
    const orders = await listOrders(request.user.sub, companyId, parsedLimit)
    return reply.send(orders)
  })

  // GET /orders/:id
  app.get('/:id', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })
    const { id } = request.params as { id: string }
    const order = await getOrder(request.user.sub, companyId, id)
    if (!order) return reply.status(404).send({ message: 'Pedido não encontrado' })
    return reply.send(order)
  })

  // POST /orders
  app.post('/', { preHandler: authenticate, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })

    const result = createOrderSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }

    try {
      const order = await createOrder(request.user.sub, companyId, result.data)
      return reply.status(201).send(order)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // PUT /orders/:id — atualiza pedido PENDING
  app.put('/:id', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })

    const { id } = request.params as { id: string }
    const result = updateOrderSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }

    try {
      const order = await updateOrder(request.user.sub, companyId, id, result.data)
      return reply.send(order)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // GET /orders/:id/status — consulta status do pedido no Protheus via apiConsPed
  app.get('/:id/status', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })
    const { id } = request.params as { id: string }
    try {
      const result = await consultOrderStatus(id, companyId)
      return reply.send(result)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // POST /orders/:id/sync — envia pedido PENDING ao Protheus
  app.post('/:id/sync', { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })
    const { id } = request.params as { id: string }
    try {
      const result = await syncOrderToProtheus(id, companyId)
      return reply.send(result)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // PATCH /orders/:id/reset-pending — reverte pedido SYNCED para PENDING (admin/superadmin apenas)
  app.patch('/:id/reset-pending', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId, role } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })
    if (role === 'SALESPERSON') return reply.status(403).send({ message: 'Apenas administradores podem reverter pedidos para PENDING' })
    const { id } = request.params as { id: string }
    try {
      const order = await resetOrderToPending(companyId, id)
      return reply.send(order)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })

  // PATCH /orders/:id/cancel — cancela pedido PENDING (dono do pedido ou admin)
  app.patch('/:id/cancel', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })
    const { id } = request.params as { id: string }
    try {
      const order = await cancelOrder(request.user.sub, companyId, id)
      return reply.send(order)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })
}
