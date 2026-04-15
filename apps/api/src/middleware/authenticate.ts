import { FastifyRequest, FastifyReply } from 'fastify'

// preHandler hook para proteger rotas — uso: { preHandler: authenticate }
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
  } catch {
    reply.status(401).send({ message: 'Token inválido ou expirado' })
  }
}

// Verifica se o usuário autenticado tem role de ADMIN
export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await authenticate(request, reply)
  if (reply.sent) return

  if (!['ADMIN', 'SUPERADMIN'].includes(request.user.role)) {
    reply.status(403).send({ message: 'Acesso restrito a administradores' })
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
