// Custo de IA por empresa (Gestão Addere): o mês corrente em São Paulo, preço
// do modelo de cada chamada, câmbio PTAX, orçamento e onde está gastando. Só o
// SUPERADMIN vê e altera o orçamento.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

const RATE = { rate: 5, quotedAt: '2026-10-29T16:11:53.000Z', stale: false }
vi.mock('../usd-brl', () => ({ getUsdBrlRate: async () => RATE }))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'
import { getLlmUsage, listLlmUsage, updateLlmBudget } from '../llm-usage.service'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
// 15h de 29/10 em São Paulo
const NOW = new Date('2026-10-29T18:00:00Z')

const sums = (input: number, output = 0, cacheWrite = 0, cacheRead = 0) => ({
  inputTokens: input,
  outputTokens: output,
  cacheCreationTokens: cacheWrite,
  cacheReadTokens: cacheRead,
})

function call(over: Partial<Record<string, unknown>> & { createdAt: Date }) {
  return {
    kind: 'today',
    vendorCode: '000001',
    source: 'llm',
    reason: null,
    attempts: 1,
    model: 'claude-sonnet-5',
    ...sums(0),
    ...over,
  }
}

beforeEach(() => {
  resetPrismaMock()
})

describe('listLlmUsage', () => {
  it('custo do mês por empresa em US$ e R$, com o % do orçamento', async () => {
    prismaMock.intelLlmCall.groupBy.mockResolvedValue([
      // Sonnet 5: 1M de entrada = US$ 2
      { companyId: 'c1', model: 'claude-sonnet-5', _sum: sums(1_000_000) },
      // Opus 5.5: 100k de saída = US$ 2
      { companyId: 'c1', model: 'claude-opus-5-5', _sum: sums(0, 100_000) },
      { companyId: 'c2', model: 'claude-sonnet-5', _sum: sums(500_000) },
    ])
    prismaMock.company.findMany.mockResolvedValue([
      { id: 'c1', llmMonthlyTokenBudget: 2_200_000, llmMonthlyBudgetBrl: '40.00' },
      { id: 'c2', llmMonthlyTokenBudget: null, llmMonthlyBudgetBrl: null },
      { id: 'c3', llmMonthlyTokenBudget: 1_000_000, llmMonthlyBudgetBrl: null },
      { id: 'c4', llmMonthlyTokenBudget: null, llmMonthlyBudgetBrl: null },
    ])

    const result = await listLlmUsage(NOW)

    expect(result.month).toBe('2026-10')
    expect(prismaMock.intelLlmCall.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdAt: { gte: new Date('2026-10-01T03:00:00Z') } } })
    )
    expect(result.total).toEqual({ tokens: 1_600_000, costUsd: 5, costBrl: 25 })
    const byId = Object.fromEntries(result.companies.map((c) => [c.companyId, c]))
    // R$ 20 de R$ 40 = 50%; 1,1M de 2,2M tokens = 50% — vale o maior
    expect(byId.c1).toMatchObject({ tokens: 1_100_000, costUsd: 4, costBrl: 20, budgetPct: 50 })
    expect(byId.c2).toMatchObject({ costBrl: 5, budgetPct: null })
    // Orçamento sem consumo aparece zerado; sem nenhum dos dois fica de fora
    expect(byId.c3).toMatchObject({ tokens: 0, costBrl: 0, budgetPct: 0 })
    expect(byId.c4).toBeUndefined()
  })
})

