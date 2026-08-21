// Rotas admin das consultas configuráveis (E3, tela W3) — prefixo /intel/admin/queries
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requirePermission, requireAnyPermission } from '../../../middleware/authenticate'
import { resolveTenant } from '../../../middleware/resolve-tenant'
import { userRateLimit } from '../../../lib/rate-limit'
import {
  queryNameSchema,
  upsertQuerySchema,
  reconcileSchema,
} from './queries.schema'
import {
  listQueries,
  saveDraft,
  previewQuery,
  reconcileQuery,
  publishQuery,
} from './queries.service'

function parseName(request: FastifyRequest, reply: FastifyReply) {
  const parsed = queryNameSchema.safeParse((request.params as { name?: string }).name)
  if (!parsed.success) {
    reply.status(400).send({ message: 'Consulta desconhecida' })
    return null
  }
  return parsed.data
}

export default async function queriesRoutes(app: FastifyInstance) {
  const adminOnly = requirePermission('intel.admin')
  const adminOrManager = requireAnyPermission('intel.admin', 'intel.manager')

  // GET / — estado dos 5 contratos + chip de metas via API
  app.get('/', { preHandler: [adminOrManager] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    return reply.send(await listQueries(company))
  })

  // PUT /:name — salva rascunho (nova versão quando a atual está publicada)
  app.put('/:name', { preHandler: [adminOnly] }, async (request, reply) => {
    const name = parseName(request, reply)
    if (!name) return
    const body = upsertQuerySchema.parse(request.body)
    const company = await resolveTenant(request, reply, 'body')
    if (!company) return
    return reply.send(await saveDraft(company, name, body, request.user.sub))
  })

  // POST /:name/preview — prévia de 7 dias com checks (200 com ok:false em falha)
  app.post(
    '/:name/preview',
    { preHandler: [adminOnly, userRateLimit(6, '1 minute')] },
    async (request, reply) => {
      const name = parseName(request, reply)
      if (!name) return
      const company = await resolveTenant(request, reply, 'body')
      if (!company) return
      return reply.send(await previewQuery(company, name, request.user.sub))
    }
  )

  // POST /:name/reconcile — compara um mês fechado com o número oficial
  app.post(
    '/:name/reconcile',
    { preHandler: [adminOnly, userRateLimit(2, '1 minute')] },
    async (request, reply) => {
      const name = parseName(request, reply)
      if (!name) return
      const body = reconcileSchema.parse(request.body)
      const company = await resolveTenant(request, reply, 'body')
      if (!company) return
      return reply.send(
        await reconcileQuery(company, name, body.period, body.refAmount, request.user.sub)
      )
    }
  )

  // POST /:name/publish — só com prévia verde e reconciliação dentro da tolerância
  app.post('/:name/publish', { preHandler: [adminOnly] }, async (request, reply) => {
    const name = parseName(request, reply)
    if (!name) return
    const company = await resolveTenant(request, reply, 'body')
    if (!company) return
    return reply.send(await publishQuery(company, name, request.user.sub))
  })
}
