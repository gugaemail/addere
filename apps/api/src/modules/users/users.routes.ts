import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requirePermission } from '../../middleware/authenticate'
import { createUserSchema, updateUserSchema } from './users.schema'
import { listUsers, createUser, toggleUserActive, updateUserById } from './users.service'

// Erros: o serviço lança AppError (status, mensagem e código) e o handler
// global (lib/error-handler.ts) responde. Sem try/catch aqui: o catch antigo
// repassava o `message` de qualquer erro, e a mensagem crua do Prisma (com o
// caminho do arquivo e o trecho do código) chegava ao painel. Erro que não é
// AppError vira a mensagem genérica do handler (500, ou 409 "Registro
// duplicado" num P2002 que o serviço não traduziu).

// Usuários fora de uma empresa (companyId null) só existem para SUPERADMIN;
// qualquer outro role sem empresa não tem o que listar/gerenciar aqui
function assertScope(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.user.role !== 'SUPERADMIN' && !request.user.companyId) {
    reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })
    return false
  }
  return true
}

export default async function usersRoutes(app: FastifyInstance) {
  // GET /users
  app.get(
    '/',
    { preHandler: requirePermission('users.view') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!assertScope(request, reply)) return
      const users = await listUsers(request.user)
      return reply.send(users)
    }
  )

  // POST /users
  app.post(
    '/',
    { preHandler: requirePermission('users.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!assertScope(request, reply)) return
      const result = createUserSchema.safeParse(request.body)
      if (!result.success) {
        return reply.status(400).send({ message: result.error.errors[0].message })
      }

      // Somente SUPERADMIN cria administradores ou usuários de outra empresa
      if (request.user.role !== 'SUPERADMIN') {
        if (result.data.role !== 'SALESPERSON') {
          return reply
            .status(403)
            .send({ message: 'Apenas o super administrador pode criar administradores' })
        }
        if (result.data.companyId && result.data.companyId !== request.user.companyId) {
          return reply
            .status(403)
            .send({ message: 'Não é permitido criar usuários em outra empresa' })
        }
      }

      const user = await createUser(result.data, request.user)
      return reply.status(201).send(user)
    }
  )

  // PATCH /users/:id — edição de verdade (nome, perfil, dados do vendedor).
  // Antes esta rota era o toggle de ativo; o toggle passou para /:id/active,
  // no mesmo formato de /companies/:id/users/:userId/active.
  app.patch(
    '/:id',
    { preHandler: requirePermission('users.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!assertScope(request, reply)) return
      const { id } = request.params as { id: string }
      const result = updateUserSchema.safeParse(request.body)
      if (!result.success) {
        return reply.status(400).send({ message: result.error.errors[0].message })
      }

      // Só o SUPERADMIN promove alguém a administrador
      if (request.user.role !== 'SUPERADMIN' && result.data.role === 'ADMIN') {
        return reply
          .status(403)
          .send({ message: 'Apenas o super administrador pode criar administradores' })
      }

      return reply.send(await updateUserById(id, result.data, request.user))
    }
  )

  // PATCH /users/:id/active — ativa/desativa
  app.patch(
    '/:id/active',
    { preHandler: requirePermission('users.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!assertScope(request, reply)) return
      const { id } = request.params as { id: string }
      const user = await toggleUserActive(id, request.user)
      return reply.send(user)
    }
  )
}
