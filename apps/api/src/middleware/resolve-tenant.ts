import { FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import type { Company } from '@prisma/client'
import { assertSameCompany } from './require-company'

const companyIdSchema = z.string().uuid('companyId deve ser um UUID válido')

/**
 * Resolve a empresa (tenant) das rotas admin da Inteligência.
 * - `companyId` vem da query string ou do body (conforme `source`);
 *   quando ausente, usa a empresa do próprio usuário.
 * - SUPERADMIN sem `companyId` explícito → 400 (não há empresa implícita).
 * - ADMIN pedindo empresa de outro tenant → 403 (assertSameCompany).
 * Retorna a Company, ou null quando a resposta já foi enviada.
 * Compor após authenticate/requirePermission.
 */
export async function resolveTenant(
  request: FastifyRequest,
  reply: FastifyReply,
  source: 'query' | 'body'
): Promise<Company | null> {
  const raw = ((source === 'query' ? request.query : request.body) ?? {}) as Record<
    string,
    unknown
  >
  const provided = raw['companyId']

  let companyId: string
  if (provided !== undefined && provided !== null && provided !== '') {
    const parsed = companyIdSchema.safeParse(provided)
    if (!parsed.success) {
      reply.status(400).send({ message: 'companyId inválido' })
      return null
    }
    companyId = parsed.data
  } else if (request.user.companyId) {
    companyId = request.user.companyId
  } else {
    // SUPERADMIN não pertence a empresa — precisa dizer qual quer operar
    reply.status(400).send({ message: 'Informe o companyId da empresa' })
    return null
  }

  if (!assertSameCompany(request, reply, companyId)) return null

  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) {
    reply.status(404).send({ message: 'Empresa não encontrada' })
    return null
  }
  return company
}
