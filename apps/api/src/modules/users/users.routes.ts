import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireAdmin } from '../../middleware/authenticate'
import { createUserSchema } from './users.schema'
import { listUsers, createUser, toggleUserActive } from './users.service'

export default async function usersRoutes(app: FastifyInstance) {
  // GET /users
  app.get('/', { preHandler: requireAdmin }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const users = await listUsers()
    return reply.send(users)
  })

  // POST /users
  app.post('/', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const result = createUserSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: result.error.errors[0].message })
    }

    try {
      const user = await createUser(result.data)
      return reply.status(201).send(user)
    } catch (err) {
      return reply.status(409).send({ message: (err as Error).message })
    }
  })

  // PATCH /users/:id
  app.patch('/:id', { preHandler: requireAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    try {
      const user = await toggleUserActive(id)
      return reply.send(user)
    } catch (err) {
      return reply.status(404).send({ message: (err as Error).message })
    }
  })
}
