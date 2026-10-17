// Bloqueio por rota (plano 017): o authenticate devolve 403 COMPANY_BLOCKED
// para empresa bloqueada ou desativada em toda rota de negócio, por qualquer
// guarda (authenticate, requirePermission, requireCompanyScope e o hook de
// /uploads), e deixa passar só /auth/me, /auth/me/permissions e /billing/me/*.
// O SUPERADMIN nunca é bloqueado; empresa ausente ou sem o campo `active`
// também não.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../test-utils/prisma-mock'
import { buildApp } from '../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const ADMIN = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
const DOC = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3'
const BLOCKED_AT = new Date('2026-10-25T12:00:00Z')

let app: FastifyInstance
let tokens: Record<string, string>

// O que o user.findUnique devolve: a consulta do authenticate e a do /auth/me
// leem o mesmo mock. `company: undefined` = linha sem empresa nenhuma.
let userActive: boolean
let company: Record<string, unknown> | undefined

function userRow() {
  return {
    id: ADMIN,
    name: 'Ana Exemplo',
    email: 'ana@example.com',
    role: 'ADMIN',
    active: userActive,
    createdAt: new Date('2026-01-01T12:00:00Z'),
    idVendProt: null,
    companyId: COMPANY_A,
    servedCities: [],
    managerId: null,
    ...(company === undefined ? {} : { company }),
  }
}

const companyRow = (over: Record<string, unknown> = {}) => ({
  name: 'Distribuidora Exemplo',
  intelligenceEnabled: false,
  intelligenceConfig: null,
  active: true,
  accessBlockedAt: null,
  accessBlockReason: null,
  ...over,
})

const OVERDUE = { accessBlockedAt: BLOCKED_AT, accessBlockReason: 'OVERDUE' }

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    admin: app.jwt.sign({
      sub: ADMIN,
      email: 'ana@example.com',
      role: 'ADMIN',
      companyId: COMPANY_A,
    }),
    super: app.jwt.sign({ sub: 'super-1', email: 's@example.com', role: 'SUPERADMIN' }),
  }
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  userActive = true
  company = companyRow(OVERDUE)
  prismaMock.user.findUnique.mockImplementation(async () => userRow())
  // users.manage para o ADMIN: GET /users e GET /billing/me/seats passam da permissão
  prismaMock.userPermission.findMany.mockResolvedValue([
    { permission: { key: 'users.view' } },
    { permission: { key: 'users.manage' } },
  ])
})

const auth = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })

const get = (url: string, who: keyof typeof tokens = 'admin') =>
  app.inject({ method: 'GET', url, headers: auth(who) })

function expectBlocked(res: { statusCode: number; json: () => unknown }, reason: string) {
  expect(res.statusCode).toBe(403)
  expect(res.json()).toEqual({
    message: 'Acesso da empresa suspenso. Fale com o administrador.',
    code: 'COMPANY_BLOCKED',
    reason,
  })
}

function expectNotBlocked(res: { statusCode: number; body: string }) {
  const code = (() => {
    try {
      return (JSON.parse(res.body) as { code?: unknown }).code
    } catch {
      return undefined
    }
  })()
  expect(code).not.toBe('COMPANY_BLOCKED')
}

describe('empresa bloqueada por atraso: 403 nas rotas de negócio', () => {
  it('GET /customers (authenticate + requireCompany)', async () => {
    expectBlocked(await get('/customers'), 'OVERDUE')
    expect(prismaMock.customer.findMany).not.toHaveBeenCalled()
  })

  it('GET /users (requirePermission)', async () => {
    expectBlocked(await get('/users'), 'OVERDUE')
  })

  it('GET /companies/:id com ADMIN (requireCompanyScope)', async () => {
    expectBlocked(await get(`/companies/${COMPANY_A}`), 'OVERDUE')
  })

  it('GET /uploads/qualquer.png (hook onRequest)', async () => {
    expectBlocked(await get('/uploads/qualquer.png'), 'OVERDUE')
  })

  it('o bloqueio não gasta consulta a mais: só a do usuário, com a empresa no select', async () => {
    await get('/customers')
    expect(prismaMock.user.findUnique).toHaveBeenCalledTimes(1)
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: ADMIN },
      select: {
        active: true,
        company: { select: { active: true, accessBlockedAt: true, accessBlockReason: true } },
      },
    })
    expect(prismaMock.company.findUnique).not.toHaveBeenCalled()
  })
})

