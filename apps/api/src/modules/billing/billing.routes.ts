import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireSuperAdmin } from '../../middleware/authenticate'
import {
  clientSchema,
  companyIdParam,
  contractDraftSchema,
  llmBudgetSchema,
  llmEvalSchema,
  llmModelSchema,
  packageActiveSchema,
  packageCreateSchema,
  packageIdParam,
  packageUpdateSchema,
  settingsSchema,
  unblockClientSchema,
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
import { getBillingDashboard } from './dashboard.service'
import {
  decideLicenseRequestSchema,
  licenseRequestIdParam,
  listLicenseRequestsQuerySchema,
} from './license-requests.schema'
import { decideLicenseRequest, listLicenseRequests } from './license-requests.service'
import { getLlmUsage, listLlmUsage, updateLlmBudget } from './llm-usage.service'
import { startLlmEval, updateLlmModel } from './llm-model.service'
import { unblockClient } from './overdue-block.service'

// Gestão Addere (plano 013) — registrado com o prefixo /admin/billing. Só o
// SUPERADMIN opera o módulo (decisão padrão 8); o autor de cada ação, gravado
// no histórico, é request.user.sub.
export default async function billingAdminRoutes(app: FastifyInstance) {
  const superadmin = { preHandler: requireSuperAdmin }

  // ─── Painel (plano 018) ────────────────────────────────────────────────────
  // Só leitura: MRR, situação dos clientes, licenças, faturas e pendências

  app.get('/dashboard', superadmin, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await getBillingDashboard(new Date()))
  })

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

  // ─── Custo de IA: consumo do agente em R$ e orçamento mensal ───────────────
  app.get('/llm-usage', superadmin, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await listLlmUsage(new Date()))
  })

  app.get(
    '/clients/:companyId/llm-usage',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      return reply.send(await getLlmUsage(companyId, new Date()))
    }
  )

  app.put(
    '/clients/:companyId/llm-budget',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      const input = llmBudgetSchema.parse(request.body)
      return reply.send(await updateLlmBudget(companyId, input, request.user.sub))
    }
  )

  // Teste de modelo: o eval roda em segundo plano; a ficha acompanha pelo GET
  app.post(
    '/clients/:companyId/llm-eval',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      const { model } = llmEvalSchema.parse(request.body)
      return reply.status(202).send(await startLlmEval(companyId, model))
    }
  )

  app.put(
    '/clients/:companyId/llm-model',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      const { model } = llmModelSchema.parse(request.body)
      return reply.send(await updateLlmModel(companyId, model, request.user.sub))
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

  // ─── Acesso (plano 017) ────────────────────────────────────────────────────
  // Só "Liberar até…". Não existe a rota de bloqueio: o bloqueio manual está
  // desabilitado desde 15/10/2026 (o contrato só prevê suspensão por atraso,
  // depois do aviso de 10 dias), e o bloqueio por atraso é do agendador.

  app.post(
    '/clients/:companyId/unblock',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      const { until } = unblockClientSchema.parse(request.body ?? {})
      return reply.send(await unblockClient(companyId, { until }, request.user.sub, new Date()))
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
