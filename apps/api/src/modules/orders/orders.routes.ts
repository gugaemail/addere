import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { createOrderSchema } from './orders.schema'
import { listOrders, getOrderStats, createOrder } from './orders.service'

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
    const orders = await listOrders(request.user.sub, companyId, limit ? Number(limit) : undefined)
    return reply.send(orders)
  })

  // POST /orders
  app.post('/', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
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
}
