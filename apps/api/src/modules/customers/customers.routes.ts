import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { listCustomers, getCustomerById } from './customers.service'

export default async function customersRoutes(app: FastifyInstance) {
  // GET /customers?search=...
  app.get('/', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { search } = request.query as { search?: string }
    const customers = await listCustomers(search)
    return reply.send(customers)
  })

  // GET /customers/:id
  app.get('/:id', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    try {
      const customer = await getCustomerById(id)
      return reply.send(customer)
    } catch (err) {
      return reply.status(404).send({ message: (err as Error).message })
    }
  })
}
