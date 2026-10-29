import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@addere/db'
import { captureError } from '../lib/sentry'

// preHandler das rotas do app da Inteligência (E7): o JWT não carrega o
// idVendProt (payload = sub/email/role/companyId), então buscamos no banco.
// Compor após authenticate + requireCompany. Anexa request.vendorCode —
// TODA leitura/escrita das rotas /intel/app filtra por {companyId, vendorCode}.
//
// Também marca o uso do app (lastAppSeenAt): a frase do Hoje de madrugada só
// sai para quem usou no dia útil anterior. Grava no máximo a cada 15 min.
const SEEN_EVERY_MS = 15 * 60_000

declare module 'fastify' {
  interface FastifyRequest {
    vendorCode?: string
  }
}

export async function requireVendorCode(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: request.user.sub },
    select: {
      idVendProt: true,
      lastAppSeenAt: true,
      company: { select: { intelligenceEnabled: true } },
    },
  })

  if (!user?.idVendProt) {
    return reply
      .status(422)
      .send({ message: 'Usuário sem código de vendedor Protheus (fale com o administrador)' })
  }
  if (!user.company?.intelligenceEnabled) {
    return reply.status(403).send({ message: 'Inteligência não habilitada para esta empresa' })
  }

  request.vendorCode = user.idVendProt

  const now = new Date()
  if (!user.lastAppSeenAt || now.getTime() - user.lastAppSeenAt.getTime() >= SEEN_EVERY_MS) {
    // Não segura a requisição: perder uma marca só atrasa a frase de amanhã
    void prisma.user
      .update({ where: { id: request.user.sub }, data: { lastAppSeenAt: now } })
      .catch((err: unknown) =>
        captureError(err, { module: 'require-vendor-code', step: 'last-seen' })
      )
  }
}
