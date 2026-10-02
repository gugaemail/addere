// Escopo de tenant do menu Empresas (E23): o ADMIN opera a própria empresa
// (cadastro e integração), o SUPERADMIN opera qualquer uma, e o que é global
// ou destrutivo — listar, criar, editar razão social e ligar/desligar — segue
// só do SUPERADMIN.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'

let app: FastifyInstance
let tokens: Record<string, string>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    super: app.jwt.sign({ sub: 'super-1', email: 's@a.com', role: 'SUPERADMIN' }),
    adminA: app.jwt.sign({
      sub: 'admin-a',
      email: 'a@a.com',
      role: 'ADMIN',
      companyId: COMPANY_A,
    }),
    salesA: app.jwt.sign({
      sub: 'sales-a',
      email: 'v@a.com',
      role: 'SALESPERSON',
      companyId: COMPANY_A,
    }),
  }
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue({ active: true })
  prismaMock.userPermission.findMany.mockResolvedValue([])
  prismaMock.company.findUnique.mockResolvedValue({
    id: COMPANY_A,
    name: 'Empresa A',
    cnpj: '00.000.000/0001-00',
    active: true,
    passProtheus: null,
    branches: [],
    users: [],
    _count: { orders: 0 },
  })
})

const auth = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })

describe('GET /companies/:id', () => {
  it('ADMIN abre a ficha da própria empresa', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/companies/${COMPANY_A}`,
      headers: auth('adminA'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ id: COMPANY_A })
  })

  it('ADMIN não alcança empresa de outro tenant', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/companies/${COMPANY_B}`,
      headers: auth('adminA'),
    })
    expect(res.statusCode).toBe(403)
    expect(prismaMock.company.findUnique).not.toHaveBeenCalled()
  })

  it('vendedor não entra nem na própria empresa', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/companies/${COMPANY_A}`,
      headers: auth('salesA'),
    })
    expect(res.statusCode).toBe(403)
  })

  it('sem token, 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/companies/${COMPANY_A}` })
    expect(res.statusCode).toBe(401)
  })
})

describe('integração Protheus — o que o ADMIN foi liberado a fazer', () => {
  it('PATCH /:id/protheus na própria empresa', async () => {
    prismaMock.company.update.mockResolvedValue({ id: COMPANY_A, passProtheus: null })
    const res = await app.inject({
      method: 'PATCH',
      url: `/companies/${COMPANY_A}/protheus`,
      headers: auth('adminA'),
      payload: { apiMetaVend: 'https://erp.exemplo/meta' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('PATCH /:id/protheus de outro tenant é barrado antes do banco', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/companies/${COMPANY_B}/protheus`,
      headers: auth('adminA'),
      payload: { apiMetaVend: 'https://erp.exemplo/meta' },
    })
    expect(res.statusCode).toBe(403)
    expect(prismaMock.company.update).not.toHaveBeenCalled()
  })

  it('GET /:id/customers da própria empresa', async () => {
    prismaMock.customer.findMany.mockResolvedValue([])
    const res = await app.inject({
      method: 'GET',
      url: `/companies/${COMPANY_A}/customers`,
      headers: auth('adminA'),
    })
    expect(res.statusCode).toBe(200)
  })

  it('GET /:id/customers de outro tenant, 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/companies/${COMPANY_B}/customers`,
      headers: auth('adminA'),
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('o que continua exclusivo do SUPERADMIN', () => {
  it.each([
    ['GET', '/companies'],
    ['POST', '/companies'],
  ])('%s %s é negado ao ADMIN', async (method, url) => {
    const res = await app.inject({
      method: method as 'GET' | 'POST',
      url,
      headers: auth('adminA'),
      payload: method === 'POST' ? { name: 'Nova', cnpj: '00.000.000/0001-00' } : undefined,
    })
    expect(res.statusCode).toBe(403)
  })

  it('PATCH /:id (razão social/CNPJ) é negado ao ADMIN', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/companies/${COMPANY_A}`,
      headers: auth('adminA'),
      payload: { name: 'Outro nome' },
    })
    expect(res.statusCode).toBe(403)
    expect(prismaMock.company.update).not.toHaveBeenCalled()
  })

  it('PATCH /:id/active é negado ao ADMIN — não dá para se trancar para fora', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/companies/${COMPANY_A}/active`,
      headers: auth('adminA'),
      payload: { active: false },
    })
    expect(res.statusCode).toBe(403)
    expect(prismaMock.company.update).not.toHaveBeenCalled()
  })

  it('e o SUPERADMIN segue passando nas quatro', async () => {
    prismaMock.company.findMany.mockResolvedValue([])
    const res = await app.inject({ method: 'GET', url: '/companies', headers: auth('super') })
    expect(res.statusCode).toBe(200)
  })
})
