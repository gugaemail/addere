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
    const result = createUserTypeSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: result.error.errors[0].message })
    }

    try {
      const userType = await prisma.userType.create({ data: result.data })
      return reply.status(201).send(userType)
    } catch {
      return reply.status(409).send({ message: 'Tipo de usuário já cadastrado' })
    }
  })

  app.patch('/:id', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const result = updateUserTypeSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: result.error.errors[0].message })
    }

    try {
      const userType = await prisma.userType.update({ where: { id }, data: result.data })
      return reply.send(userType)
    } catch {
      return reply.status(404).send({ message: 'Tipo de usuário não encontrado' })
    }
  })
}
