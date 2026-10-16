// Trava de licenças (plano 015, passo 3) nas rotas de usuário da empresa: os
// caminhos 2, 4 e 5. As rotas não têm try/catch: o AppError vai para o handler
// global com status, code e details. Contrato ACTIVE com limite 22 (20 + 2) e
// 22 em uso, salvo quando o caso diz outro. Setup no molde de
// companies-scope.test.ts.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const TARGET = '33333333-3333-4333-8333-333333333333'

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
  }
})

afterAll(async () => {
  await app.close()
})

function seatsInUse(used: number, status = 'ACTIVE') {
  prismaMock.companyContract.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.companyContract.findUnique.mockResolvedValue({ id: 'contract-1', status })
  prismaMock.contractTerms.findMany.mockResolvedValue([
    {
      status: 'EFFECTIVE',
      version: 1,
      effectiveFrom: new Date('2026-09-01T12:00:00Z'),
      includedSeats: 20,
      extraSeats: 2,
    },
  ])
  prismaMock.user.count.mockResolvedValue(used)
}

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue({ active: true })
  prismaMock.userPermission.findMany.mockResolvedValue([])
  seatsInUse(22)
})

const auth = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })

const newSeller = {
  name: 'Vendedor Novo',
  email: 'novo@example.com',
  password: 'senha12345',
  role: 'SALESPERSON',
}

describe('POST /companies/:id/users — caminho 2', () => {
  it('no limite: 409 SEAT_LIMIT_REACHED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${COMPANY_A}/users`,
      headers: auth('adminA'),
      payload: newSeller,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({
      code: 'SEAT_LIMIT_REACHED',
      details: { used: 22, limit: 22 },
    })
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it('contrato cancelado: 409 CONTRACT_CANCELLED', async () => {
    seatsInUse(0, 'CANCELLED')
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${COMPANY_A}/users`,
      headers: auth('adminA'),
      payload: newSeller,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('CONTRACT_CANCELLED')
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it('contrato aguardando aceite: sem limite, cria', async () => {
    seatsInUse(500, 'PENDING_ACCEPTANCE')
    prismaMock.user.create.mockResolvedValue({ id: 'novo', role: 'SALESPERSON' })
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${COMPANY_A}/users`,
      headers: auth('adminA'),
      payload: newSeller,
    })
    expect(res.statusCode).toBe(201)
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1)
  })

  it('ADMIN é grátis: cria sem passar pela trava', async () => {
    prismaMock.user.create.mockResolvedValue({ id: 'novo', role: 'ADMIN' })
    const res = await app.inject({
      method: 'POST',
      url: `/companies/${COMPANY_A}/users`,
      headers: auth('super'),
      payload: { ...newSeller, role: 'ADMIN' },
    })
    expect(res.statusCode).toBe(201)
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })
})

describe('PATCH /companies/:id/users/:userId/active — caminho 4', () => {
  it('reativar vendedor no limite: 409', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: TARGET,
      role: 'SALESPERSON',
      active: false,
      companyId: COMPANY_A,
    })
    const res = await app.inject({
      method: 'PATCH',
      url: `/companies/${COMPANY_A}/users/${TARGET}/active`,
      headers: auth('adminA'),
      payload: { active: true },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('SEAT_LIMIT_REACHED')
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('desativar no limite: passa e invalida as sessões', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: TARGET,
      role: 'SALESPERSON',
      active: true,
      companyId: COMPANY_A,
    })
    prismaMock.user.update.mockResolvedValue({ id: TARGET, active: false })
    const res = await app.inject({
      method: 'PATCH',
      url: `/companies/${COMPANY_A}/users/${TARGET}/active`,
      headers: auth('adminA'),
      payload: { active: false },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.refreshToken.deleteMany).toHaveBeenCalled()
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })
})

describe('PATCH /companies/:id/users/:userId — caminho 5', () => {
  it('ADMIN ativo para vendedor no limite: 409 e ninguém é deslogado', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: TARGET,
      role: 'ADMIN',
      active: true,
      companyId: COMPANY_A,
    })
    const res = await app.inject({
      method: 'PATCH',
      url: `/companies/${COMPANY_A}/users/${TARGET}`,
      headers: auth('adminA'),
      payload: { role: 'SALESPERSON' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('SEAT_LIMIT_REACHED')
    expect(prismaMock.refreshToken.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('abaixo do limite: troca o papel e invalida as sessões dentro da escrita', async () => {
    seatsInUse(21)
    prismaMock.user.findFirst.mockResolvedValue({
      id: TARGET,
      role: 'ADMIN',
      active: true,
      companyId: COMPANY_A,
    })
    prismaMock.user.update.mockResolvedValue({ id: TARGET, role: 'SALESPERSON' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/companies/${COMPANY_A}/users/${TARGET}`,
      headers: auth('adminA'),
      payload: { role: 'SALESPERSON' },
    })
    expect(res.statusCode).toBe(200)
    const lockOrder = prismaMock.companyContract.updateMany.mock.invocationCallOrder[0]
    const logoutOrder = prismaMock.refreshToken.deleteMany.mock.invocationCallOrder[0]
    const updateOrder = prismaMock.user.update.mock.invocationCallOrder[0]
    expect(lockOrder).toBeLessThan(logoutOrder)
    expect(logoutOrder).toBeLessThan(updateOrder)
  })

  it('editar o nome de um vendedor no limite não passa pela trava', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: TARGET,
      role: 'SALESPERSON',
      active: true,
      companyId: COMPANY_A,
    })
    prismaMock.user.update.mockResolvedValue({ id: TARGET, name: 'Ana' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/companies/${COMPANY_A}/users/${TARGET}`,
      headers: auth('adminA'),
      payload: { name: 'Ana' },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })
})