describe('empresa bloqueada: as exceções continuam abertas', () => {
  it('GET /auth/me → 200 com company.access', async () => {
    const res = await get('/auth/me')
    expect(res.statusCode).toBe(200)
    expect(res.json().company.access).toEqual({ blocked: true, reason: 'OVERDUE' })
  })

  it('GET /auth/me/permissions → 200', async () => {
    const res = await get('/auth/me/permissions')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ keys: ['users.view', 'users.manage'] })
  })

  it('GET /billing/me, /billing/me/documents e /billing/me/invoices → 200', async () => {
    for (const url of ['/billing/me', '/billing/me/documents', '/billing/me/invoices']) {
      const res = await get(url)
      expect(res.statusCode, url).toBe(200)
    }
  })

  it('GET /billing/me/seats → 200 (a guarda dela é requireAnyPermission)', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      id: COMPANY_A,
      name: 'Distribuidora Exemplo',
    })
    const res = await get('/billing/me/seats')
    expect(res.statusCode).toBe(200)
  })

  it('GET /billing/me/documents/:id → não é COMPANY_BLOCKED (o documento não existe: 404)', async () => {
    const res = await get(`/billing/me/documents/${DOC}`)
    expectNotBlocked(res)
    expect(res.statusCode).toBe(404)
  })

  it('POST de aceite (014) e de pedido de licenças (015) → não é COMPANY_BLOCKED', async () => {
    const accept = await app.inject({
      method: 'POST',
      url: `/billing/me/documents/${DOC}/accept`,
      headers: auth('admin'),
      payload: { sha256: 'ab'.repeat(32) },
    })
    expectNotBlocked(accept)
    const request = await app.inject({
      method: 'POST',
      url: '/billing/me/license-requests',
      headers: auth('admin'),
      payload: { quantity: 1, unitPrice: '99.00' },
    })
    expectNotBlocked(request)
  })
})

describe('quem nunca é bloqueado', () => {
  it('SUPERADMIN, mesmo com o mock devolvendo empresa bloqueada → GET /companies 200', async () => {
    company = companyRow({ ...OVERDUE, active: false })
    const res = await get('/companies', 'super')
    expect(res.statusCode).toBe(200)
  })

  it('usuário sem empresa ({ active: true }) passa', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true })
    const res = await get('/customers')
    expect(res.statusCode).toBe(200)
  })

  it('empresa sem o campo active ({ intelligenceEnabled: true }) passa', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      company: { intelligenceEnabled: true },
    })
    const res = await get('/customers')
    expect(res.statusCode).toBe(200)
  })

  it('empresa ativa e liberada passa', async () => {
    company = companyRow()
    const res = await get('/customers')
    expect(res.statusCode).toBe(200)
  })
})

describe('outros motivos e a ordem das checagens', () => {
  it('empresa desativada sem bloqueio → 403 INACTIVE, e /auth/me com reason INACTIVE', async () => {
    company = companyRow({ active: false })
    expectBlocked(await get('/customers'), 'INACTIVE')
    const me = await get('/auth/me')
    expect(me.statusCode).toBe(200)
    expect(me.json().company.access).toEqual({ blocked: true, reason: 'INACTIVE' })
  })

  it('usuário inativo com empresa bloqueada → 401 (a ordem não muda)', async () => {
    userActive = false
    const res = await get('/customers')
    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({ message: 'Usuário inativo' })
  })

  it('accessBlockedAt gravado sem motivo → 403 OVERDUE', async () => {
    company = companyRow({ accessBlockedAt: BLOCKED_AT, accessBlockReason: null })
    expectBlocked(await get('/customers'), 'OVERDUE')
  })

  it('MANUAL gravado no mock (reservado, como se gravado à mão) → 403 MANUAL', async () => {
    company = companyRow({ accessBlockedAt: BLOCKED_AT, accessBlockReason: 'MANUAL' })
    expectBlocked(await get('/customers'), 'MANUAL')
  })
})
