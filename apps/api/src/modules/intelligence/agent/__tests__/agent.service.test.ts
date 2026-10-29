import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())
vi.mock('../client', () => ({
  llmAvailable: vi.fn(() => true),
  complete: vi.fn(),
}))
vi.mock('../../../billing/usd-brl', () => ({
  getUsdBrlRate: vi.fn(async () => ({ rate: 5, quotedAt: null, stale: false })),
}))
vi.mock('../../../billing/llm-budget-alert', () => ({
  sendLlmBudgetAlert: vi.fn(async () => 'sent'),
}))

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { sendLlmBudgetAlert } from '../../../billing/llm-budget-alert'
import { llmAvailable, complete } from '../client'
import { generateWithGuardrails, inputHash, type GenerateInput } from '../agent.service'
import { resetLimitsState } from '../limits'

const sendAlertMock = vi.mocked(sendLlmBudgetAlert)

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
  usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
  ms: 300,
  model: 'claude-sonnet-5',
})

beforeEach(() => {
  resetPrismaMock()
  resetLimitsState()
  sendAlertMock.mockClear()
  llmAvailableMock.mockReturnValue(true)
  completeMock.mockReset()
  prismaMock.intelLlmCall.aggregate.mockResolvedValue({ _sum: { inputTokens: 0, outputTokens: 0 } })
})

