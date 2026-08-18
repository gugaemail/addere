import { FastifyRequest, FastifyReply } from 'fastify'

// preHandler: exige que o usuário autenticado pertença a uma empresa.
// Compor após authenticate/requirePermission — request.user já validado.
export async function requireCompany(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user.companyId) {
    return reply.status(403).send({ message: 'Rota disponível apenas para usuários de uma empresa' })
  }
}

// Para rotas que recebem companyId no body/params: ADMIN só acessa a própria
// empresa; SUPERADMIN acessa qualquer uma.
export function assertSameCompany(
  request: FastifyRequest,
  reply: FastifyReply,
  companyId: string
): boolean {
  const { role, companyId: userCompanyId } = request.user
  if (role !== 'SUPERADMIN' && companyId !== userCompanyId) {
    reply.status(403).send({ message: 'Acesso negado' })
    return false
  }
  return true
}
