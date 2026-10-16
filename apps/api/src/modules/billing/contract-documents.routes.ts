import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireSuperAdmin } from '../../middleware/authenticate'
import { companyIdParam } from './billing.schema'
import {
  amendmentSchema,
  designatedAdminSchema,
  documentCancelSchema,
  documentIdParam,
  documentSendSchema,
} from './contract-documents.schema'
import {
  cancelDocument,
  getDocumentForSuperadmin,
  listClientDocuments,
  previewDocument,
  resendDocumentEmail,
  saveAmendment,
  sendDocument,
  setDesignatedAdmin,
  withdrawAmendment,
} from './contract-documents.service'

// Documentos para aceite, administrador indicado e aditivo (plano 014) —
// registrado com o prefixo /admin/billing, ao lado das rotas da ficha do 013.
// Só o SUPERADMIN; o autor de cada ação é request.user.sub.
export default async function contractDocumentsRoutes(app: FastifyInstance) {
  const superadmin = { preHandler: requireSuperAdmin }

  app.get(
    '/clients/:companyId/documents',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      return reply.send(await listClientDocuments(companyId))
    }
  )

  app.put(
    '/clients/:companyId/designated-admin',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      const { userId } = designatedAdminSchema.parse(request.body)
      return reply.send(await setDesignatedAdmin(companyId, userId, request.user.sub))
    }
  )

  app.post(
    '/clients/:companyId/documents/preview',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      const { carryConditions } = documentSendSchema.parse(request.body ?? undefined)
      return reply.send(await previewDocument(companyId, carryConditions, new Date()))
    }
  )

  app.post(
    '/clients/:companyId/documents/send',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      const { carryConditions } = documentSendSchema.parse(request.body ?? undefined)
      return reply
        .status(201)
        .send(await sendDocument(companyId, carryConditions, request.user.sub, new Date()))
    }
  )

  app.get('/documents/:id', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = documentIdParam.parse(request.params)
    return reply.send(await getDocumentForSuperadmin(id))
  })

  app.post(
    '/documents/:id/resend',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = documentIdParam.parse(request.params)
      return reply.send(await resendDocumentEmail(id, request.user.sub))
    }
  )

  app.post(
    '/documents/:id/cancel',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = documentIdParam.parse(request.params)
      const { reason } = documentCancelSchema.parse(request.body ?? undefined)
      return reply.send(await cancelDocument(id, reason, request.user.sub))
    }
  )

  app.put(
    '/clients/:companyId/amendment',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      const input = amendmentSchema.parse(request.body)
      return reply.send(await saveAmendment(companyId, input, request.user.sub, new Date()))
    }
  )

  app.post(
    '/clients/:companyId/amendment/withdraw',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      return reply.send(await withdrawAmendment(companyId, request.user.sub))
    }
  )
}
