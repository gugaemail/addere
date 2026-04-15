import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { listCustomers, getCustomerById } from './customers.service'

export default async function customersRoutes(app: FastifyInstance) {
  // GET /customers?search=...
  app.get('/', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })
    const { search } = request.query as { search?: string }
    const customers = await listCustomers(companyId, search)
    return reply.send(customers)
  })

  // GET /customers/:id
  app.get('/:id', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const { companyId } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })
    try {
      const customer = await getCustomerById(companyId, id)
      return reply.send(customer)
    } catch (err) {
      return reply.status(404).send({ message: (err as Error).message })
    }
  })
}
