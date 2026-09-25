import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())
vi.mock('../client', () => ({
  llmAvailable: vi.fn(() => true),
  complete: vi.fn(),
}))

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { llmAvailable, complete } from '../client'
import { generateWithGuardrails, type GenerateInput } from '../agent.service'

const llmAvailableMock = vi.mocked(llmAvailable)
const completeMock = vi.mocked(complete)

const baseInput = (): GenerateInput<{ text: string }> => ({
  companyId: 'company-1',
  kind: 'briefing',
  vendorCode: 'V1',
  targetKey: 'C001:01',
  system: [{ type: 'text', text: 'skill' }],
  userPrompt: 'gere',
  schema: { type: 'object' },
  factsPayload: { customers: [{ pseudonym: 'C1', status: 'LATE', cycleDays: 28 }] },
  selfCheckFacts: {
    customers: [{ pseudonym: 'C1', status: 'LATE' }],
    numbers: [28],
    freshnessLine: null,
  },
  extractText: (d) => d.text,
})

const okCompletion = (text: string) => ({
  ok: true as const,
  data: { text },
  usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0 },
  ms: 300,
  model: 'claude-sonnet-5',
})

beforeEach(() => {
  resetPrismaMock()
  llmAvailableMock.mockReturnValue(true)
  completeMock.mockReset()
  prismaMock.intelLlmCache.aggregate.mockResolvedValue({ _sum: { inputTokens: 0, outputTokens: 0 } })
})

describe('generateWithGuardrails', () => {
  it('LLM desligado → fallback só-motor sem chamar a API', async () => {
    llmAvailableMock.mockReturnValue(false)
    const result = await generateWithGuardrails(baseInput())
    expect(result).toEqual({ data: null, source: 'engine', reason: 'llm_off' })
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('cache 4h válido → devolve sem chamar a API', async () => {
    prismaMock.intelLlmCache.findUnique.mockResolvedValue({
      payload: { text: 'do cache' },
      expiresAt: new Date(Date.now() + 60_000),
    })
    const result = await generateWithGuardrails(baseInput())
    expect(result.source).toBe('cache')
    expect(result.data).toEqual({ text: 'do cache' })
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('cache vencido não conta', async () => {
    prismaMock.intelLlmCache.findUnique.mockResolvedValue({
      payload: { text: 'velho' },
      expiresAt: new Date(Date.now() - 1),
    })
    completeMock.mockResolvedValue(okCompletion('C1 compra a cada 28 dias.'))
    const result = await generateWithGuardrails(baseInput())
    expect(result.source).toBe('llm')
  })

  it('cap diário estourado → fallback (D13)', async () => {
    prismaMock.intelLlmCache.aggregate.mockResolvedValue({
      _sum: { inputTokens: 400_000, outputTokens: 200_000 }, // 600k ≥ 500k default
    })
    const result = await generateWithGuardrails(baseInput())
    expect(result).toMatchObject({ source: 'engine', reason: 'daily_cap' })
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('fato fora da allowlist → nunca chama a API', async () => {
    const input = baseInput()
    input.factsPayload = { customers: [{ pseudonym: 'C1', nome: 'ACME LTDA' }] }
    const result = await generateWithGuardrails(input)
    expect(result).toMatchObject({ source: 'engine', reason: 'facts_leak' })
    expect(completeMock).not.toHaveBeenCalled()
  })

  it('self-check reprova 2× → só-motor (§5.2)', async () => {
    completeMock.mockResolvedValue(okCompletion('C1 deve fechar R$ 9.999 hoje.'))
    const result = await generateWithGuardrails(baseInput())
    expect(result.source).toBe('engine')
    expect(result.reason).toContain('self_check')
    expect(completeMock).toHaveBeenCalledTimes(2)
    // A regeneração leva o aviso explícito
    expect(completeMock.mock.calls[1][0].user).toContain('ATENÇÃO')
  })

  it('self-check reprova 1× e aprova a regeneração', async () => {
    completeMock
      .mockResolvedValueOnce(okCompletion('C1 deve R$ 9.999.'))
      .mockResolvedValueOnce(okCompletion('C1 compra a cada 28 dias.'))
    const result = await generateWithGuardrails(baseInput())
    expect(result.source).toBe('llm')
  })

  it('sucesso grava cache com expiração ~4h e soma o usage das tentativas', async () => {
    completeMock
      .mockResolvedValueOnce(okCompletion('C1 deve R$ 9.999.')) // reprova
      .mockResolvedValueOnce(okCompletion('C1 compra a cada 28 dias.'))
    await generateWithGuardrails(baseInput())

    const upsert = prismaMock.intelLlmCache.upsert.mock.calls[0][0]
    expect(upsert.create.inputTokens).toBe(200) // 2 tentativas × 100
    expect(upsert.create.outputTokens).toBe(100)
    const hours = (upsert.create.expiresAt.getTime() - Date.now()) / 3_600_000
    expect(hours).toBeGreaterThan(3.9)
    expect(hours).toBeLessThanOrEqual(4)
  })

  it('erro da API → fallback com o motivo', async () => {
    completeMock.mockResolvedValue({ ok: false, error: 'Rate limit da API Anthropic', retryable: true })
    const result = await generateWithGuardrails(baseInput())
    expect(result).toMatchObject({ source: 'engine', reason: 'Rate limit da API Anthropic' })
  })
})
