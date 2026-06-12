import { FastifyRequest, FastifyReply } from 'fastify'
import { getEffectivePermissions } from '../modules/permissions/permissions.service'

// preHandler hook para proteger rotas — uso: { preHandler: authenticate }
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
  } catch (err) {
    request.log.warn({ err, ip: request.ip }, 'JWT verification failed')
    return reply.status(401).send({ message: 'Token inválido ou expirado' })
  }
}

// Verifica se o usuário autenticado tem role de SUPERADMIN (painel web)
export async function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authenticate(request, reply)
  if (reply.sent) return

  if (request.user.role !== 'SUPERADMIN') {
    reply.status(403).send({ message: 'Acesso restrito ao super administrador' })
  }
}

// Verifica se o usuário autenticado possui a permissão dinâmica informada.
// SUPERADMIN nunca participa do cadastro de permissões — sempre tem acesso total.
export function requirePermission(key: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply)
    if (reply.sent) return

    if (request.user.role === 'SUPERADMIN') return

    const permissions = await getEffectivePermissions(request.user.sub, request.user.role)
    if (!permissions.has(key)) {
      reply.status(403).send({ message: 'Permissão insuficiente' })
    }
  }
}