describe('generateWithGuardrails', () => {
  it('LLM desligado → fallback só-motor sem chamar a API', async () => {
    llmAvailableMock.mockReturnValue(false)
    const result = await generateWithGuardrails(baseInput())
    expect(result).toEqual({ data: null, source: 'engine', reason: 'llm_off', attempts: 0 })
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
    prismaMock.intelLlmCall.aggregate.mockResolvedValue({
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

  it('cache de prompt: gravação e leitura entram no registro', async () => {
    completeMock.mockResolvedValue({
      ...okCompletion('C1 compra a cada 28 dias.'),
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 600, cacheCreationTokens: 700 },
    })
    await generateWithGuardrails(baseInput())
    const upsert = prismaMock.intelLlmCache.upsert.mock.calls[0][0]
    expect(upsert.create).toMatchObject({ cacheReadTokens: 600, cacheCreationTokens: 700 })
    expect(upsert.update).toMatchObject({ cacheReadTokens: 600, cacheCreationTokens: 700 })
  })

  it('cap diário conta a gravação no cache de prompt, não a leitura', async () => {
    prismaMock.intelLlmCall.aggregate.mockResolvedValue({
      _sum: { inputTokens: 300_000, outputTokens: 100_000, cacheCreationTokens: 100_000 }, // 500k = teto
    })
    const result = await generateWithGuardrails(baseInput())
    expect(result).toMatchObject({ source: 'engine', reason: 'daily_cap' })
    expect(prismaMock.intelLlmCall.aggregate.mock.calls[0][0]._sum).toEqual({
      inputTokens: true,
      outputTokens: true,
      cacheCreationTokens: true,
    })
  })

  it('chave do cache leva o hash da entrada — fatos diferentes, chave diferente', async () => {
    completeMock.mockResolvedValue(okCompletion('C1 compra a cada 28 dias.'))
    await generateWithGuardrails(baseInput())
    await generateWithGuardrails({
      ...baseInput(),
      userPrompt: 'gere {"pseudonym":"C1","cycleDays":30}',
    })
    const keys = prismaMock.intelLlmCache.findUnique.mock.calls.map(
      (call: [{ where: { companyId_kind_vendorCode_targetKey: { targetKey: string } } }]) =>
        call[0].where.companyId_kind_vendorCode_targetKey.targetKey
    )
    expect(keys[0]).toMatch(/^C001:01#[0-9a-f]{16}$/)
    expect(keys[1]).toMatch(/^C001:01#[0-9a-f]{16}$/)
    expect(keys[0]).not.toBe(keys[1])
    // A gravação usa a mesma chave da leitura
    expect(prismaMock.intelLlmCache.upsert.mock.calls[0][0].create.targetKey).toBe(keys[0])
  })

  it('mesma entrada → mesma chave; ordem dos clientes trocada → outra chave', () => {
    const ordered = {
      system: baseInput().system,
      schema: {},
      userPrompt: '[{"p":"C1","k":"A"},{"p":"C2","k":"B"}]',
    }
    const swapped = { ...ordered, userPrompt: '[{"p":"C1","k":"B"},{"p":"C2","k":"A"}]' }
    expect(inputHash(ordered, 'claude-sonnet-5')).toBe(inputHash({ ...ordered }, 'claude-sonnet-5'))
    expect(inputHash(ordered, 'claude-sonnet-5')).not.toBe(inputHash(swapped, 'claude-sonnet-5'))
    // Trocar o modelo da empresa não reaproveita o texto do modelo anterior
    expect(inputHash(ordered, 'claude-sonnet-5')).not.toBe(inputHash(ordered, 'claude-haiku-5-5'))
  })

  it('cache: false → não lê nem grava o cache de texto', async () => {
    completeMock.mockResolvedValue(okCompletion('C1 compra a cada 28 dias.'))
    const result = await generateWithGuardrails({ ...baseInput(), cache: false })
    expect(result.source).toBe('llm')
    expect(prismaMock.intelLlmCache.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.intelLlmCache.upsert).not.toHaveBeenCalled()
  })

  it('registro: reprovado 2× grava uma linha engine com os tokens das duas tentativas', async () => {
    completeMock.mockResolvedValue(okCompletion('C1 deve fechar R$ 9.999 hoje.'))
    const result = await generateWithGuardrails(baseInput())
    expect(result.attempts).toBe(2)
    expect(prismaMock.intelLlmCall.create).toHaveBeenCalledTimes(1)
    const row = prismaMock.intelLlmCall.create.mock.calls[0][0].data
    expect(row).toMatchObject({
      companyId: 'company-1',
      kind: 'briefing',
      vendorCode: 'V1',
      source: 'engine',
      attempts: 2,
      inputTokens: 200,
      outputTokens: 100,
      model: 'claude-sonnet-5',
    })
    // Motivo sem números (cardinalidade baixa)
    expect(row.reason).toBe('self_check: número fora dos fatos: N')
    expect(row.promptVersion).toMatch(/^[0-9a-f]{8}$/)
  })

  it('registro: acerto de cache grava linha com 0 tentativas e sem tokens', async () => {
    prismaMock.intelLlmCache.findUnique.mockResolvedValue({
      payload: { text: 'do cache' },
      expiresAt: new Date(Date.now() + 60_000),
    })
    const result = await generateWithGuardrails(baseInput())
    expect(result.attempts).toBe(0)
    expect(prismaMock.intelLlmCall.create.mock.calls[0][0].data).toMatchObject({
      source: 'cache',
      attempts: 0,
      inputTokens: 0,
      latencyMs: null,
    })
  })

  it('registro que falha não derruba a geração', async () => {
    prismaMock.intelLlmCall.create.mockRejectedValue(new Error('db fora'))
    completeMock.mockResolvedValue(okCompletion('C1 compra a cada 28 dias.'))
    const result = await generateWithGuardrails(baseInput())
    expect(result.source).toBe('llm')
  })

  it('teto diário ignora o eval e não é consultado para ele', async () => {
    prismaMock.intelLlmCall.aggregate.mockResolvedValue({
      _sum: { inputTokens: 900_000, outputTokens: 0, cacheCreationTokens: 0 },
    })
    completeMock.mockResolvedValue(okCompletion('C1 compra a cada 28 dias.'))
    const result = await generateWithGuardrails({ ...baseInput(), vendorCode: 'eval' })
    expect(result.source).toBe('llm')
    expect(prismaMock.intelLlmCall.aggregate).not.toHaveBeenCalled()
  })

  it('teto diário soma o dia do vendedor, desde a meia-noite de São Paulo', async () => {
    completeMock.mockResolvedValue(okCompletion('C1 compra a cada 28 dias.'))
    await generateWithGuardrails(baseInput())
    const where = prismaMock.intelLlmCall.aggregate.mock.calls[0][0].where
    expect(where).toMatchObject({ companyId: 'company-1', vendorCode: 'V1' })
    // Meia-noite em São Paulo = 03:00 UTC (sem horário de verão)
    expect(where.createdAt.gte.getUTCHours()).toBe(3)
    expect(where.createdAt.gte.getUTCMinutes()).toBe(0)
  })

  it('teto do cadastro do vendedor: atingido, cai para só-motor', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ llmDailyTokenCap: 20_000 })
    prismaMock.intelLlmCall.aggregate.mockResolvedValue({
      _sum: { inputTokens: 15_000, outputTokens: 5_000, cacheCreationTokens: 0 },
    })
    const result = await generateWithGuardrails(baseInput())
    expect(result).toMatchObject({ source: 'engine', reason: 'daily_cap' })
    expect(completeMock).not.toHaveBeenCalled()
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toEqual({
      companyId: 'company-1',
      idVendProt: 'V1',
    })
  })

  it('teto 0 desliga a IA do vendedor', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ llmDailyTokenCap: 0 })
    const result = await generateWithGuardrails(baseInput())
    expect(result).toMatchObject({ source: 'engine', reason: 'daily_cap' })
  })

  it('cache vale mesmo com o teto atingido — não custa nada', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ llmDailyTokenCap: 0 })
    prismaMock.intelLlmCache.findUnique.mockResolvedValue({
      payload: { text: 'do cache' },
      expiresAt: new Date(Date.now() + 60_000),
    })
    expect((await generateWithGuardrails(baseInput())).source).toBe('cache')
  })
})

