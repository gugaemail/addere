import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireSuperAdmin } from '../../middleware/authenticate'
import {
  templateCreateSchema,
  templateIdParam,
  templatePreviewSchema,
  templateUpdateSchema,
} from './contract-templates.schema'
import {
  createTemplateVersion,
  getTemplate,
  listTemplates,
  previewTemplate,
  publishTemplate,
  updateTemplate,
} from './contract-templates.service'

// Modelos de contrato (plano 014) — registrado com o prefixo
// /admin/billing/contract-templates. Só o SUPERADMIN; o autor é request.user.sub.
export default async function contractTemplatesRoutes(app: FastifyInstance) {
  const superadmin = { preHandler: requireSuperAdmin }

  app.get('/', superadmin, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await listTemplates())
  })

  app.get('/:id', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = templateIdParam.parse(request.params)
    return reply.send(await getTemplate(id))
  })

  app.post('/', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const input = templateCreateSchema.parse(request.body)
    return reply.status(201).send(await createTemplateVersion(input, request.user.sub))
  })

  app.put('/:id', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = templateIdParam.parse(request.params)
    const input = templateUpdateSchema.parse(request.body)
    return reply.send(await updateTemplate(id, input))
  })

  app.post('/:id/preview', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = templateIdParam.parse(request.params)
    const { companyId } = templatePreviewSchema.parse(request.body)
    return reply.send(await previewTemplate(id, companyId, new Date()))
  })

  app.post('/:id/publish', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = templateIdParam.parse(request.params)
    return reply.send(await publishTemplate(id, request.user.sub))
  })
}
