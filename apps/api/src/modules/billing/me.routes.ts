import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { requireAnyPermission } from '../../middleware/authenticate'
import { requireCompanyAdmin } from '../../middleware/require-company'
import { resolveTenant } from '../../middleware/resolve-tenant'
import { documentIdParam } from './contract-documents.schema'
import { acceptDocument, getMyBilling, getMyDocument, listMyDocuments } from './me.service'
import { listMyInvoices } from './invoices.service'
import { getSeatUsage } from './seats.service'
import { createLicenseRequestSchema } from './license-requests.schema'
import { createLicenseRequest } from './license-requests.service'

// O contrato do ADMIN da empresa (plano 014) — registrado com o prefixo
// /billing/me. Todas com requireCompanyAdmin (menos o GET /seats do 015, que
// também atende o SUPERADMIN com ?companyId=): qualquer ADMIN da empresa lê;
// aceitar confere também o administrador indicado (assertDesignatedAdmin).
// O 015, o 016 e o 017 acrescentam as rotas deles neste arquivo.

const acceptSchema = z.object({
  sha256: z.string().regex(/^[0-9a-fA-F]{64}$/, 'Código de integridade inválido'),
})

export default async function billingMeRoutes(app: FastifyInstance) {
  // Tudo em /billing/me continua acessível com a empresa bloqueada (plano 017):
  // é por aqui que o ADMIN vê a fatura, o contrato e o pedido de licenças. O
  // onRoute é encapsulado: vale só para as rotas deste plugin.
  app.addHook('onRoute', (routeOptions) => {
    routeOptions.config = { ...routeOptions.config, allowBlockedCompany: true }
  })

  const companyAdmin = { preHandler: requireCompanyAdmin() }
  // A guarda garante o companyId do ADMIN
  const companyOf = (request: FastifyRequest) => request.user.companyId as string

  app.get('/', companyAdmin, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await getMyBilling(companyOf(request), new Date()))
  })

  // Licenças em uso (plano 015): o contador e o aviso de /users. Guarda própria,
  // não a do ADMIN: quem gerencia usuários lê a própria empresa, e o SUPERADMIN
  // lê qualquer uma com ?companyId= (a empresa ativa da barra lateral)
  app.get(
    '/seats',
    { preHandler: requireAnyPermission('users.manage') },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const company = await resolveTenant(request, reply, 'query')
      if (!company) return
      return reply.send(await getSeatUsage(company.id, new Date()))
    }
  )

  // Pedido de licenças adicionais (plano 015): a guarda deixa qualquer ADMIN da
  // empresa passar; só o administrador indicado pede (assertDesignatedAdmin,
  // dentro da transação)
  app.post(
    '/license-requests',
    companyAdmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = createLicenseRequestSchema.parse(request.body)
      const userAgent = request.headers['user-agent']
      const created = await createLicenseRequest(
        { userId: request.user.sub, companyId: companyOf(request) },
        body,
        // IP real pelo trustProxy (plano 014)
        { ip: request.ip, userAgent: typeof userAgent === 'string' ? userAgent : undefined },
        new Date()
      )
      return reply.status(201).send(created)
    }
  )

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

  // Plano 016: as faturas da própria empresa, só leitura, sem observação
  // interna, motivo de cancelamento nem o nome de quem deu a baixa. Fica neste
  // prefixo de propósito: o 017 libera /billing/me/* para empresa bloqueada.
  app.get('/invoices', companyAdmin, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await listMyInvoices(companyOf(request), new Date()))
  })
}
