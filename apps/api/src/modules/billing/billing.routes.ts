import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireSuperAdmin } from '../../middleware/authenticate'
import {
  clientSchema,
  companyIdParam,
  contractDraftSchema,
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
import { getClient, listClientEvents, listClients, updateClient } from './clients.service'
import { saveContractDraft } from './contract.service'
import {
  decideLicenseRequestSchema,
  licenseRequestIdParam,
  listLicenseRequestsQuerySchema,
} from './license-requests.schema'
import { decideLicenseRequest, listLicenseRequests } from './license-requests.service'

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

  // ─── Clientes e contrato em rascunho ───────────────────────────────────────
  // A empresa é criada pelo POST /companies, que aceita o cadastro (plano 013)

  app.get('/clients', superadmin, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await listClients(new Date()))
  })

  app.get(
    '/clients/:companyId',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      return reply.send(await getClient(companyId, new Date()))
    }
  )

  app.put(
    '/clients/:companyId',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      const input = clientSchema.parse(request.body)
      return reply.send(await updateClient(companyId, input, request.user.sub))
    }
  )

  app.get(
    '/clients/:companyId/events',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      return reply.send(await listClientEvents(companyId))
    }
  )

  app.put(
    '/clients/:companyId/contract',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      const input = contractDraftSchema.parse(request.body)
      return reply.send(await saveContractDraft(companyId, input, request.user.sub))
    }
  )

  // ─── Pedidos de licenças (plano 015) ───────────────────────────────────────

  app.get('/license-requests', superadmin, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = listLicenseRequestsQuerySchema.parse(request.query)
    return reply.send(await listLicenseRequests(query))
  })

  app.post(
    '/license-requests/:id/decide',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = licenseRequestIdParam.parse(request.params)
      const body = decideLicenseRequestSchema.parse(request.body)
      return reply.send(await decideLicenseRequest(id, body, request.user.sub, new Date()))
    }
  )
}
