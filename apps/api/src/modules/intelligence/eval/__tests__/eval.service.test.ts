import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())
vi.mock('../../agent/client', () => ({ llmAvailable: vi.fn(() => true) }))
vi.mock('../../agent/agent.service', () => ({
  EVAL_VENDOR_CODE: 'eval',
  generateWithGuardrails: vi.fn(),
}))
vi.mock('../../agent/tenant-context', () => ({
  buildTenantContext: vi.fn(async () => ''),
  systemBlocks: vi.fn(() => [{ type: 'text', text: 'skill' }]),
  promptVersion: vi.fn(() => 'abcd1234'),
}))

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { generateWithGuardrails } from '../../agent/agent.service'
import { runEval } from '../eval.service'

const generateMock = vi.mocked(generateWithGuardrails)
const company = { id: 'company-1' } as never

const facts = {
  pseudonym: 'C1',
  status: 'LATE',
  confidence: 'HIGH',
  cycleDays: 28,
  daysSinceLastPurchase: 41,
  orders12m: 10,
  avgTicket: '1500.00',
  trendPct: null,
  usualMix: [],
  cutMix: [],
  openTitles: { count: 0, totalBalance: '0.00', maxDaysOverdue: null },
  reasons: [],
  city: null,
}

const evalCase = (id: string, expected: Record<string, unknown>) => ({ id, snapshot: facts, expected })

beforeEach(() => {
  resetPrismaMock()
  generateMock.mockReset()
})

describe('runEval (plano 012)', () => {
  it('chama sem cache, separa 1ª tentativa de regeneração e confere o expected', async () => {
    prismaMock.evalCase.findMany.mockResolvedValue([
      evalCase('a', { status: 'LATE', hasCutMix: false }), // antigo, sem kind = briefing
      evalCase('b', { kind: 'briefing', status: 'LATE', hasCutMix: false }),
      evalCase('c', { kind: 'message', status: 'LATE', hasCutMix: false, situation: 'WENT_QUIET' }),
    ])
    generateMock
      .mockResolvedValueOnce({ data: {}, source: 'llm', attempts: 1 })
      .mockResolvedValueOnce({ data: {}, source: 'llm', attempts: 2 })
      .mockResolvedValueOnce({ data: null, source: 'engine', reason: 'self_check: x', attempts: 2 })

    const summary = await runEval(company)

    expect(summary).toMatchObject({
      total: 3,
      passed: 2,
      passedFirst: 1,
      passedRetry: 1,
      failed: 1,
      blockedFailed: 0,
      approved: false, // 1 de 3 de primeira
      promptVersion: 'abcd1234',
    })
    for (const call of generateMock.mock.calls) {
      expect(call[0]).toMatchObject({ cache: false, vendorCode: 'eval' })
      expect(call[0].validate).toBeTypeOf('function')
    }
    expect(generateMock.mock.calls.map((c) => c[0].kind)).toEqual(['briefing', 'briefing', 'message'])
    const results = prismaMock.evalCase.update.mock.calls.map(
      (c: [{ data: { lastResult: string } }]) => c[0].data.lastResult
    )
    expect(results).toEqual(['PASS', 'PASS_RETRY', 'FAIL: self_check: x'])
  })

  it('falha em caso BLOCKED reprova o eval', async () => {
    prismaMock.evalCase.findMany.mockResolvedValue([
      evalCase('a', { kind: 'briefing', status: 'BLOCKED', hasCutMix: false }),
    ])
    generateMock.mockResolvedValue({ data: null, source: 'engine', reason: 'x', attempts: 2 })
    const summary = await runEval(company)
    expect(summary).toMatchObject({ blockedFailed: 1, approved: false })
  })
})