describe('getLlmUsage', () => {
  beforeEach(() => {
    prismaMock.company.findUnique.mockResolvedValue({
      llmMonthlyTokenBudget: 4_000_000,
      llmMonthlyBudgetBrl: '100.00',
    })
    prismaMock.user.findMany.mockResolvedValue([{ idVendProt: '000001', name: 'Ana Souza' }])
    prismaMock.intelLlmCall.findMany.mockResolvedValue([
      // 01/10 em São Paulo: home da Ana, 1M de entrada = US$ 2
      call({ createdAt: new Date('2026-10-01T12:00:00Z'), ...sums(1_000_000) }),
      // 28/10, 23h em São Paulo (já 29 em UTC): mensagem do eval, 2 tentativas
      call({
        createdAt: new Date('2026-10-29T02:00:00Z'),
        kind: 'message',
        vendorCode: 'eval',
        attempts: 2,
        ...sums(500_000, 50_000, 0, 1_000_000),
      }),
      // Teto diário bateu: só-motor sem modelo, nada a cobrar
      call({
        createdAt: new Date('2026-10-29T13:00:00Z'),
        source: 'engine',
        reason: 'daily_cap',
        attempts: 0,
        model: null,
      }),
      call({
        createdAt: new Date('2026-10-29T14:00:00Z'),
        source: 'cache',
        attempts: 0,
        model: null,
      }),
    ])
    prismaMock.intelLlmCall.groupBy.mockResolvedValue([
      { model: 'claude-sonnet-5', _sum: sums(250_000) },
    ])
  })

  it('totais, origens e economia do cache do mês', async () => {
    const usage = await getLlmUsage(COMPANY_A, NOW)

    // US$ 2 + (US$ 1 entrada + US$ 0,50 saída + US$ 0,20 leitura) = US$ 3,70
    expect(usage.totals).toMatchObject({
      tokens: 1_550_000,
      costUsd: 3.7,
      costBrl: 18.5,
      generations: 4,
      modelCalls: 3,
      cacheReadTokens: 1_000_000,
      cacheSavingsUsd: 1.8,
      cacheSavingsBrl: 9,
    })
    expect(usage.sources).toEqual({ llm: 2, cache: 1, engine: 1 })
    expect(usage.daysAtCap).toBe(1)
  })

  it('onde está gastando: por tipo de texto e por vendedor, do mais caro ao mais barato', async () => {
    const usage = await getLlmUsage(COMPANY_A, NOW)

    expect(usage.byKind.map((r) => [r.key, r.costUsd, r.pct])).toEqual([
      ['today', 2, 54.1],
      ['message', 1.7, 45.9],
    ])
    expect(usage.byVendor[0]).toMatchObject({ key: '000001', label: 'Ana Souza', generations: 3 })
    expect(usage.byVendor[1]).toMatchObject({ key: 'eval', label: null, costUsd: 1.7 })
  })

  it('dia a dia em São Paulo, do dia 1 até hoje', async () => {
    const usage = await getLlmUsage(COMPANY_A, NOW)

    expect(usage.daily).toHaveLength(29)
    expect(usage.daily[0]).toMatchObject({ date: '2026-10-01', costUsd: 2 })
    expect(usage.daily[27]).toMatchObject({ date: '2026-10-28', costUsd: 1.7 })
    expect(usage.daily[28]).toMatchObject({ date: '2026-10-29', costUsd: 0 })
  })

  it('orçamento, ritmo até o fim do mês e os meses anteriores', async () => {
    const usage = await getLlmUsage(COMPANY_A, NOW)

    expect(usage.budget).toEqual({ tokens: 4_000_000, brl: 100, tokensPct: 38.8, brlPct: 18.5 })
    // 28,625 dias decorridos de 31
    expect(usage.projection.costUsd).toBeCloseTo((3.7 * 31) / 28.625, 4)
    expect(usage.history.map((m) => [m.month, m.costUsd])).toEqual([
      ['2026-08', 0.5],
      ['2026-09', 0.5],
      ['2026-10', 3.7],
    ])
  })

  it('empresa que não existe: 404', async () => {
    prismaMock.company.findUnique.mockResolvedValue(null)
    await expect(getLlmUsage(COMPANY_A, NOW)).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('updateLlmBudget', () => {
  it('grava o orçamento e o histórico com os campos alterados', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      llmMonthlyTokenBudget: null,
      llmMonthlyBudgetBrl: '150.00',
    })
    prismaMock.company.update.mockResolvedValue({
      llmMonthlyTokenBudget: 3_000_000,
      llmMonthlyBudgetBrl: '150.00',
    })

    const budget = await updateLlmBudget(COMPANY_A, { tokens: 3_000_000, brl: 150 }, 'super-1')

    expect(budget).toEqual({ tokens: 3_000_000, brl: 150 })
    expect(prismaMock.billingEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'LLM_BUDGET_UPDATED',
        companyId: COMPANY_A,
        actorId: 'super-1',
        payload: { fields: ['llmMonthlyTokenBudget'] },
      }),
    })
  })

  it('nada mudou: não grava', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      llmMonthlyTokenBudget: 3_000_000,
      llmMonthlyBudgetBrl: '150.00',
    })

    await updateLlmBudget(COMPANY_A, { tokens: 3_000_000, brl: 150 }, 'super-1')

    expect(prismaMock.company.update).not.toHaveBeenCalled()
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  })
})

describe('rotas do custo de IA', () => {
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

  beforeEach(() => {
    prismaMock.user.findUnique.mockResolvedValue({ active: true })
  })

  const auth = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })

  it('ADMIN da empresa não vê o custo nem altera o orçamento', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/admin/billing/llm-usage',
      headers: auth('adminA'),
    })
    const detail = await app.inject({
      method: 'GET',
      url: `/admin/billing/clients/${COMPANY_A}/llm-usage`,
      headers: auth('adminA'),
    })
    const budget = await app.inject({
      method: 'PUT',
      url: `/admin/billing/clients/${COMPANY_A}/llm-budget`,
      headers: auth('adminA'),
      payload: { tokens: 1000, brl: null },
    })

    expect([list.statusCode, detail.statusCode, budget.statusCode]).toEqual([403, 403, 403])
    expect(prismaMock.company.update).not.toHaveBeenCalled()
  })

  it('SUPERADMIN vê a lista do mês', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/billing/llm-usage',
      headers: auth('super'),
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ rate: RATE, companies: [] })
  })

  it('orçamento negativo é recusado', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/admin/billing/clients/${COMPANY_A}/llm-budget`,
      headers: auth('super'),
      payload: { tokens: -5, brl: null },
    })

    expect(res.statusCode).toBe(400)
    expect(prismaMock.company.update).not.toHaveBeenCalled()
  })
})
