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
import { ymdSaoPaulo, ymdToDate } from '../../engine/business-days'
import { generateWithGuardrails } from '../agent.service'
import {
  activeVendorCodes,
  fillDaySummary,
  planSummaryHandler,
  resetFillAttempts,
} from '../plan-summary.job'

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
  resetFillAttempts()
  generateMock.mockReset()
  captureMock.mockReset()
  prismaMock.company.findUnique.mockResolvedValue({ id: 'company-1' })
  // Todo mundo usou o app no dia útil anterior, salvo quando o teste diz outra coisa
  prismaMock.user.findMany.mockResolvedValue([{ idVendProt: 'V-p1' }, { idVendProt: 'V-p2' }])
})

describe('planSummaryHandler — alarme de só-motor (plano 012)', () => {
  it('nenhuma frase gerada com LLM ligado → Sentry com os motivos', async () => {
    prismaMock.visitPlan.findMany.mockImplementation(async (args: { where: { kind: string } }) =>
      args.where.kind === 'DAY' ? [plan('p1'), plan('p2')] : []
    )
    generateMock.mockResolvedValue({
      data: null,
      source: 'engine',
      reason: 'facts_leak',
      attempts: 0,
    })

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

describe('planSummaryHandler — custo de IA', () => {
  it('só gera para quem usou o app no dia útil anterior', async () => {
    prismaMock.user.findMany.mockResolvedValue([{ idVendProt: 'V-p2' }])
    prismaMock.visitPlan.findMany.mockResolvedValue([plan('p1'), plan('p2')])
    generateMock.mockResolvedValue({
      data: null,
      source: 'engine',
      reason: 'self_check',
      attempts: 2,
    })

    const result = (await planSummaryHandler('company-1')) as { inactive: number; fallback: number }
    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(generateMock.mock.calls[0][0].vendorCode).toBe('V-p2')
    expect(result).toMatchObject({ inactive: 1, fallback: 1 })
  })

  it('ninguém ativo → nenhuma geração e sem alarme', async () => {
    prismaMock.user.findMany.mockResolvedValue([])
    prismaMock.visitPlan.findMany.mockResolvedValue([plan('p1')])
    const result = (await planSummaryHandler('company-1')) as { inactive: number }
    expect(generateMock).not.toHaveBeenCalled()
    expect(result.inactive).toBe(1)
    expect(captureMock).not.toHaveBeenCalled()
  })

  it('não gera mais o resumo da semana (o app não mostra)', async () => {
    prismaMock.visitPlan.findMany.mockResolvedValue([plan('p1')])
    generateMock.mockResolvedValue({ data: null, source: 'engine', reason: 'x', attempts: 1 })
    await planSummaryHandler('company-1')
    expect(prismaMock.visitPlan.findMany).toHaveBeenCalledTimes(1)
    expect(prismaMock.visitPlan.findMany.mock.calls[0][0].where.kind).toBe('DAY')
    expect(generateMock.mock.calls.every(([input]) => input.kind === 'today')).toBe(true)
  })

  it('na segunda, "dia anterior" é a sexta, desde a meia-noite de São Paulo', async () => {
    await activeVendorCodes('company-1', '20261102') // segunda
    const where = prismaMock.user.findMany.mock.calls[0][0].where
    expect(where.lastAppSeenAt.gte.toISOString()).toBe('2026-10-30T03:00:00.000Z')
    expect(where).toMatchObject({ companyId: 'company-1', idVendProt: { not: null } })
  })

  it('com sábado de trabalho, a segunda olha o sábado', async () => {
    prismaMock.intelParameter.findMany.mockResolvedValue([
      { key: 'saturday_workday', value: true, segment: '' },
    ])
    await activeVendorCodes('company-1', '20261102')
    const where = prismaMock.user.findMany.mock.calls[0][0].where
    expect(where.lastAppSeenAt.gte.toISOString()).toBe('2026-10-31T03:00:00.000Z')
  })
})

describe('fillDaySummary — frase ao abrir a home', () => {
  const todayPlan = (over: Record<string, unknown> = {}) => ({
    ...plan('p1'),
    date: ymdToDate(ymdSaoPaulo(new Date())),
    llmSummary: null,
    ...over,
  })

  it('gera a frase do plano de hoje uma vez só, mesmo abrindo a home de novo', async () => {
    prismaMock.visitPlan.findFirst.mockResolvedValue(todayPlan())
    prismaMock.customer.findMany.mockResolvedValue([
      { protheusCode: 'A', loja: '01', name: 'Padaria Central' },
    ])
    generateMock.mockResolvedValue({
      data: { homeLine: 'Comece por C1', planText: 'x' },
      source: 'llm',
      attempts: 1,
    })
    await fillDaySummary('company-1', 'p1')
    await fillDaySummary('company-1', 'p1')
    expect(generateMock).toHaveBeenCalledTimes(1)
    expect(prismaMock.visitPlan.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'p1' },
      data: { llmSummary: 'Comece por Padaria Central' },
    })
  })

  it('plano que já tem frase ou é de outro dia não gera', async () => {
    prismaMock.visitPlan.findFirst.mockResolvedValueOnce(todayPlan({ llmSummary: 'pronta' }))
    await fillDaySummary('company-1', 'p1')
    prismaMock.visitPlan.findFirst.mockResolvedValueOnce(
      todayPlan({ id: 'p2', date: new Date(Date.UTC(2026, 0, 2)) })
    )
    await fillDaySummary('company-1', 'p2')
    expect(generateMock).not.toHaveBeenCalled()
  })

  it('a madrugada já pagou uma tentativa que falhou: não paga outra no mesmo dia', async () => {
    prismaMock.visitPlan.findFirst.mockResolvedValue(todayPlan())
    prismaMock.intelLlmCall.count.mockResolvedValue(1)
    await fillDaySummary('company-1', 'p1')
    expect(generateMock).not.toHaveBeenCalled()
    expect(prismaMock.intelLlmCall.count.mock.calls[0][0].where).toMatchObject({
      companyId: 'company-1',
      kind: 'today',
      vendorCode: 'V-p1',
      source: 'engine',
      attempts: { gt: 0 },
    })
  })

  it('erro vai para o Sentry e não sobe para a home', async () => {
    prismaMock.visitPlan.findFirst.mockRejectedValue(new Error('db fora'))
    await expect(fillDaySummary('company-1', 'p1')).resolves.toBeUndefined()
    expect(captureMock).toHaveBeenCalledTimes(1)
  })
})
