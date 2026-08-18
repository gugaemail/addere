import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { requireCompany } from '../../middleware/require-company'
import { prisma } from '@addere/db'

export default async function transportadorasRoutes(app: FastifyInstance) {
  // GET /transportadoras — lista transportadoras da empresa
  app.get('/', { preHandler: [authenticate, requireCompany] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const items = await prisma.transportadora.findMany({
      where: { companyId: request.user.companyId! },
      orderBy: { nome: 'asc' },
      select: { id: true, protheusCode: true, nome: true },
      take: 1000,
    })

    return reply.send(items)
  })
}
