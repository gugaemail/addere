import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import axios from 'axios'
import { prisma } from '@addere/db'
import type { Company } from '@prisma/client'
import { authenticate, requirePermission } from '../../middleware/authenticate'
import { requireCompany, assertSameCompany } from '../../middleware/require-company'
import {
  syncProducts,
  syncCustomers,
  syncTransportadoras,
  syncCondPags,
  testOrderSync,
  fetchMetaVendedor,
} from './sync.service'
import { protheusPost } from './protheus.client'
import { getCredentials } from './utils'
import { decryptCredential } from '../../lib/protheus-crypto'
import { assertSafeUrl } from '../../lib/url-validator'
import { logProtheusCall } from './protheus-logger'

const companyIdSchema = z.object({
  companyId: z.string().uuid('companyId deve ser um UUID válido'),
})

// Preâmbulo comum das rotas que recebem companyId no body:
// valida o corpo e garante que ADMIN só opera na própria empresa.
// Retorna null quando a resposta já foi enviada (400/403/404).
async function resolveCompany(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<Company | null> {
  const parsed = companyIdSchema.safeParse(request.body)
  if (!parsed.success) {
    reply.status(400).send({ message: 'companyId inválido', errors: parsed.error.flatten() })
    return null
  }
  if (!assertSameCompany(request, reply, parsed.data.companyId)) return null

  const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId } })
  if (!company) {
    reply.status(404).send({ message: 'Empresa não encontrada' })
    return null
  }
  return company
}

