import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())
vi.mock('../../../../lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('../client', () => ({ llmAvailable: vi.fn(() => true) }))
vi.mock('../agent.service', () => ({ generateWithGuardrails: vi.fn() }))
vi.mock('../tenant-context', () => ({
  buildTenantContext: vi.fn(async () => 'DADOS.md'),
  systemBlocks: vi.fn(() => [{ type: 'text', text: 'skill' }]),
}))

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { captureError } from '../../../../lib/sentry'
import { generateWithGuardrails } from '../agent.service'
import { planSummaryHandler } from '../plan-summary.job'

const generateMock = vi.mocked(generateWithGuardrails)
const captureMock = vi.mocked(captureError)

const plan = (id: string) => ({
  id,
  vendorCode: `V-${id}`,
  grouping: null,
  goalGap: null,
  items: [
    {
      customerCode: 'A',
      loja: '01',
      position: 1,
      statusAtTime: 'LATE',
      shortReason: 'atrasado',
      expectedAmount: null,
      plannedDate: null,
    },
  ],
})

beforeEach(() => {
  resetPrismaMock()
  generateMock.mockReset()
  captureMock.mockReset()
  prismaMock.company.findUnique.mockResolvedValue({ id: 'company-1' })
})

describe('planSummaryHandler — alarme de só-motor (plano 012)', () => {
  it('nenhuma frase gerada com LLM ligado → Sentry com os motivos', async () => {
    prismaMock.visitPlan.findMany.mockImplementation(async (args: { where: { kind: string } }) =>
      args.where.kind === 'DAY' ? [plan('p1'), plan('p2')] : []
    )
    generateMock.mockResolvedValue({ data: null, source: 'engine', reason: 'facts_leak', attempts: 0 })

    const result = (await planSummaryHandler('company-1')) as { generated: number }
    expect(result.generated).toBe(0)
    expect(captureMock).toHaveBeenCalledTimes(1)
    expect(captureMock.mock.calls[0][1]).toMatchObject({
      companyId: 'company-1',
      plans: 2,
      reasons: { facts_leak: 2 },
    })
  })

  it('pelo menos uma frase gerada → sem alarme', async () => {
    prismaMock.customer.findMany.mockResolvedValue([
      { protheusCode: 'A', loja: '01', name: 'Padaria Central' },
    ])
    prismaMock.visitPlan.findMany.mockImplementation(async (args: { where: { kind: string } }) =>
      args.where.kind === 'DAY' ? [plan('p1'), plan('p2')] : []
    )
    generateMock
      .mockResolvedValueOnce({
        data: { homeLine: 'Comece por C1', planText: 'x' },
        source: 'llm',
        attempts: 1,
      })
      .mockResolvedValueOnce({ data: null, source: 'engine', reason: 'self_check', attempts: 2 })

    await planSummaryHandler('company-1')
    expect(captureMock).not.toHaveBeenCalled()
    expect(prismaMock.visitPlan.update.mock.calls[0][0].data.llmSummary).toBe(
      'Comece por Padaria Central'
    )
  })

  it('frase com pseudônimo sem nome no banco não vai para a home', async () => {
    prismaMock.visitPlan.findMany.mockImplementation(async (args: { where: { kind: string } }) =>
      args.where.kind === 'DAY' ? [plan('p1')] : []
    )
    generateMock.mockResolvedValue({
      data: { homeLine: 'Comece por C1', planText: 'x' },
      source: 'llm',
      attempts: 1,
    })
    const result = (await planSummaryHandler('company-1')) as {
      generated: number
      reasons: Record<string, number>
    }
    expect(result.generated).toBe(0)
    expect(result.reasons).toEqual({ 'pseudônimo sem nome': 1 })
    expect(prismaMock.visitPlan.update).not.toHaveBeenCalled()
  })

  it('dia sem plano → sem alarme', async () => {
    await planSummaryHandler('company-1')
    expect(captureMock).not.toHaveBeenCalled()
  })
})
