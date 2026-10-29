// Job EVAL (custo de IA): roda a regressão com o modelo do metadata, congela
// os casos na primeira vez e grava o placar e o custo no run.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())
vi.mock('../eval.service', () => ({ freezeEvalCases: vi.fn(), runEval: vi.fn() }))
vi.mock('../../../billing/llm-usage.service', () => ({ evalCostSince: vi.fn() }))
vi.mock('../../jobs/run-job', () => ({ updateRunMetadata: vi.fn() }))

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { evalCostSince } from '../../../billing/llm-usage.service'
import { updateRunMetadata } from '../../jobs/run-job'
import { freezeEvalCases, runEval } from '../eval.service'
import { evalJobHandler } from '../eval.job'

const runEvalMock = vi.mocked(runEval)
const freezeMock = vi.mocked(freezeEvalCases)
const costMock = vi.mocked(evalCostSince)
const metadataMock = vi.mocked(updateRunMetadata)

const STARTED = new Date('2026-10-29T15:00:00Z')

const summary = {
  total: 26,
  passed: 25,
  passedFirst: 24,
  passedRetry: 1,
  failed: 1,
  skipped: 0,
  blockedFailed: 0,
  approved: true,
  promptVersion: 'abcd1234',
  notFirst: [
    {
      kind: 'briefing',
      status: 'LATE',
      result: 'PASS_RETRY',
      rejected: [{ text: 'C1 compra R$ 9.999', violations: ['número fora dos fatos: 9999'] }],
    },
  ],
}

beforeEach(() => {
  resetPrismaMock()
  runEvalMock.mockReset().mockResolvedValue(summary)
  freezeMock.mockReset().mockResolvedValue(26)
  costMock.mockReset().mockResolvedValue({ tokens: 52_000, costUsd: 0.026, costBrl: 0.13 })
  metadataMock.mockReset()
  prismaMock.intelJobRun.findUnique.mockResolvedValue({
    metadata: { model: 'claude-haiku-5-5' },
    startedAt: STARTED,
  })
  prismaMock.company.findUnique.mockResolvedValue({ id: 'company-1', llmModel: null })
  prismaMock.evalCase.count.mockResolvedValue(26)
})

describe('evalJobHandler', () => {
  it('roda com o modelo do metadata e grava placar, custo e motivos (sem o texto)', async () => {
    await evalJobHandler('company-1', 'run-1')

    expect(runEvalMock.mock.calls[0][1]).toEqual({ model: 'claude-haiku-5-5' })
    expect(costMock).toHaveBeenCalledWith('company-1', STARTED, expect.any(Date))
    const [runId, metadata] = metadataMock.mock.calls[0]
    expect(runId).toBe('run-1')
    expect(metadata).toMatchObject({
      model: 'claude-haiku-5-5',
      result: {
        total: 26,
        passedFirst: 24,
        approved: true,
        cost: { costUsd: 0.026 },
        costPerCaseUsd: 0.001,
        failures: [
          {
            kind: 'briefing',
            status: 'LATE',
            result: 'PASS_RETRY',
            violations: ['número fora dos fatos: 9999'],
          },
        ],
      },
    })
    expect(JSON.stringify(metadata)).not.toContain('C1 compra')
  })

  it('primeiro teste da empresa: congela os casos antes', async () => {
    prismaMock.evalCase.count.mockResolvedValue(0)
    await evalJobHandler('company-1', 'run-1')
    expect(freezeMock).toHaveBeenCalledTimes(1)
    expect(runEvalMock).toHaveBeenCalledTimes(1)
  })

  it('sem sinais para congelar: erro claro, sem rodar', async () => {
    prismaMock.evalCase.count.mockResolvedValue(0)
    freezeMock.mockResolvedValue(0)
    await expect(evalJobHandler('company-1', 'run-1')).rejects.toThrow('rode o motor antes')
    expect(runEvalMock).not.toHaveBeenCalled()
  })

  it('modelo fora da lista: recusa', async () => {
    prismaMock.intelJobRun.findUnique.mockResolvedValue({
      metadata: { model: 'gpt-5' },
      startedAt: STARTED,
    })
    await expect(evalJobHandler('company-1', 'run-1')).rejects.toThrow('Modelo do eval inválido')
    expect(runEvalMock).not.toHaveBeenCalled()
  })
})
