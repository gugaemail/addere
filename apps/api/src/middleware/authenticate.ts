import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@addere/db'
import { COMPANY_BLOCKED_CODE, type CompanyBlockedResponse } from '@addere/types'
import { resolveCompanyAccess } from '../lib/company-access'
import { getEffectivePermissions } from '../modules/permissions/permissions.service'

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Rota que a empresa bloqueada ainda pode chamar (plano 017). */
    allowBlockedCompany?: boolean
  }
}

// preHandler hook para proteger rotas — uso: { preHandler: authenticate }
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify()
  } catch (err) {
    request.log.warn({ err, ip: request.ip }, 'JWT verification failed')
    return reply.status(401).send({ message: 'Token inválido ou expirado' })
  }

  // O access token vive 8h — sem esta checagem um usuário desativado
  // continuaria operando até o token expirar. A empresa vem na mesma consulta
  // (plano 017): o bloqueio não custa ida a mais ao banco.
  const dbUser = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: {
      active: true,
      company: { select: { active: true, accessBlockedAt: true, accessBlockReason: true } },
    },
  })
  if (!dbUser?.active) {
    return reply.status(401).send({ message: 'Usuário inativo' })
  }

  // Bloqueio por rota (plano 017): login, refresh e logout não passam por aqui,
  // e /auth/me, /auth/me/permissions e /billing/me/* são marcados com
  // allowBlockedCompany — senão o app e o painel deslogariam em loop.
  if (request.user.role === 'SUPERADMIN') return
  const access = resolveCompanyAccess(dbUser.company)
  if (access.blocked && access.reason && !request.routeOptions.config?.allowBlockedCompany) {
    const body: CompanyBlockedResponse = {
      message: 'Acesso da empresa suspenso. Fale com o administrador.',
      code: COMPANY_BLOCKED_CODE,
      reason: access.reason,
    }
    return reply.status(403).send(body)
  }
}

// Verifica se o usuário autenticado tem role de SUPERADMIN (painel web)
export async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
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

// Verifica se o usuário possui QUALQUER uma das permissões informadas.
// SUPERADMIN sempre passa (não participa do cadastro de permissões).
// Uso: { preHandler: [requireAnyPermission('intel.admin', 'intel.manager')] }
export function requireAnyPermission(...keys: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await authenticate(request, reply)
    if (reply.sent) return

    if (request.user.role === 'SUPERADMIN') return

    const permissions = await getEffectivePermissions(request.user.sub, request.user.role)
    if (!keys.some((key) => permissions.has(key))) {
      reply.status(403).send({ message: 'Permissão insuficiente' })
    }
  }
}
