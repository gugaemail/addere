import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireSuperAdmin } from '../../middleware/authenticate'
import {
  packageActiveSchema,
  packageCreateSchema,
  packageIdParam,
  packageUpdateSchema,
  settingsSchema,
} from './billing.schema'
import {
  createPackage,
  getSettings,
  listPackages,
  setPackageActive,
  updatePackage,
  updateSettings,
} from './catalog.service'

// Gestão Addere (plano 013) — registrado com o prefixo /admin/billing. Só o
// SUPERADMIN opera o módulo (decisão padrão 8); o autor de cada ação, gravado
// no histórico, é request.user.sub.
export default async function billingAdminRoutes(app: FastifyInstance) {
  const superadmin = { preHandler: requireSuperAdmin }

  // ─── Pacotes ───────────────────────────────────────────────────────────────

  app.get('/packages', superadmin, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await listPackages())
  })

  app.post('/packages', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const input = packageCreateSchema.parse(request.body)
    return reply.status(201).send(await createPackage(input, request.user.sub))
  })

  app.patch('/packages/:id', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = packageIdParam.parse(request.params)
    const input = packageUpdateSchema.parse(request.body)
    return reply.send(await updatePackage(id, input, request.user.sub))
  })

  app.patch(
    '/packages/:id/active',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = packageIdParam.parse(request.params)
      const { active } = packageActiveSchema.parse(request.body)
      return reply.send(await setPackageActive(id, active, request.user.sub))
    }
  )

  // ─── Regras de cobrança ────────────────────────────────────────────────────

  app.get('/settings', superadmin, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await getSettings())
  })

  app.put('/settings', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const input = settingsSchema.parse(request.body)
    return reply.send(await updateSettings(input, request.user.sub))
  })
}
