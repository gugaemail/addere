import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { createOrderSchema } from './orders.schema'
import { listOrders, getOrderStats, createOrder } from './orders.service'

export default async function ordersRoutes(app: FastifyInstance) {
  // GET /orders/stats — deve vir antes de /:id para não conflitar
  app.get('/stats', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = await getOrderStats(request.user.sub)
    return reply.send(stats)
  })

  // GET /orders?limit=5
  app.get('/', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit } = request.query as { limit?: string }
    const orders = await listOrders(request.user.sub, limit ? Number(limit) : undefined)
    return reply.send(orders)
  })

  // POST /orders
  app.post('/', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = createOrderSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: result.error.flatten() })
    }

    try {
      const order = await createOrder(request.user.sub, result.data)
      return reply.status(201).send(order)
    } catch (err) {
      return reply.status(422).send({ message: (err as Error).message })
    }
  })
}
