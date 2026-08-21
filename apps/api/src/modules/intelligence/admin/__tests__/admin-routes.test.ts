// Testes de integração das rotas admin da Inteligência (E3) — app.inject com
// o prisma mockado (test-utils/prisma-mock) e o adapter SQL sintético (mock).
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { buildApp } from '../../../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'

const companyRow = {
  id: COMPANY_A,
  name: 'Empresa A',
  apiMetaVend: 'https://erp/meta',
  apiSql: 'https://erp/rest/WSQUERY',
  intelligenceEnabled: false,
  intelligenceConfig: null,
}

// SQL de vendas válido para a guarda + adapter mock (janela via BETWEEN)
const VALID_SALES_SQL = `SELECT D2_DOC AS pedido, D2_ITEM AS item, D2_EMISSAO AS data,
D2_CLIENTE AS cliente_cod, D2_LOJA AS cliente_loja, A1_VEND AS vendedor_cod,
D2_COD AS produto_cod, D2_QUANT AS quantidade, D2_TOTAL AS valor
FROM SD2010 WHERE D_E_L_E_T_ = ' ' AND D2_FILIAL IN ({{FILIAL}})
AND D2_EMISSAO BETWEEN {{DATA_INI}} AND {{DATA_FIM}}`

const fakeQueryRow = (over: Record<string, unknown> = {}) => ({
  id: 'query-1',
  name: 'SALES',
  scope: 'ALL',
  sql: VALID_SALES_SQL,
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
  createdAt: new Date('2026-08-20T12:00:00Z'),
  updatedAt: new Date('2026-08-20T12:00:00Z'),
  ...over,
})

// Permissões por usuário (o serviço consulta userPermission.findMany por userId)
const PERMISSIONS_BY_SUB: Record<string, string[]> = {
  'admin-a': ['intel.admin'],
  'manager-a': ['intel.manager'],
  'sales-a': [],
}

let app: FastifyInstance
let tokens: Record<string, string>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    'admin-a': app.jwt.sign({ sub: 'admin-a', email: 'a@a.com', role: 'ADMIN', companyId: COMPANY_A }),
    'manager-a': app.jwt.sign({ sub: 'manager-a', email: 'm@a.com', role: 'ADMIN', companyId: COMPANY_A }),
    'sales-a': app.jwt.sign({ sub: 'sales-a', email: 's@a.com', role: 'SALESPERSON', companyId: COMPANY_A }),
  }
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue({ active: true })
  prismaMock.userPermission.findMany.mockImplementation(
    async (args: { where: { userId: string } }) =>
      (PERMISSIONS_BY_SUB[args.where.userId] ?? []).map((key) => ({ permission: { key } }))
  )
  prismaMock.company.findUnique.mockResolvedValue({ ...companyRow })
})

const auth = (sub: string) => ({ authorization: `Bearer ${tokens[sub]}` })

describe('autenticação e permissões', () => {
  it('sem token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/intel/admin/queries' })
    expect(res.statusCode).toBe(401)
  })

  it('vendedor sem intel.* → 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/admin/queries',
      headers: auth('sales-a'),
    })
    expect(res.statusCode).toBe(403)
  })

  it('intel.manager lê consultas e parâmetros, mas não grava', async () => {
    const read = await app.inject({
      method: 'GET',
      url: '/intel/admin/parameters',
      headers: auth('manager-a'),
    })
    expect(read.statusCode).toBe(200)

    const write = await app.inject({
      method: 'PUT',
      url: '/intel/admin/parameters',
      headers: auth('manager-a'),
      payload: { parameters: [{ key: 'late_factor', value: 1.5 }] },
    })
    expect(write.statusCode).toBe(403)
  })

  it('ADMIN da empresa A pedindo companyId da B → 403', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/intel/admin/queries/SALES',
      headers: auth('admin-a'),
      payload: { companyId: COMPANY_B, sql: 'SELECT 1' },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('GET /intel/admin/queries', () => {
  it('lista os 5 contratos com status e chip de metas via API', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/admin/queries',
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.contracts).toHaveLength(5)
    expect(body.contracts.map((c: { name: string }) => c.name).sort()).toEqual([
      'CUSTOMERS',
      'OPEN_TITLES',
      'PRODUCTS',
      'SALES',
      'STOCK',
    ])
    expect(body.contracts.every((c: { status: string }) => c.status === 'missing')).toBe(true)
    expect(body.goalMeta.viaApi).toBe(true)
    expect(body.sqlEndpointConfigured).toBe(true)
  })
})

