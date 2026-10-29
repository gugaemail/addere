// Modelo do agente por empresa (custo de IA): o teste é o eval rodando como
// job, e a troca só passa com o eval mais recente daquele modelo aprovado.
// Voltar ao modelo do ambiente é sempre livre. Só o SUPERADMIN mexe.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())
vi.mock('../../intelligence/agent/client', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  llmAvailable: vi.fn(() => true),
}))
vi.mock('../../intelligence/jobs/run-job', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  startJobRun: vi.fn(),
}))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'
import { llmAvailable } from '../../intelligence/agent/client'
import { startJobRun } from '../../intelligence/jobs/run-job'
import { recentEvalRuns, startLlmEval, updateLlmModel } from '../llm-model.service'

const startJobMock = vi.mocked(startJobRun)
const llmAvailableMock = vi.mocked(llmAvailable)

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const NOW = new Date('2026-10-29T18:00:00Z')

const evalRun = (model: string, approved: boolean, startedAt = '2026-10-29T15:00:00Z') => ({
  id: `run-${model}-${startedAt}`,
  status: 'OK',
  startedAt: new Date(startedAt),
  finishedAt: new Date(startedAt),
  error: null,
  metadata: { model, result: { approved } },
})

beforeEach(() => {
  resetPrismaMock()
  startJobMock.mockReset()
  llmAvailableMock.mockReturnValue(true)
})

describe('updateLlmModel', () => {
  beforeEach(() => {
    prismaMock.company.findUnique.mockResolvedValue({ llmModel: null })
    prismaMock.company.update.mockImplementation(async (args: { data: { llmModel: string } }) => ({
      llmModel: args.data.llmModel,
    }))
  })

  it('sem eval aprovado do modelo: recusa', async () => {
    prismaMock.intelJobRun.findMany.mockResolvedValue([evalRun('claude-sonnet-5-5', true)])
    await expect(
      updateLlmModel(COMPANY_A, 'claude-haiku-5-5', 'super-1', NOW)
    ).rejects.toMatchObject({ statusCode: 422 })
    expect(prismaMock.company.update).not.toHaveBeenCalled()
  })

  it('o eval mais recente do modelo é o que vale', async () => {
    prismaMock.intelJobRun.findMany.mockResolvedValue([
      evalRun('claude-haiku-5-5', false, '2026-10-29T16:00:00Z'),
      evalRun('claude-haiku-5-5', true, '2026-10-28T16:00:00Z'),
    ])
    await expect(
      updateLlmModel(COMPANY_A, 'claude-haiku-5-5', 'super-1', NOW)
    ).rejects.toMatchObject({ statusCode: 422 })
  })

  it('eval aprovado: troca e grava no histórico do cliente', async () => {
    prismaMock.intelJobRun.findMany.mockResolvedValue([evalRun('claude-haiku-5-5', true)])
    const state = await updateLlmModel(COMPANY_A, 'claude-haiku-5-5', 'super-1', NOW)
    expect(state).toEqual({ current: 'claude-haiku-5-5', default: 'claude-sonnet-5', custom: true })
    expect(prismaMock.company.update.mock.calls[0][0].data).toEqual({
      llmModel: 'claude-haiku-5-5',
    })
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data).toMatchObject({
      type: 'LLM_MODEL_UPDATED',
      companyId: COMPANY_A,
      actorId: 'super-1',
    })
    // Só os evals concluídos dos últimos 30 dias contam
    const where = prismaMock.intelJobRun.findMany.mock.calls[0][0].where
    expect(where).toMatchObject({ companyId: COMPANY_A, job: 'EVAL', status: 'OK' })
    expect(where.startedAt.gte.toISOString()).toBe('2026-09-29T18:00:00.000Z')
  })

  it('voltar ao padrão (ou escolher o modelo do ambiente) não pede eval', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ llmModel: 'claude-haiku-5-5' })
    const state = await updateLlmModel(COMPANY_A, 'claude-sonnet-5', 'super-1', NOW)
    expect(state).toEqual({ current: 'claude-sonnet-5', default: 'claude-sonnet-5', custom: false })
    expect(prismaMock.company.update.mock.calls[0][0].data).toEqual({ llmModel: null })
    expect(prismaMock.intelJobRun.findMany).not.toHaveBeenCalled()
  })

  it('nada mudou: não grava', async () => {
    await updateLlmModel(COMPANY_A, null, 'super-1', NOW)
    expect(prismaMock.company.update).not.toHaveBeenCalled()
  })
})

