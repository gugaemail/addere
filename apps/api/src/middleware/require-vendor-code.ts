import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '@addere/db'

// preHandler das rotas do app da Inteligência (E7): o JWT não carrega o
// idVendProt (payload = sub/email/role/companyId), então buscamos no banco.
// Compor após authenticate + requireCompany. Anexa request.vendorCode —
// TODA leitura/escrita das rotas /intel/app filtra por {companyId, vendorCode}.

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
    select: { idVendProt: true, company: { select: { intelligenceEnabled: true } } },
  })

  if (!user?.idVendProt) {
    return reply
      .status(422)
      .send({ message: 'Usuário sem código de vendedor Protheus (fale com o administrador)' })
  }
  if (!user.company?.intelligenceEnabled) {
    return reply
      .status(403)
      .send({ message: 'Inteligência não habilitada para esta empresa' })
  }

  request.vendorCode = user.idVendProt
}