describe('PUT /intel/admin/queries/:name', () => {
  it('SQL proibido → 422 com as violações da guarda', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/intel/admin/queries/SALES',
      headers: auth('admin-a'),
      payload: { sql: 'DELETE FROM SD2010' },
    })
    expect(res.statusCode).toBe(422)
    const body = res.json()
    expect(body.message).toMatch(/guarda/)
    expect(Array.isArray(body.details)).toBe(true)
    expect(body.details.length).toBeGreaterThan(0)
  })

  it('SQL válido → cria rascunho v1', async () => {
    prismaMock.intelQuery.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => fakeQueryRow(args.data)
    )
    const res = await app.inject({
      method: 'PUT',
      url: '/intel/admin/queries/SALES',
      headers: auth('admin-a'),
      payload: { sql: VALID_SALES_SQL },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.version).toBe(1)
    expect(body.published).toBe(false)
  })

  it('editar versão publicada gera nova versão em rascunho', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(
      fakeQueryRow({ published: true, version: 3 })
    )
    prismaMock.intelQuery.create.mockImplementation(
      async (args: { data: Record<string, unknown> }) => fakeQueryRow(args.data)
    )
    const res = await app.inject({
      method: 'PUT',
      url: '/intel/admin/queries/SALES',
      headers: auth('admin-a'),
      payload: { sql: VALID_SALES_SQL },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().version).toBe(4)
    expect(prismaMock.intelQuery.update).not.toHaveBeenCalled()
  })

  it('nome de consulta desconhecido → 400', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/intel/admin/queries/FATURAMENTO',
      headers: auth('admin-a'),
      payload: { sql: 'SELECT 1' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /intel/admin/queries/:name/preview', () => {
  it('roda contra o adapter mock e devolve checks verdes', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(fakeQueryRow())
    prismaMock.branch.findMany.mockResolvedValue([{ idProtheus: '0101' }])
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/SALES/preview',
      headers: auth('admin-a'),
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.rows.length).toBeGreaterThan(0)
    expect(body.rows.length).toBeLessThanOrEqual(50)
    expect(body.checks.every((c: { ok: boolean }) => c.ok)).toBe(true)
    // Prévia verde marca a versão como validada
    expect(prismaMock.intelQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ validatedAt: expect.any(Date) }),
      })
    )
  })

  it('sem filial cadastrada → 200 com ok:false (check de placeholders)', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(fakeQueryRow())
    prismaMock.branch.findMany.mockResolvedValue([])
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/SALES/preview',
      headers: auth('admin-a'),
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(false)
    const placeholderCheck = body.checks.find((c: { key: string }) => c.key === 'placeholders')
    expect(placeholderCheck.ok).toBe(false)
  })

  it('consulta não configurada → 404', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/SALES/preview',
      headers: auth('admin-a'),
      payload: {},
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('POST /intel/admin/queries/:name/reconcile', () => {
  it('soma o mês no adapter mock, grava o diff e sugere causas fora da tolerância', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(fakeQueryRow())
    prismaMock.branch.findMany.mockResolvedValue([{ idProtheus: '0101' }])
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/SALES/reconcile',
      headers: auth('admin-a'),
      payload: { period: '202607', refAmount: 1 },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.period).toBe('202607')
    expect(Number(body.calcAmount)).toBeGreaterThan(1)
    expect(body.withinTolerance).toBe(false)
    expect(body.probableCauses.length).toBeGreaterThan(0)
    expect(prismaMock.intelQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reconciliationPeriod: '202607' }),
      })
    )
  })

  it('período mal formado → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/SALES/reconcile',
      headers: auth('admin-a'),
      payload: { period: '2026-07', refAmount: 1000 },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /intel/admin/queries/:name/publish', () => {
  it('sem prévia validada → 422', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(fakeQueryRow())
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/SALES/publish',
      headers: auth('admin-a'),
      payload: {},
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().message).toMatch(/prévia/)
  })

  it('validada e reconciliada dentro da tolerância → publica', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(
      fakeQueryRow({ validatedAt: new Date(), reconciliationDiffPct: 1.2 })
    )
    prismaMock.intelQuery.update.mockResolvedValue(
      fakeQueryRow({ published: true, publishedAt: new Date() })
    )
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/SALES/publish',
      headers: auth('admin-a'),
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().published).toBe(true)
    // Despublica as versões anteriores na mesma transação
    expect(prismaMock.intelQuery.updateMany).toHaveBeenCalled()
  })

  it('reconciliação fora da tolerância → 422', async () => {
    prismaMock.intelQuery.findFirst.mockResolvedValue(
      fakeQueryRow({ validatedAt: new Date(), reconciliationDiffPct: 7.5 })
    )
    const res = await app.inject({
      method: 'POST',
      url: '/intel/admin/queries/SALES/publish',
      headers: auth('admin-a'),
      payload: {},
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().message).toMatch(/tolerância/)
  })
})

