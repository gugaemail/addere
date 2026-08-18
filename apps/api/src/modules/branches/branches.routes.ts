import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { requireCompany } from '../../middleware/require-company'
import { prisma } from '@addere/db'

export default async function branchesRoutes(app: FastifyInstance) {
  // GET /branches — lista filiais ativas da empresa do usuário autenticado
  app.get('/', { preHandler: [authenticate, requireCompany] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const branches = await prisma.branch.findMany({
      where: { companyId: request.user.companyId!, active: true },
      select: { id: true, name: true, cnpj: true, idProtheus: true, active: true },
      orderBy: { name: 'asc' },
      take: 1000,
    })

    return reply.send(branches)
  })
}
