// GET /admin/billing/dashboard (plano 018): só o SUPERADMIN, cinco consultas
// (uma de cada, com 1 ou com 3 empresas), nada por empresa e nada de SQL cru.
// A rota usa o relógio de verdade: as datas dos fixtures ficam longe de hoje
// (contratos aceitos no passado, carência até 2099). Empresas fictícias.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { Prisma } from '@prisma/client'
import { CLIENT_STATUS_ORDER } from '@addere/types'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'

let app: FastifyInstance
let tokens: Record<string, string>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    super: app.jwt.sign({ sub: 'super-1', email: 's@a.com', role: 'SUPERADMIN' }),
    adminA: app.jwt.sign({ sub: 'admin-a', email: 'a@a.com', role: 'ADMIN', companyId: COMPANY_A }),
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
  // A forma do 017: o authenticate lê o usuário com a empresa (null = SUPERADMIN)
  prismaMock.user.findUnique.mockResolvedValue({ active: true, company: null })
  prismaMock.userPermission.findMany.mockResolvedValue([])
})

const get = (who?: keyof typeof tokens) =>
  app.inject({
    method: 'GET',
    url: '/admin/billing/dashboard',
    headers: who ? { authorization: `Bearer ${tokens[who]}` } : {},
  })

const dec = (v: string) => new Prisma.Decimal(v)
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

// Linhas na forma do select de dashboard.service.ts
const terms = (over: Record<string, unknown>) => ({
  version: 1,
  status: 'EFFECTIVE',
  effectiveFrom: new Date('2026-05-15T15:00:00Z'),
  includedSeats: 10,
  extraSeats: 0,
  packagePrice: dec('0.00'),
  extraSeatPrice: dec('0.00'),
  ...over,
})

const companyRow = (
  id: string,
  name: string,
  contract: Record<string, unknown> | null,
  over: Record<string, unknown> = {}
) => ({ id, name, active: true, accessBlockedAt: null, accessBlockReason: null, contract, ...over })

// As cinco empresas do esboço: A e B fora da carência, C em carência, D
// aguardando aceite e E cancelada
const fiveCompanies = [
  companyRow('company-a', 'Mercado Sol Ltda', {
    status: 'ACTIVE',
    graceMonths: 0,
    firstBilledCompetence: day('2026-09-01'),
    terms: [terms({ extraSeats: 2, packagePrice: dec('1500.00'), extraSeatPrice: dec('120.00') })],
  }),
  companyRow('company-b', 'Distribuidora Norte', {
    status: 'ACTIVE',
    graceMonths: 0,
    firstBilledCompetence: day('2026-06-01'),
    terms: [
      terms({
        includedSeats: 100,
        extraSeats: 5,
        packagePrice: dec('9000.00'),
        extraSeatPrice: dec('85.50'),
      }),
    ],
  }),
  companyRow('company-c', 'Casa do Campo Ltda', {
    status: 'ACTIVE',
    graceMonths: 2,
    firstBilledCompetence: day('2099-01-01'),
    terms: [terms({ includedSeats: 20, packagePrice: dec('1000.00') })],
  }),
  companyRow('company-d', 'Empório Vale Claro', {
    status: 'PENDING_ACCEPTANCE',
    graceMonths: 0,
    firstBilledCompetence: null,
    // a consulta só traz EFFECTIVE: os termos PROPOSED de D não chegam
    terms: [],
  }),
  companyRow(
    'company-e',
    'Atacado Ponte Alta',
    {
      status: 'CANCELLED',
      graceMonths: 0,
      firstBilledCompetence: day('2026-03-01'),
      terms: [terms({ packagePrice: dec('800.00') })],
    },
    { active: false }
  ),
]

function expectFiveQueriesOnce() {
  expect(prismaMock.company.findMany).toHaveBeenCalledTimes(1)
  expect(prismaMock.invoice.findMany).toHaveBeenCalledTimes(1)
  expect(prismaMock.contractDocument.findMany).toHaveBeenCalledTimes(1)
  expect(prismaMock.licenseRequest.findMany).toHaveBeenCalledTimes(1)
  expect(prismaMock.user.groupBy).toHaveBeenCalledTimes(1)
}

function expectNothingPerCompany() {
  expect(prismaMock.companyContract.findUnique).not.toHaveBeenCalled()
  expect(prismaMock.companyContract.findFirst).not.toHaveBeenCalled()
  expect(prismaMock.contractTerms.findMany).not.toHaveBeenCalled()
  expect(prismaMock.invoice.findFirst).not.toHaveBeenCalled()
  expect(prismaMock.invoice.aggregate).not.toHaveBeenCalled()
  expect(prismaMock.user.count).not.toHaveBeenCalled()
  expect(prismaMock.company.findUnique).not.toHaveBeenCalled()
  expect(prismaMock.$queryRaw).not.toHaveBeenCalled()
  expect(prismaMock.$transaction).not.toHaveBeenCalled()
}

