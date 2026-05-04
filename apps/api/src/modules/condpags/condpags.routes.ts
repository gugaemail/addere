import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { prisma } from '@addere/db'

export default async function condpagsRoutes(app: FastifyInstance) {
  // GET /condpags — lista condições de pagamento da empresa
  app.get('/', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user
    if (!companyId) return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })

    const items = await prisma.condPag.findMany({
      where: { companyId },
      orderBy: { nome: 'asc' },
      select: { id: true, protheusCode: true, nome: true },
    })

    return reply.send(items)
  })
}