describe('recentEvalRuns', () => {
  it('rodando com a trava vencida aparece como interrompido', async () => {
    prismaMock.intelJobRun.findMany.mockResolvedValue([
      {
        ...evalRun('claude-haiku-5-5', true),
        status: 'RUNNING',
        finishedAt: null,
        metadata: { model: 'claude-haiku-5-5' },
        lockedUntil: new Date(Date.now() - 60_000),
      },
      {
        ...evalRun('claude-sonnet-5-5', true),
        status: 'RUNNING',
        finishedAt: null,
        metadata: { model: 'claude-sonnet-5-5' },
        lockedUntil: new Date(Date.now() + 60_000),
      },
    ])
    const [stale, live] = await recentEvalRuns(COMPANY_A)
    expect(stale).toMatchObject({ status: 'ERROR', error: expect.stringContaining('interrompido') })
    expect(live).toMatchObject({ status: 'RUNNING', error: null })
  })
})

describe('startLlmEval', () => {
  beforeEach(() => {
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A })
  })

  it('dispara o job EVAL com o modelo no metadata', async () => {
    startJobMock.mockResolvedValue({ started: true, runId: 'run-9' })
    expect(await startLlmEval(COMPANY_A, 'claude-haiku-5-5')).toEqual({ runId: 'run-9' })
    expect(startJobMock).toHaveBeenCalledWith(COMPANY_A, 'EVAL', {
      metadata: { model: 'claude-haiku-5-5' },
      lockMinutes: 30,
    })
  })

  it('já tem um teste rodando: 409', async () => {
    startJobMock.mockResolvedValue({ started: false, runId: 'run-1', activeRunId: 'run-1' })
    await expect(startLlmEval(COMPANY_A, 'claude-haiku-5-5')).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('IA desligada no ambiente: 422, sem disparar', async () => {
    llmAvailableMock.mockReturnValue(false)
    await expect(startLlmEval(COMPANY_A, 'claude-haiku-5-5')).rejects.toMatchObject({
      statusCode: 422,
    })
    expect(startJobMock).not.toHaveBeenCalled()
  })
})

describe('rotas do modelo da IA', () => {
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
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A, llmModel: null })
  })

  const auth = (who: keyof typeof tokens) => ({ authorization: `Bearer ${tokens[who]}` })

  it('ADMIN da empresa não testa nem troca o modelo', async () => {
    const run = await app.inject({
      method: 'POST',
      url: `/admin/billing/clients/${COMPANY_A}/llm-eval`,
      headers: auth('adminA'),
      payload: { model: 'claude-haiku-5-5' },
    })
    const model = await app.inject({
      method: 'PUT',
      url: `/admin/billing/clients/${COMPANY_A}/llm-model`,
      headers: auth('adminA'),
      payload: { model: null },
    })
    expect([run.statusCode, model.statusCode]).toEqual([403, 403])
    expect(startJobMock).not.toHaveBeenCalled()
  })

  it('modelo fora da lista é recusado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/billing/clients/${COMPANY_A}/llm-eval`,
      headers: auth('super'),
      payload: { model: 'gpt-5' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('SUPERADMIN dispara o teste: 202 com o run', async () => {
    startJobMock.mockResolvedValue({ started: true, runId: 'run-9' })
    const res = await app.inject({
      method: 'POST',
      url: `/admin/billing/clients/${COMPANY_A}/llm-eval`,
      headers: auth('super'),
      payload: { model: 'claude-haiku-5-5' },
    })
    expect(res.statusCode).toBe(202)
    expect(res.json()).toEqual({ runId: 'run-9' })
  })
})