describe('GET /admin/billing/dashboard — quem acessa', () => {
  it('SUPERADMIN → 200 com as chaves do DTO e o MRR das cinco empresas', async () => {
    prismaMock.company.findMany.mockResolvedValue(fiveCompanies)
    prismaMock.user.groupBy.mockResolvedValue([
      { companyId: 'company-a', _count: { _all: 13 } },
      { companyId: 'company-b', _count: { _all: 95 } },
      { companyId: 'company-c', _count: { _all: 18 } },
      { companyId: 'company-d', _count: { _all: 30 } },
    ])

    const res = await get('super')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(Object.keys(body).sort()).toEqual(
      [
        'generatedAt',
        'today',
        'mrr',
        'clientsByStatus',
        'seats',
        'receivable',
        'overdueInvoices',
        'upcomingInvoices',
        'pendingAcceptance',
        'pendingLicenseRequests',
        'nearSeatLimit',
        'revenue12m',
      ].sort()
    )
    // A consulta aninhada chega inteira à agregação
    expect(body.mrr).toEqual({
      contracted: '12167.50',
      billable: '11167.50',
      activeContracts: 3,
      graceContracts: 1,
    })
    expect(body.seats).toEqual({ used: 126, limit: 137 })
    expect(body.clientsByStatus).toMatchObject({
      CURRENT: 2,
      IN_GRACE: 1,
      AWAITING_ACCEPTANCE: 1,
      CANCELLED: 1,
    })
  })

  it.each(['adminA', 'salesA'] as const)('%s → 403, sem consulta', async (who) => {
    prismaMock.user.findUnique.mockResolvedValue({
      active: true,
      company: { active: true, accessBlockedAt: null, accessBlockReason: null },
    })
    const res = await get(who)
    expect(res.statusCode).toBe(403)
    expect(res.json().message).toBe('Acesso restrito ao super administrador')
    expect(prismaMock.company.findMany).not.toHaveBeenCalled()
    expect(prismaMock.invoice.findMany).not.toHaveBeenCalled()
  })

  it('sem token → 401', async () => {
    const res = await get()
    expect(res.statusCode).toBe(401)
    expect(prismaMock.company.findMany).not.toHaveBeenCalled()
  })
})

describe('GET /admin/billing/dashboard — consultas', () => {
  it.each([1, 3])(
    'com %i empresa(s): cinco consultas, uma de cada, nada por empresa',
    async (n) => {
      const companies = fiveCompanies.slice(0, n)
      prismaMock.company.findMany.mockResolvedValue(companies)
      prismaMock.invoice.findMany.mockResolvedValue(
        companies.map((c, i) => ({
          id: `inv-${i}`,
          number: i + 1,
          companyId: c.id,
          competence: day('2020-01-01'),
          dueDate: day('2020-02-10'),
          status: 'OPEN',
          total: dec('100.00'),
          paidAt: null,
          paidAmount: null,
        }))
      )
      prismaMock.contractDocument.findMany.mockResolvedValue(
        companies.map((c, i) => ({
          id: `doc-${i}`,
          companyId: c.id,
          kind: 'AMENDMENT',
          status: 'SENT',
          sentAt: new Date('2026-10-01T12:00:00Z'),
        }))
      )
      prismaMock.licenseRequest.findMany.mockResolvedValue(
        companies.map((c, i) => ({
          id: `req-${i}`,
          companyId: c.id,
          quantity: 2,
          status: 'PENDING',
          createdAt: new Date('2026-10-01T12:00:00Z'),
        }))
      )

      const res = await get('super')
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.receivable.overdue).toEqual({ count: n, amount: `${n}00.00` })
      expect(body.pendingAcceptance.total).toBe(n)
      expect(body.pendingLicenseRequests.total).toBe(n)

      expectFiveQueriesOnce()
      expectNothingPerCompany()

      // Os filtros que a agregação pressupõe
      const invoiceWhere = prismaMock.invoice.findMany.mock.calls[0][0].where
      expect(invoiceWhere.status).toEqual({ not: 'CANCELLED' })
      expect(invoiceWhere.OR[0]).toEqual({ status: 'OPEN' })
      expect(prismaMock.contractDocument.findMany.mock.calls[0][0].where).toEqual({
        status: 'SENT',
      })
      expect(prismaMock.licenseRequest.findMany.mock.calls[0][0].where).toEqual({
        status: 'PENDING',
      })
      expect(prismaMock.user.groupBy.mock.calls[0][0].where).toEqual({
        role: 'SALESPERSON',
        active: true,
        companyId: { not: null },
      })
      // Os termos atuais são escolhidos em memória: a consulta não ordena nem corta
      const termsSelect = prismaMock.company.findMany.mock.calls[0][0].select.contract.select.terms
      expect(termsSelect.where).toEqual({ status: 'EFFECTIVE' })
      expect(termsSelect).not.toHaveProperty('take')
      expect(termsSelect).not.toHaveProperty('orderBy')
    }
  )

  it('banco vazio → 200, tudo zerado, sete situações em 0 e 12 meses em "0.00"', async () => {
    const res = await get('super')
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.mrr).toEqual({
      contracted: '0.00',
      billable: '0.00',
      activeContracts: 0,
      graceContracts: 0,
    })
    expect(Object.keys(body.clientsByStatus)).toEqual([...CLIENT_STATUS_ORDER])
    expect(Object.values(body.clientsByStatus)).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(body.seats).toEqual({ used: 0, limit: 0 })
    for (const key of ['open', 'overdue', 'dueNext15Days', 'receivedThisMonth']) {
      expect(body.receivable[key]).toEqual({ count: 0, amount: '0.00' })
    }
    for (const key of [
      'overdueInvoices',
      'upcomingInvoices',
      'pendingAcceptance',
      'pendingLicenseRequests',
      'nearSeatLimit',
    ]) {
      expect(body[key]).toEqual({ total: 0, items: [] })
    }
    expect(body.revenue12m).toHaveLength(12)
    for (const m of body.revenue12m) {
      expect(m).toMatchObject({ billed: '0.00', received: '0.00' })
    }
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled()
  })
})
