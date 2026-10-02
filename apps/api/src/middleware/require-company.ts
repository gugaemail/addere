import { FastifyRequest, FastifyReply } from 'fastify'
import { authenticate } from './authenticate'

// preHandler: exige que o usuário autenticado pertença a uma empresa.
// Compor após authenticate/requirePermission — request.user já validado.
export async function requireCompany(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.user.companyId) {
    return reply
      .status(403)
      .send({ message: 'Rota disponível apenas para usuários de uma empresa' })
  }
}

/**
 * preHandler de rota de empresa com :id na URL (E23): SUPERADMIN abre qualquer
 * empresa; ADMIN só a dele; os demais papéis, 403. É o que abre o menu Empresas
 * para o ADMIN cadastrar e conferir a integração sem depender do SUPERADMIN.
 *
 * Fica de fora de propósito (seguem só do SUPERADMIN): listar/criar empresa,
 * editar razão social/CNPJ e o liga-desliga da empresa — o ADMIN se trancaria
 * para fora e só o SUPERADMIN reverteria.
 */
export function requireCompanyScope(param = 'id') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply)
    if (reply.sent) return

    const { role } = request.user
    if (role === 'SUPERADMIN') return
    if (role !== 'ADMIN') {
      return reply.status(403).send({ message: 'Acesso restrito a administradores' })
    }

    const id = (request.params as Record<string, string | undefined>)[param]
    if (!id) {
      return reply.status(400).send({ message: 'Informe o companyId da empresa' })
    }
    assertSameCompany(request, reply, id)
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
