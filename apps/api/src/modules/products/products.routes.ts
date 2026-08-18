import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { requireCompany } from '../../middleware/require-company'
import { listProducts } from './products.service'

export default async function productsRoutes(app: FastifyInstance) {
  // GET /products?search=...
  app.get('/', { preHandler: [authenticate, requireCompany] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { search } = request.query as { search?: string }
    const products = await listProducts(request.user.companyId!, search)
    return reply.send(products)
  })
}
