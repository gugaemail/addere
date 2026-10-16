import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { requireCompanyAdmin } from '../../middleware/require-company'
import { documentIdParam } from './contract-documents.schema'
import { acceptDocument, getMyBilling, getMyDocument, listMyDocuments } from './me.service'

// O contrato do ADMIN da empresa (plano 014) — registrado com o prefixo
// /billing/me. Todas com requireCompanyAdmin: qualquer ADMIN da empresa lê;
// aceitar confere também o administrador indicado (assertDesignatedAdmin).
// O 015, o 016 e o 017 acrescentam as rotas deles neste arquivo.

const acceptSchema = z.object({
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Código de integridade inválido'),
})

export default async function billingMeRoutes(app: FastifyInstance) {
  const companyAdmin = { preHandler: requireCompanyAdmin() }
  // A guarda garante o companyId do ADMIN
  const companyOf = (request: FastifyRequest) => request.user.companyId as string

  app.get('/', companyAdmin, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await getMyBilling(companyOf(request), new Date()))
  })

  app.get('/documents', companyAdmin, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await listMyDocuments(companyOf(request)))
  })

  app.get('/documents/:id', companyAdmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = documentIdParam.parse(request.params)
    return reply.send(await getMyDocument(companyOf(request), id))
  })

  app.post(
    '/documents/:id/accept',
    companyAdmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = documentIdParam.parse(request.params)
      const { sha256 } = acceptSchema.parse(request.body)
      const userAgent = request.headers['user-agent']
      return reply.send(
        await acceptDocument(
          id,
          {
            userId: request.user.sub,
            companyId: companyOf(request),
            sha256,
            // IP real pelo trustProxy (passo 3)
            ip: request.ip,
            userAgent: typeof userAgent === 'string' ? userAgent : undefined,
          },
          new Date()
        )
      )
    }
  )
}