export default async function syncRoutes(app: FastifyInstance) {
  const syncPermission = requirePermission('sync.protheus')
  const rateLimited = { rateLimit: { max: 3, timeWindow: '1 minute' } }

  // ── Rotas de sincronização (4 entidades, mesmo handler parametrizado) ──────
  const syncEndpoints: Array<{
    path: string
    label: string
    run: (companyId: string) => Promise<unknown>
  }> = [
    { path: '/products', label: 'produtos', run: syncProducts },
    { path: '/customers', label: 'clientes', run: syncCustomers },
    { path: '/transportadoras', label: 'transportadoras', run: syncTransportadoras },
    { path: '/cond-pags', label: 'condições de pagamento', run: syncCondPags },
  ]

  for (const endpoint of syncEndpoints) {
    app.post(
      endpoint.path,
      { preHandler: syncPermission, config: rateLimited },
      async (request, reply) => {
        const company = await resolveCompany(request, reply)
        if (!company) return

        try {
          const result = await endpoint.run(company.id)
          return reply.send(result)
        } catch (err) {
          // Erros de configuração (AppError 422) sobem para o handler global;
          // falhas de comunicação com o ERP viram 502
          if (err instanceof Error && 'statusCode' in err) throw err
          app.log.error({ err }, `Falha ao sincronizar ${endpoint.label} com Protheus`)
          return reply
            .status(502)
            .send({ message: err instanceof Error ? err.message : 'Erro desconhecido' })
        }
      }
    )
  }

  // ── Rotas de diagnóstico (test-*) ──────────────────────────────────────────
  // Retornam HTTP 200 com { ok: false, ... } em falha: o corpo É o relatório de
  // diagnóstico consumido pelo modal do painel admin.

  // POST /sync/test-token — testa a chamada de autenticação Protheus
  app.post('/test-token', { preHandler: syncPermission }, async (request, reply) => {
    const company = await resolveCompany(request, reply)
    if (!company) return

    if (!company.apiToken || !company.usrProtheus || !company.passProtheus) {
      return reply
        .status(422)
        .send({ message: 'Configure apiToken, usrProtheus e passProtheus antes de testar.' })
    }

    try {
      await assertSafeUrl(company.apiToken, 'apiToken')

      const senha = decryptCredential(company.passProtheus)
      const params = new URLSearchParams()
      params.set('grant_type', 'password')
      params.set('username', company.usrProtheus)
      params.set('password', senha)

      const t0 = Date.now()
      const tokenRes = await axios.post(company.apiToken, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      })
      const ms = Date.now() - t0

      await logProtheusCall({
        companyId: company.id,
        operation: 'testToken',
        endpointKey: 'apiToken',
        success: true,
        httpStatus: tokenRes.status,
        durationMs: ms,
      })

      // Não devolve o corpo — ele contém o access_token do Protheus.
      // Os nomes dos campos bastam para diagnosticar o tokenField configurado.
      return reply.send({
        ok: true,
        status: tokenRes.status,
        ms,
        fields: Object.keys((tokenRes.data ?? {}) as object),
      })
    } catch (err: unknown) {
      const e = err as { response?: { status: number }; message: string }
      await logProtheusCall({
        companyId: company.id,
        operation: 'testToken',
        endpointKey: 'apiToken',
        success: false,
        httpStatus: e.response?.status,
        errorMessage: e.message,
      })
      return reply.send({
        ok: false,
        status: e.response?.status ?? null,
        ms: null,
        error: e.message,
      })
    }
  })

  // Handler comum de test-products/test-customers: busca a página 1 da entidade
  // e retorna a resposta bruta (sem salvar), usando o cliente oficial protheusPost
  // (token cacheado, redirects validados) — antes cada rota reimplementava OAuth.
  function registerEntityTest(opts: {
    path: string
    step: string
    operation: string
    endpointKey: 'apiPord' | 'apiCliente'
    buildBody: (
      company: Company & { branches?: { idProtheus: string | null }[] }
    ) => Record<string, unknown>
    includeBranches?: boolean
  }) {
    app.post(opts.path, { preHandler: syncPermission }, async (request, reply) => {
      const parsed = companyIdSchema.safeParse(request.body)
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ message: 'companyId inválido', errors: parsed.error.flatten() })
      }
      if (!assertSameCompany(request, reply, parsed.data.companyId)) return

      const company = await prisma.company.findUnique({
        where: { id: parsed.data.companyId },
        ...(opts.includeBranches
          ? { include: { branches: { where: { active: true }, take: 1 } } }
          : {}),
      })
      if (!company) return reply.status(404).send({ message: 'Empresa não encontrada' })

      const url = company[opts.endpointKey]
      if (!url) {
        return reply.status(422).send({ message: `Configure ${opts.endpointKey} antes de testar.` })
      }
      if (!company.apiToken || !company.usrProtheus || !company.passProtheus) {
        return reply
          .status(422)
          .send({ message: 'Configure apiToken, usrProtheus e passProtheus antes de testar.' })
      }

      const requestBody = opts.buildBody(
        company as Company & { branches?: { idProtheus: string | null }[] }
      )

      try {
        const creds = getCredentials(company)
        const t0 = Date.now()
        const data = await protheusPost(company.id, url, requestBody, creds)
        const ms = Date.now() - t0
        await logProtheusCall({
          companyId: company.id,
          operation: opts.operation,
          endpointKey: opts.endpointKey,
          success: true,
          durationMs: ms,
        })
        return reply.send({ ok: true, ms, requestBody, data })
      } catch (err: unknown) {
        const e = err as { response?: { status?: number }; message: string }
        await logProtheusCall({
          companyId: company.id,
          operation: opts.operation,
          endpointKey: opts.endpointKey,
          success: false,
          httpStatus: e.response?.status,
          errorMessage: e.message,
        })
        return reply.send({
          ok: false,
          step: opts.step,
          error: e.message,
          status: e.response?.status,
        })
      }
    })
  }

  registerEntityTest({
    path: '/test-products',
    step: 'produtos',
    operation: 'testProducts',
    endpointKey: 'apiPord',
    includeBranches: true,
    buildBody: (company) => {
      const filial = company.branches?.[0]?.idProtheus ?? ''
      return { limite: 50, deslocamento: 1, B2_FILIAL: filial, DA1_FILIAL: filial, INTERV: 0 }
    },
  })

  registerEntityTest({
    path: '/test-customers',
    step: 'clientes',
    operation: 'testCustomers',
    endpointKey: 'apiCliente',
    buildBody: () => ({ limite: 50, deslocamento: 1, INTERV: 0 }),
  })

  // POST /sync/test-order/:id — dry run: monta payload e chama Protheus sem alterar status do pedido
  app.post(
    '/test-order/:id',
    { preHandler: [syncPermission, requireCompany] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      try {
        const result = await testOrderSync(id, request.user.companyId!)
        return reply.send(result)
      } catch (err: unknown) {
        const e = err as { message: string }
        return reply.send({ ok: false, error: e.message })
      }
    }
  )

  // GET /sync/metas — meta do vendedor no mês atual via apiMetaVend
  app.get('/metas', { preHandler: [authenticate, requireCompany] }, async (request, reply) => {
    try {
      const result = await fetchMetaVendedor(request.user.sub, request.user.companyId!)
      return reply.send(result)
    } catch (err) {
      if (err instanceof Error && 'statusCode' in err) throw err
      return reply
        .status(502)
        .send({ message: err instanceof Error ? err.message : 'Erro desconhecido' })
    }
  })
}
