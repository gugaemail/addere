import { FastifyInstance } from 'fastify'
import axios from 'axios'
import { prisma } from '@addere/db'
import { authenticate } from '../../middleware/authenticate'
import { syncProducts, syncCustomers } from './sync.service'
import { decryptCredential } from '../../lib/protheus-crypto'

export default async function syncRoutes(app: FastifyInstance) {
  // GET /sync/debug/:companyId — testa token e produtos, retorna respostas brutas (TEMPORÁRIO)
  app.get('/debug/:companyId', { preHandler: authenticate }, async (request, reply) => {
    const { companyId } = request.params as { companyId: string }
    const result: Record<string, unknown> = {}

    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) return reply.status(404).send({ message: 'Empresa não encontrada' })

    result.config = {
      apiToken:    company.apiToken,
      apiPord:     company.apiPord,
      usrProtheus: company.usrProtheus,
      passProtheus: company.passProtheus ? '(preenchida)' : '(vazia)',
    }

    // ── Passo 1: token ────────────────────────────────────────────────────────
    if (!company.apiToken || !company.usrProtheus || !company.passProtheus) {
      result.tokenStep = { ok: false, error: 'Credenciais incompletas na empresa' }
      return reply.send(result)
    }

    let token: string | null = null
    try {
      const senha = decryptCredential(company.passProtheus)
      const params = new URLSearchParams()
      params.set('grant_type', 'password')
      params.set('username', company.usrProtheus)
      params.set('password', senha)

      const tokenRes = await axios.post(company.apiToken, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      result.tokenStep = { ok: true, status: tokenRes.status, data: tokenRes.data }
      token = (tokenRes.data as Record<string, unknown>)['access_token'] as string
        ?? (tokenRes.data as Record<string, unknown>)['token'] as string
        ?? null
      result.tokenStep = { ...result.tokenStep as object, tokenFieldDetectado: token ? 'access_token ou token' : 'NENHUM — verifique o campo correto' }
    } catch (err: unknown) {
      const e = err as { response?: { status: number; data: unknown }; message: string }
      result.tokenStep = {
        ok: false,
        error: e.message,
        status: e.response?.status,
        data:   e.response?.data,
      }
      return reply.send(result)
    }

    if (!token) {
      result.tokenStep = { ...(result.tokenStep as object), ok: false, error: 'Token não encontrado na resposta acima' }
      return reply.send(result)
    }

    // ── Passo 2: produtos ─────────────────────────────────────────────────────
    if (!company.apiPord) {
      result.productsStep = { ok: false, error: 'apiPord não configurado' }
      return reply.send(result)
    }

    const branch = await prisma.branch.findFirst({ where: { companyId, active: true } })
    result.branch = branch ? { id: branch.id, name: branch.name, idProtheus: branch.idProtheus } : null

    try {
      const body = {
        limite:      5,
        deslocamento: 1,
        B2_FILIAL:   branch?.idProtheus ?? '',
        DA1_FILIAL:  branch?.idProtheus ?? '',
        INTERV:      0,
      }
      result.productsRequestBody = body

      const prodRes = await axios.post(company.apiPord, body, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      })
      result.productsStep = { ok: true, status: prodRes.status, data: prodRes.data }
    } catch (err: unknown) {
      const e = err as { response?: { status: number; data: unknown }; message: string }
      result.productsStep = {
        ok: false,
        error: e.message,
        status: e.response?.status,
        data:   e.response?.data,
      }
    }

    return reply.send(result)
  })

  // POST /sync/test-token — testa a chamada de autenticação Protheus e retorna resposta bruta
  app.post('/test-token', { preHandler: authenticate }, async (request, reply) => {
    const { role } = request.user as { role: string }
    const { companyId } = (request.body ?? {}) as { companyId?: string }

    if (role === 'SALESPERSON') {
      return reply.status(403).send({ message: 'Acesso negado' })
    }
    if (!companyId) {
      return reply.status(400).send({ message: 'companyId é obrigatório' })
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) return reply.status(404).send({ message: 'Empresa não encontrada' })

    if (!company.apiToken || !company.usrProtheus || !company.passProtheus) {
      return reply.status(422).send({ message: 'Configure apiToken, usrProtheus e passProtheus antes de testar.' })
    }

    try {
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

      return reply.send({
        ok: true,
        status: tokenRes.status,
        ms,
        data: tokenRes.data,
      })
    } catch (err: unknown) {
      const e = err as { response?: { status: number; data: unknown }; message: string }
      return reply.send({
        ok: false,
        status: e.response?.status ?? null,
        ms: null,
        error: e.message,
        data: e.response?.data ?? null,
      })
    }
  })

  // POST /sync/products — importa produtos do Protheus (ADMIN ou SUPERADMIN)
  app.post('/products', { preHandler: authenticate }, async (request, reply) => {
    const { role } = request.user as { role: string }
    const { companyId } = (request.body ?? {}) as { companyId?: string }

    if (role === 'SALESPERSON') {
      return reply.status(403).send({ message: 'Acesso negado' })
    }
    if (!companyId) {
      return reply.status(400).send({ message: 'companyId é obrigatório' })
    }

    try {
      const result = await syncProducts(companyId)
      return reply.send(result)
    } catch (err) {
      const msg = (err instanceof Error) ? err.message : 'Erro desconhecido'
      app.log.error({ err }, 'Falha ao sincronizar produtos com Protheus')
      return reply.status(502).send({ message: msg })
    }
  })

  // POST /sync/customers — importa clientes do Protheus (ADMIN ou SUPERADMIN)
  app.post('/customers', { preHandler: authenticate }, async (request, reply) => {
    const { role } = request.user as { role: string }
    const { companyId } = (request.body ?? {}) as { companyId?: string }

    if (role === 'SALESPERSON') {
      return reply.status(403).send({ message: 'Acesso negado' })
    }
    if (!companyId) {
      return reply.status(400).send({ message: 'companyId é obrigatório' })
    }

    try {
      const result = await syncCustomers(companyId)
      return reply.send(result)
    } catch (err) {
      const msg = (err instanceof Error) ? err.message : 'Erro desconhecido'
      app.log.error({ err }, 'Falha ao sincronizar clientes com Protheus')
      return reply.status(502).send({ message: msg })
    }
  })
}
