import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import axios from 'axios'
import { prisma } from '@addere/db'
import { authenticate } from '../../middleware/authenticate'
import { syncProducts, syncCustomers } from './sync.service'
import { decryptCredential } from '../../lib/protheus-crypto'
import { assertSafeUrl } from '../../lib/url-validator'

const companyIdSchema = z.object({ companyId: z.string().uuid('companyId deve ser um UUID válido') })

export default async function syncRoutes(app: FastifyInstance) {
  // POST /sync/test-token — testa a chamada de autenticação Protheus e retorna resposta bruta
  app.post('/test-token', { preHandler: authenticate }, async (request, reply) => {
    const { role, companyId: userCompanyId } = request.user as { role: string; companyId: string | null }

    if (role === 'SALESPERSON') {
      return reply.status(403).send({ message: 'Acesso negado' })
    }

    const bodyParsed = companyIdSchema.safeParse(request.body)
    if (!bodyParsed.success) {
      return reply.status(400).send({ message: 'companyId inválido', errors: bodyParsed.error.flatten() })
    }
    const { companyId } = bodyParsed.data

    // ADMIN só pode testar a própria empresa
    if (role === 'ADMIN' && companyId !== userCompanyId) {
      return reply.status(403).send({ message: 'Acesso negado' })
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) return reply.status(404).send({ message: 'Empresa não encontrada' })

    if (!company.apiToken || !company.usrProtheus || !company.passProtheus) {
      return reply.status(422).send({ message: 'Configure apiToken, usrProtheus e passProtheus antes de testar.' })
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

  // POST /sync/test-products — busca página 1 da API de produtos e retorna resposta bruta (sem salvar)
  app.post('/test-products', { preHandler: authenticate }, async (request, reply) => {
    const { role, companyId: userCompanyId } = request.user as { role: string; companyId: string | null }

    if (role === 'SALESPERSON') {
      return reply.status(403).send({ message: 'Acesso negado' })
    }

    const bodyParsed = companyIdSchema.safeParse(request.body)
    if (!bodyParsed.success) {
      return reply.status(400).send({ message: 'companyId inválido', errors: bodyParsed.error.flatten() })
    }
    const { companyId } = bodyParsed.data

    // ADMIN só pode testar a própria empresa
    if (role === 'ADMIN' && companyId !== userCompanyId) {
      return reply.status(403).send({ message: 'Acesso negado' })
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: { branches: { where: { active: true }, take: 1 } },
    })
    if (!company) return reply.status(404).send({ message: 'Empresa não encontrada' })

    if (!company.apiPord) {
      return reply.status(422).send({ message: 'Configure apiPord antes de testar.' })
    }
    if (!company.apiToken || !company.usrProtheus || !company.passProtheus) {
      return reply.status(422).send({ message: 'Configure apiToken, usrProtheus e passProtheus antes de testar.' })
    }

    // ── Passo 1: obter token ──────────────────────────────────────────────────
    let token: string
    try {
      await assertSafeUrl(company.apiToken, 'apiToken')
      await assertSafeUrl(company.apiPord, 'apiPord')

      const senha = decryptCredential(company.passProtheus)
      const params = new URLSearchParams()
      params.set('grant_type', 'password')
      params.set('username', company.usrProtheus)
      params.set('password', senha)

      const tokenRes = await axios.post(company.apiToken, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      })
      token = (tokenRes.data as Record<string, unknown>)['access_token'] as string
        ?? (tokenRes.data as Record<string, unknown>)['token'] as string
      if (!token) {
        return reply.send({ ok: false, step: 'token', error: 'Token não encontrado na resposta', tokenData: tokenRes.data })
      }
    } catch (err: unknown) {
      const e = err as { response?: { status: number; data: unknown }; message: string }
      return reply.send({ ok: false, step: 'token', error: e.message, status: e.response?.status, data: e.response?.data })
    }

    // ── Passo 2: buscar página 1 de produtos ─────────────────────────────────
    const filial = company.branches[0]?.idProtheus ?? ''
    const requestBody = { limite: 50, deslocamento: 1, B2_FILIAL: filial, DA1_FILIAL: filial, INTERV: 0 }

    try {
      const t0 = Date.now()
      const prodRes = await axios.post(company.apiPord, requestBody, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      })
      const ms = Date.now() - t0
      return reply.send({ ok: true, status: prodRes.status, ms, requestBody, data: prodRes.data })
    } catch (err: unknown) {
      const e = err as { response?: { status: number; data: unknown }; message: string }
      return reply.send({ ok: false, step: 'produtos', error: e.message, status: e.response?.status, data: e.response?.data })
    }
  })

  // POST /sync/test-customers — busca página 1 da API de clientes e retorna resposta bruta (sem salvar)
  app.post('/test-customers', { preHandler: authenticate }, async (request, reply) => {
    const { role, companyId: userCompanyId } = request.user as { role: string; companyId: string | null }

    if (role === 'SALESPERSON') {
      return reply.status(403).send({ message: 'Acesso negado' })
    }

    const bodyParsed = companyIdSchema.safeParse(request.body)
    if (!bodyParsed.success) {
      return reply.status(400).send({ message: 'companyId inválido', errors: bodyParsed.error.flatten() })
    }
    const { companyId } = bodyParsed.data

    if (role === 'ADMIN' && companyId !== userCompanyId) {
      return reply.status(403).send({ message: 'Acesso negado' })
    }

    const company = await prisma.company.findUnique({ where: { id: companyId } })
    if (!company) return reply.status(404).send({ message: 'Empresa não encontrada' })

    if (!company.apiCliente) {
      return reply.status(422).send({ message: 'Configure apiCliente antes de testar.' })
    }
    if (!company.apiToken || !company.usrProtheus || !company.passProtheus) {
      return reply.status(422).send({ message: 'Configure apiToken, usrProtheus e passProtheus antes de testar.' })
    }

    // ── Passo 1: obter token ──────────────────────────────────────────────────
    let token: string
    try {
      await assertSafeUrl(company.apiToken, 'apiToken')
      await assertSafeUrl(company.apiCliente, 'apiCliente')

      const senha = decryptCredential(company.passProtheus)
      const params = new URLSearchParams()
      params.set('grant_type', 'password')
      params.set('username', company.usrProtheus)
      params.set('password', senha)

      const tokenRes = await axios.post(company.apiToken, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
      })
      token = (tokenRes.data as Record<string, unknown>)['access_token'] as string
        ?? (tokenRes.data as Record<string, unknown>)['token'] as string
      if (!token) {
        return reply.send({ ok: false, step: 'token', error: 'Token não encontrado na resposta', tokenData: tokenRes.data })
      }
    } catch (err: unknown) {
      const e = err as { response?: { status: number; data: unknown }; message: string }
      return reply.send({ ok: false, step: 'token', error: e.message, status: e.response?.status, data: e.response?.data })
    }

    // ── Passo 2: buscar página 1 de clientes ─────────────────────────────────
    const requestBody = { limite: 100, deslocamento: 1 }
    try {
      const t0 = Date.now()
      const custRes = await axios.post(company.apiCliente, requestBody, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      })
      const ms = Date.now() - t0
      return reply.send({ ok: true, status: custRes.status, ms, requestBody, data: custRes.data })
    } catch (err: unknown) {
      const e = err as { response?: { status: number; data: unknown }; message: string }
      return reply.send({ ok: false, step: 'clientes', error: e.message, status: e.response?.status, data: e.response?.data })
    }
  })

  // POST /sync/products — importa produtos do Protheus (ADMIN ou SUPERADMIN)
  app.post('/products', { preHandler: authenticate, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { role, companyId: userCompanyId } = request.user as { role: string; companyId: string | null }

    if (role === 'SALESPERSON') {
      return reply.status(403).send({ message: 'Acesso negado' })
    }

    const bodyParsed = companyIdSchema.safeParse(request.body)
    if (!bodyParsed.success) {
      return reply.status(400).send({ message: 'companyId inválido', errors: bodyParsed.error.flatten() })
    }
    const { companyId } = bodyParsed.data

    if (role === 'ADMIN' && companyId !== userCompanyId) {
      return reply.status(403).send({ message: 'Acesso negado' })
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
  app.post('/customers', { preHandler: authenticate, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { role, companyId: userCompanyId } = request.user as { role: string; companyId: string | null }

    if (role === 'SALESPERSON') {
      return reply.status(403).send({ message: 'Acesso negado' })
    }

    const bodyParsed = companyIdSchema.safeParse(request.body)
    if (!bodyParsed.success) {
      return reply.status(400).send({ message: 'companyId inválido', errors: bodyParsed.error.flatten() })
    }
    const { companyId } = bodyParsed.data

    if (role === 'ADMIN' && companyId !== userCompanyId) {
      return reply.status(403).send({ message: 'Acesso negado' })
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
