import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { requireCompany } from '../../middleware/require-company'
import { listCustomers, getCustomerById } from './customers.service'

export default async function customersRoutes(app: FastifyInstance) {
  // GET /customers?search=...
  app.get('/', { preHandler: [authenticate, requireCompany] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { search } = request.query as { search?: string }
    const customers = await listCustomers(request.user.companyId!, search, request.user.sub)
    return reply.send(customers)
  })

  // GET /customers/:id
  app.get('/:id', { preHandler: [authenticate, requireCompany] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const customer = await getCustomerById(request.user.companyId!, id)
    return reply.send(customer)
  })
}
