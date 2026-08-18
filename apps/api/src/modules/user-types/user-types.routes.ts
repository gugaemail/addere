import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireSuperAdmin } from '../../middleware/authenticate'
import { createUserTypeSchema, updateUserTypeSchema } from './user-types.schema'
import { prisma } from '@addere/db'

// CRUD do cadastro dinâmico de tipos de usuário (ex: "Administrador", "Vendedor")
export default async function userTypesRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: requireSuperAdmin }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const userTypes = await prisma.userType.findMany({ orderBy: { name: 'asc' } })
    return reply.send(userTypes)
  })

  app.post('/', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    // ZodError e P2002 (duplicado) são convertidos pelo error handler global
    const data = createUserTypeSchema.parse(request.body)
    const userType = await prisma.userType.create({ data })
    return reply.status(201).send(userType)
  })

  app.patch('/:id', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const data = updateUserTypeSchema.parse(request.body)
    const userType = await prisma.userType.update({ where: { id }, data })
    return reply.send(userType)
  })
}