describe('rotas de jobs', () => {
  it('POST /run dispara e responde 202; com lock ativo responde 409', async () => {
    prismaMock.intelJobRun.create.mockResolvedValue({ id: 'run-1' })
    const first = await app.inject({
      method: 'POST',
      url: '/intel/admin/jobs/run',
      headers: auth('admin-a'),
      payload: { job: 'nightly' },
    })
    expect(first.statusCode).toBe(202)
    expect(first.json().runId).toBe('run-1')

    prismaMock.intelJobRun.findFirst.mockResolvedValue({ id: 'run-1' })
    const second = await app.inject({
      method: 'POST',
      url: '/intel/admin/jobs/run',
      headers: auth('admin-a'),
      payload: { job: 'nightly' },
    })
    expect(second.statusCode).toBe(409)
  })

  it('GET /status resume a última execução por job', async () => {
    prismaMock.intelJobRun.findMany.mockResolvedValue([
      {
        id: 'r2',
        job: 'NIGHTLY',
        status: 'OK',
        startedAt: new Date(),
        finishedAt: new Date(),
        error: null,
      },
      {
        id: 'r1',
        job: 'NIGHTLY',
        status: 'ERROR',
        startedAt: new Date(Date.now() - 3600_000),
        finishedAt: new Date(),
        error: 'x',
      },
    ])
    const res = await app.inject({
      method: 'GET',
      url: '/intel/admin/jobs/status',
      headers: auth('manager-a'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.latest).toHaveLength(1)
    expect(body.latest[0].id).toBe('r2')
    expect(body.recent).toHaveLength(2)
  })
})

describe('rotas de config e parâmetros', () => {
  it('GET config devolve defaults quando não configurada', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/intel/admin/config',
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.intelligenceEnabled).toBe(false)
    expect(body.config.syncHour).toBe(3)
    expect(body.config.defaultTone).toBe('informal')
  })

  it('PUT config liga a camada e persiste o merge', async () => {
    prismaMock.company.update.mockResolvedValue({
      intelligenceEnabled: true,
      intelligenceConfig: { syncHour: 4 },
    })
    const res = await app.inject({
      method: 'PUT',
      url: '/intel/admin/config',
      headers: auth('admin-a'),
      payload: { intelligenceEnabled: true, config: { syncHour: 4 } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().config.syncHour).toBe(4)
  })

  it('PUT parameters com valor inválido → 422', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/intel/admin/parameters',
      headers: auth('admin-a'),
      payload: { parameters: [{ key: 'late_factor', value: -2 }] },
    })
    expect(res.statusCode).toBe(422)
  })

  it('PUT parameters grava override + histórico', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/intel/admin/parameters',
      headers: auth('admin-a'),
      payload: {
        parameters: [
          { key: 'late_factor', value: 1.5 },
          { key: 'visited_cooldown_days', value: 10 },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().updated).toBe(2)
    expect(prismaMock.intelParameter.upsert).toHaveBeenCalledTimes(2)
    expect(prismaMock.intelParameterHistory.createMany).toHaveBeenCalledTimes(1)
  })

  it('GET parameters mescla defaults com overrides do tenant', async () => {
    prismaMock.intelParameter.findMany.mockResolvedValue([
      {
        key: 'late_factor',
        value: 1.5,
        segment: '',
        changedBy: 'admin-a',
        updatedAt: new Date(),
      },
    ])
    const res = await app.inject({
      method: 'GET',
      url: '/intel/admin/parameters',
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    const late = body.parameters.find((p: { key: string }) => p.key === 'late_factor')
    expect(late.value).toBe(1.5)
    expect(late.isDefault).toBe(false)
    const risk = body.parameters.find((p: { key: string }) => p.key === 'risk_days')
    expect(risk.value).toBe(90)
    expect(risk.isDefault).toBe(true)
  })
})