describe('generateWithGuardrails — orçamento do mês e modelo da empresa', () => {
  // Sonnet 5: US$ 2/MTok de entrada; 1 milhão de tokens = US$ 2 = R$ 10 com câmbio 5
  const monthUsage = (inputTokens: number) =>
    prismaMock.intelLlmCall.groupBy.mockResolvedValue([
      {
        model: 'claude-sonnet-5',
        _sum: { inputTokens, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 },
      },
    ])
  const company = (over: Record<string, unknown>) =>
    prismaMock.company.findUnique.mockResolvedValue({
      llmModel: null,
      llmMonthlyTokenBudget: null,
      llmMonthlyBudgetBrl: null,
      ...over,
    })

  it('orçamento atingido → pausa (só-motor) e avisa a Addere uma vez', async () => {
    company({ llmMonthlyTokenBudget: 1_000_000 })
    monthUsage(1_000_000)
    const result = await generateWithGuardrails(baseInput())
    expect(result).toMatchObject({ source: 'engine', reason: 'monthly_budget' })
    expect(completeMock).not.toHaveBeenCalled()
    await generateWithGuardrails(baseInput())
    expect(sendAlertMock).toHaveBeenCalledTimes(1)
    expect(sendAlertMock.mock.calls[0][0]).toMatchObject({ companyId: 'company-1', level: 100 })
  })

  it('80 % do orçamento em R$ → avisa e segue gerando', async () => {
    company({ llmMonthlyBudgetBrl: '10.00' })
    monthUsage(800_000) // R$ 8 de R$ 10
    completeMock.mockResolvedValue(okCompletion('C1 compra a cada 28 dias.'))
    const result = await generateWithGuardrails(baseInput())
    expect(result.source).toBe('llm')
    expect(sendAlertMock.mock.calls[0][0]).toMatchObject({ level: 80, pct: 80, costBrl: 8 })
  })

  it('sem orçamento não soma o mês', async () => {
    company({})
    completeMock.mockResolvedValue(okCompletion('C1 compra a cada 28 dias.'))
    await generateWithGuardrails(baseInput())
    expect(prismaMock.intelLlmCall.groupBy).not.toHaveBeenCalled()
  })

  it('o eval passa pelo orçamento estourado', async () => {
    company({ llmMonthlyTokenBudget: 1 })
    monthUsage(5)
    completeMock.mockResolvedValue(okCompletion('C1 compra a cada 28 dias.'))
    const result = await generateWithGuardrails({ ...baseInput(), vendorCode: 'eval' })
    expect(result.source).toBe('llm')
  })

  it('usa o modelo da empresa; o do eval tem prioridade', async () => {
    company({ llmModel: 'claude-haiku-5-5' })
    completeMock.mockResolvedValue(okCompletion('C1 compra a cada 28 dias.'))
    await generateWithGuardrails(baseInput())
    await generateWithGuardrails({ ...baseInput(), model: 'claude-sonnet-5-5', cache: false })
    expect(completeMock.mock.calls[0][0].model).toBe('claude-haiku-5-5')
    expect(completeMock.mock.calls[1][0].model).toBe('claude-sonnet-5-5')
  })

  it('resposta descartada pela API entra no registro com os tokens cobrados', async () => {
    company({})
    completeMock.mockResolvedValue({
      ok: false,
      error: 'resposta truncada',
      retryable: true,
      usage: { inputTokens: 900, outputTokens: 2000, cacheReadTokens: 0, cacheCreationTokens: 0 },
      model: 'claude-sonnet-5',
      ms: 4000,
    })
    const result = await generateWithGuardrails(baseInput())
    expect(result).toMatchObject({ source: 'engine', reason: 'resposta truncada', attempts: 1 })
    expect(prismaMock.intelLlmCall.create.mock.calls[0][0].data).toMatchObject({
      inputTokens: 900,
      outputTokens: 2000,
      model: 'claude-sonnet-5',
    })
  })

  it('validate do tipo reprova como o self-check (regenera e cai para só-motor)', async () => {
    completeMock.mockResolvedValue(okCompletion('C1 compra a cada 28 dias.'))
    const result = await generateWithGuardrails({
      ...baseInput(),
      validate: (d) => (d.text.endsWith('?') ? [] : ['mensagem sem pergunta no fim']),
    })
    expect(completeMock).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({
      source: 'engine',
      reason: 'self_check: mensagem sem pergunta no fim',
      attempts: 2,
    })
  })

  it('premissas do DADOS.md valem como fatos ("vencido há mais de 5 dias")', async () => {
    completeMock.mockResolvedValue(
      okCompletion('C1 está bloqueado: título vencido há mais de 5 dias.')
    )
    const result = await generateWithGuardrails({
      ...baseInput(),
      system: [
        { type: 'text', text: 'skill' },
        {
          type: 'text',
          text: '# DADOS.md\n\n## Premissas do motor\nbloqueio por título vencido há mais de 5 dias.',
        },
      ],
    })
    expect(result.source).toBe('llm')
  })

  it('número só da definição de consulta (fora das premissas) continua cobrado', async () => {
    completeMock.mockResolvedValue(okCompletion('C1 tem 5 títulos.'))
    const result = await generateWithGuardrails({
      ...baseInput(),
      system: [{ type: 'text', text: '# DADOS.md\n## Vendas\nExclui CFOP 5' }],
    })
    expect(result.source).toBe('engine')
  })

  it('guarda as respostas reprovadas com as violações (o eval mostra)', async () => {
    completeMock
      .mockResolvedValueOnce(okCompletion('C1 deve R$ 9.999.'))
      .mockResolvedValueOnce(okCompletion('C1 compra a cada 28 dias.'))
    const result = await generateWithGuardrails(baseInput())
    expect(result.source).toBe('llm')
    expect(result.rejected).toEqual([
      { text: 'C1 deve R$ 9.999.', violations: ['número fora dos fatos: 9999'] },
    ])
  })

  it('erro da API → fallback com o motivo', async () => {
    completeMock.mockResolvedValue({
      ok: false,
      error: 'Rate limit da API Anthropic',
      retryable: true,
    })
    const result = await generateWithGuardrails(baseInput())
    expect(result).toMatchObject({ source: 'engine', reason: 'Rate limit da API Anthropic' })
  })
})
