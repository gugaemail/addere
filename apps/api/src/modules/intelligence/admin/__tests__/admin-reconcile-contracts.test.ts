// Rotas de reconciliação e publicação por contrato: vendas por mês fechado,
// títulos pelo saldo de hoje, clientes/produtos por contagem e estoque sem
// reconciliação. Usuários distintos por teste: a rota tem limite por minuto.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { buildApp } from '../../../../app'
import { reconciliationDiffPct } from '../queries.service'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const ADMINS = ['adm-1', 'adm-2', 'adm-3', 'adm-4', 'adm-5', 'adm-6', 'adm-7']

const companyRow = {
  id: COMPANY_A,
  name: 'Empresa A',
  apiSql: 'https://erp/rest/WSQUERY',
  intelligenceEnabled: true,
  intelligenceConfig: null,
}

const queryRow = (name: string, over: Record<string, unknown> = {}) => ({
  id: `query-${name}`,
  name,
  scope: 'ALL',
  sql: `SELECT 1 AS x FROM SA1010 WHERE A1_FILIAL IN ({{FILIAL}})`,
  definition: null,
  exclusions: null,
  gotchas: null,
  version: 1,
  validatedAt: null,
  validatedBy: null,
  reconciliationPeriod: null,
  reconciliationRefAmount: null,
  reconciliationCalcAmount: null,
  reconciliationDiffPct: null,
  published: false,
  publishedAt: null,
  companyId: COMPANY_A,
  createdAt: new Date('2026-09-01T12:00:00Z'),
  updatedAt: new Date('2026-09-01T12:00:00Z'),
  ...over,
})

let app: FastifyInstance
const tokens: Record<string, string> = {}

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  for (const sub of ADMINS) {
    tokens[sub] = app.jwt.sign({ sub, email: `${sub}@a.com`, role: 'ADMIN', companyId: COMPANY_A })
  }
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue({ active: true })
  prismaMock.userPermission.findMany.mockResolvedValue([{ permission: { key: 'intel.admin' } }])
  prismaMock.company.findUnique.mockResolvedValue({ ...companyRow })
  prismaMock.branch.findMany.mockResolvedValue([{ idProtheus: '0101' }])
})

const auth = (sub: string) => ({ authorization: `Bearer ${tokens[sub]}` })

describe('reconciliação por contrato', () => {
  it('títulos: sem mês, soma o saldo na posição de hoje e agrupa por mês de vencimento', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(queryRow('OPEN_TITLES'))
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/OPEN_TITLES/reconcile',
      headers: auth('adm-1'),
      payload: { refAmount: 63707.07 },
    })
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json()
    expect(body.kind).toBe('SUM_SNAPSHOT')
    expect(body.unit).toBe('currency')
    expect(body.period).toMatch(/^\d{8}$/)
    expect(body.audit.window).toBeNull()
    expect(body.audit.column).toBe('valor_saldo')
    expect(body.audit.dateGranularity).toBe('month')
    for (const group of body.audit.byDay) expect(group.date).toMatch(/^\d{6}$/)
    expect(prismaMock.intelQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ reconciliationPeriod: body.period }) })
    )
  })

  it('clientes: conta as linhas e devolve o total como quantidade', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(queryRow('CUSTOMERS'))
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/CUSTOMERS/reconcile',
      headers: auth('adm-2'),
      payload: { refAmount: 40 },
    })
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json()
    expect(body.kind).toBe('COUNT_SNAPSHOT')
    expect(body.unit).toBe('count')
    expect(Number(body.calcAmount)).toBe(body.audit.rows)
    expect(body.audit.column).toBeNull()
  })

  it('vendas sem mês → 400 pedindo o mês fechado', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(queryRow('SALES'))
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/SALES/reconcile',
      headers: auth('adm-3'),
      payload: { refAmount: 1000 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/mês fechado/)
  })

  it('estoque não reconcilia → 400 explicando que basta a prévia', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(queryRow('STOCK'))
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/STOCK/reconcile',
      headers: auth('adm-4'),
      payload: { refAmount: 1 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toMatch(/basta a prévia/)
  })

  it('exporta o CSV dos títulos sem período, com a data de hoje no nome', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(queryRow('OPEN_TITLES'))
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/OPEN_TITLES/reconcile/export',
      headers: auth('adm-5'),
      payload: {},
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.headers['content-disposition']).toMatch(/titulos-em-aberto-\d{8}\.csv/)
  })
})

describe('percentual da reconciliação', () => {
  // Teto da coluna reconciliationDiffPct: DECIMAL(12,2)
  const MAX = 9_999_999_999.99

  it('diferença comum vem com duas casas', () => {
    expect(reconciliationDiffPct(110, 100)).toBe(10)
    expect(reconciliationDiffPct(63_707.07, 63_707.07)).toBe(0)
  })

  it('total do ERP muito acima do oficial passa de 9999% — o que estourava DECIMAL(6,2)', () => {
    const pct = reconciliationDiffPct(6_500_000, 63_707.07)
    expect(pct).toBeGreaterThan(9_999.99)
    expect(Math.abs(pct)).toBeLessThanOrEqual(MAX)
  })

  it('oficial irrisório não gera valor fora da coluna', () => {
    expect(reconciliationDiffPct(1e15, 0.01)).toBe(MAX)
    // divisão que estoura o double cai no teto, nunca em Infinity
    expect(reconciliationDiffPct(1e300, 5e-324)).toBe(MAX)
  })
})

describe('publicação por contrato', () => {
  it('estoque publica só com a prévia ok, sem reconciliação', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(queryRow('STOCK', { validatedAt: new Date() }))
    prismaMock.intelQuery.update.mockResolvedValue(queryRow('STOCK', { published: true, publishedAt: new Date() }))
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/STOCK/publish',
      headers: auth('adm-6'),
      payload: {},
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json().published).toBe(true)
  })

  it('títulos sem reconciliação → 422 pedindo o número oficial de hoje', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(queryRow('OPEN_TITLES', { validatedAt: new Date() }))
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/OPEN_TITLES/publish',
      headers: auth('adm-7'),
      payload: {},
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().message).toMatch(/número oficial de hoje/)
  })
})
