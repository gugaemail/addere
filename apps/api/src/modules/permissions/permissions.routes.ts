import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireSuperAdmin } from '../../middleware/authenticate'
import { setUserPermissionsSchema } from './permissions.schema'
import {
  listPermissionCatalog,
  getUserPermissionKeys,
  setUserPermissions,
  copyUserPermissions,
} from './permissions.service'
import { prisma } from '@addere/db'

// GET /permissions — catálogo completo de permissões disponíveis
export default async function permissionsRoutes(app: FastifyInstance) {
  app.get('/permissions', { preHandler: requireSuperAdmin }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const catalog = await listPermissionCatalog()
    return reply.send(catalog)
  })
}

// GET/PUT /users/:id/permissions — permissões concedidas a um usuário
export async function userPermissionsRoutes(app: FastifyInstance) {
  app.get('/:id/permissions', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ message: 'Usuário não encontrado' })

    const keys = await getUserPermissionKeys(id)
    return reply.send({ keys })
  })

  app.put('/:id/permissions', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string }
    const result = setUserPermissionsSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ message: result.error.errors[0].message })
    }

    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return reply.status(404).send({ message: 'Usuário não encontrado' })

    await setUserPermissions(id, result.data.keys)
    const keys = await getUserPermissionKeys(id)
    return reply.send({ keys })
  })

  app.post('/:id/permissions/copy-from/:sourceUserId', { preHandler: requireSuperAdmin }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, sourceUserId } = request.params as { id: string; sourceUserId: string }

    const [target, source] = await Promise.all([
      prisma.user.findUnique({ where: { id } }),
      prisma.user.findUnique({ where: { id: sourceUserId } }),
    ])
    if (!target) return reply.status(404).send({ message: 'Usuário não encontrado' })
    if (!source) return reply.status(404).send({ message: 'Usuário de origem não encontrado' })

    await copyUserPermissions(sourceUserId, id)
    const keys = await getUserPermissionKeys(id)
    return reply.send({ keys })
  })
}
