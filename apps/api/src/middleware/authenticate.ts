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
  if (reply.sent) return // authenticate já respondeu com 401

  if (request.user.role !== 'ADMIN') {
    reply.status(403).send({ message: 'Acesso restrito a administradores' })
  }
}
