// Leitura das licenças (plano 015, passo 4): GET /billing/me/seats para o
// contador de /users (quem tem users.manage na própria empresa; o SUPERADMIN
// com ?companyId=) e o campo seats do GET /billing/me.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'

const PERMISSIONS_BY_SUB: Record<string, string[]> = {
  'admin-seats': ['users.view', 'users.manage'],
  'sales-seats': [],
}

let app: FastifyInstance
let tokens: Record<string, string>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    super: app.jwt.sign({ sub: 'super-1', email: 's@example.com', role: 'SUPERADMIN' }),
    admin: app.jwt.sign({
      sub: 'admin-seats',
      email: 'a@example.com',
      role: 'ADMIN',
      companyId: COMPANY_A,
    }),
    sales: app.jwt.sign({
      sub: 'sales-seats',
      email: 'v@example.com',
      role: 'SALESPERSON',
      companyId: COMPANY_A,
    }),
  }
})

afterAll(async () => {
  await app.close()
})

const terms = (over: Record<string, unknown> = {}) => ({
  status: 'EFFECTIVE',
  version: 1,
  effectiveFrom: new Date('2026-09-01T12:00:00Z'),
  includedSeats: 20,
  extraSeats: 2,
  ...over,
})

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue({ active: true })
  prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A, name: 'Empresa Exemplo' })
  prismaMock.userPermission.findMany.mockImplementation(
    async (args: { where: { userId?: string | { in: string[] } } }) => {
      const userId = args.where.userId
      // A consulta dos gerentes entre os que ocupam licença
      if (typeof userId === 'object') return [{ userId: 'h-2' }]
      return (PERMISSIONS_BY_SUB[userId ?? ''] ?? []).map((key) => ({ permission: { key } }))
    }
  )
  prismaMock.user.findMany.mockResolvedValue([
    { id: 'h-1', name: 'Ana Exemplo', email: 'ana@example.com' },
    { id: 'h-2', name: 'Bruno Exemplo', email: 'bruno@example.com' },
  ])
})

const auth = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })

function contract(status: string, used: number, effective = [terms()]) {
  prismaMock.companyContract.findUnique.mockResolvedValue({ status, terms: effective })
  prismaMock.user.count.mockResolvedValue(used)
}

describe('GET /billing/me/seats', () => {
  it('ADMIN, contrato ativo 20 + 2 com 20 em uso', async () => {
    contract('ACTIVE', 20)
    const res = await app.inject({
      method: 'GET',
      url: '/billing/me/seats',
      headers: auth('admin'),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      contractStatus: 'ACTIVE',
      enforced: true,
      used: 20,
      limit: 22,
      available: 2,
      overLimit: false,
    })
    // A contagem é a da trava e a lista é dos vendedores e gerentes ativos
    expect(prismaMock.user.count.mock.calls[0][0].where).toEqual({
      companyId: COMPANY_A,
      role: 'SALESPERSON',
      active: true,
    })
    expect(res.json().holders).toEqual([
      { id: 'h-1', name: 'Ana Exemplo', email: 'ana@example.com', intelManager: false },
      { id: 'h-2', name: 'Bruno Exemplo', email: 'bruno@example.com', intelManager: true },
    ])
  })

  it('acima do limite (redução de pacote): overLimit, nenhuma livre, ninguém desativado', async () => {
    contract('ACTIVE', 24)
    const res = await app.inject({
      method: 'GET',
      url: '/billing/me/seats',
      headers: auth('admin'),
    })
    expect(res.json()).toMatchObject({ used: 24, limit: 22, available: 0, overLimit: true })
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it('termos com "vale a partir de" no futuro não mudam o limite', async () => {
    contract('ACTIVE', 20, [
      terms({ extraSeats: 0 }),
      terms({ version: 2, includedSeats: 30, effectiveFrom: new Date(Date.now() + 86_400_000) }),
    ])
    const res = await app.inject({
      method: 'GET',
      url: '/billing/me/seats',
      headers: auth('admin'),
    })
    expect(res.json()).toMatchObject({ limit: 20, available: 0, overLimit: false })
  })

  it('sem contrato: sem limite', async () => {
    prismaMock.user.count.mockResolvedValue(7)
    const res = await app.inject({
      method: 'GET',
      url: '/billing/me/seats',
      headers: auth('admin'),
    })
    expect(res.json()).toMatchObject({
      contractStatus: null,
      enforced: false,
      used: 7,
      limit: null,
      available: null,
      overLimit: false,
    })
  })

  it('contrato aguardando aceite: sem limite', async () => {
    contract('PENDING_ACCEPTANCE', 30)
    const res = await app.inject({
      method: 'GET',
      url: '/billing/me/seats',
      headers: auth('admin'),
    })
    expect(res.json()).toMatchObject({
      contractStatus: 'PENDING_ACCEPTANCE',
      enforced: false,
      limit: null,
      overLimit: false,
    })
  })

  it('SUPERADMIN sem companyId: 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/me/seats',
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(400)
  })

  it('SUPERADMIN com companyId: lê a empresa pedida', async () => {
    contract('ACTIVE', 3)
    const res = await app.inject({
      method: 'GET',
      url: `/billing/me/seats?companyId=${COMPANY_A}`,
      headers: auth('super'),
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.companyContract.findUnique.mock.calls[0][0].where).toEqual({
      companyId: COMPANY_A,
    })
  })

  it('ADMIN pedindo outra empresa: 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/billing/me/seats?companyId=${COMPANY_B}`,
      headers: auth('admin'),
    })
    expect(res.statusCode).toBe(403)
    expect(prismaMock.companyContract.findUnique).not.toHaveBeenCalled()
  })

  it('vendedor sem users.manage: 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/billing/me/seats',
      headers: auth('sales'),
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /billing/me — seats', () => {
  const myContract = (status: string) => ({
    companyId: COMPANY_A,
    status,
    startDate: new Date('2026-09-01T00:00:00Z'),
    graceMonths: 0,
    firstBilledCompetence: new Date('2026-10-01T00:00:00Z'),
    dueDay: 10,
    designatedAdmin: null,
    terms: [
      {
        ...terms(),
        licenseType: 'STANDARD',
        packagePrice: new Prisma.Decimal('2400'),
        extraSeatPrice: new Prisma.Decimal('99'),
        package: { code: 'P20', name: 'Pacote 20' },
      },
    ],
  })

  it('contrato ativo: as licenças vêm junto do plano', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue(myContract('ACTIVE'))
    prismaMock.user.count.mockResolvedValue(20)
    const res = await app.inject({ method: 'GET', url: '/billing/me', headers: auth('admin') })
    expect(res.statusCode).toBe(200)
    expect(res.json().currentTerms).toMatchObject({ includedSeats: 20, extraSeats: 2 })
    expect(res.json().seats).toMatchObject({ enforced: true, used: 20, limit: 22, available: 2 })
  })

  it('contrato aguardando aceite: licenças sem limite', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue({
      ...myContract('PENDING_ACCEPTANCE'),
      terms: [],
    })
    const res = await app.inject({ method: 'GET', url: '/billing/me', headers: auth('admin') })
    expect(res.json().seats).toMatchObject({ enforced: false, limit: null })
  })
})
