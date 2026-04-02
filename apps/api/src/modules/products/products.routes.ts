import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { listProducts } from './products.service'

export default async function productsRoutes(app: FastifyInstance) {
  // GET /products?search=...
  app.get('/', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { search } = request.query as { search?: string }
    const products = await listProducts(search)
    return reply.send(products)
  })
}
