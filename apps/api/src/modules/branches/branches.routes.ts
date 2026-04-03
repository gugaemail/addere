import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from '../../middleware/authenticate'
import { prisma } from '@addere/db'

export default async function branchesRoutes(app: FastifyInstance) {
  // GET /branches — lista filiais ativas da empresa do usuário autenticado
  app.get('/', { preHandler: authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId } = request.user as { companyId: string | null }

    if (!companyId) {
      return reply.status(400).send({ message: 'Usuário não pertence a nenhuma empresa' })
    }

    const branches = await prisma.branch.findMany({
      where: { companyId, active: true },
      select: { id: true, name: true, cnpj: true, idProtheus: true, active: true },
      orderBy: { name: 'asc' },
    })

    return reply.send(branches)
  })
}
