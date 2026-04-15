import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { listProducts } from './products.service'

export default async function productsRoutes(app: FastifyInstance) {
  // GET /products?search=...
  app.get('/', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })
    const { search } = request.query as { search?: string }
    const products = await listProducts(companyId, search)
    return reply.send(products)
  })
}
