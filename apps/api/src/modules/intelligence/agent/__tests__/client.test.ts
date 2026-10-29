import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../../lib/env', () => ({
  env: {
    INTEL_LLM_ENABLED: 'true',
    ANTHROPIC_API_KEY: 'sk-test',
    INTEL_LLM_MODEL: 'claude-sonnet-5',
  },
}))

import { complete, setClientForTests } from '../client'

const SCHEMA = {
  type: 'object',
  properties: { text: { type: 'string' } },
  required: ['text'],
  additionalProperties: false,
}

const create = vi.fn()
const response = (over: Record<string, unknown>) => ({
  model: 'claude-sonnet-5',
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: '{"text":"ok"}' }],
  usage: { input_tokens: 10, output_tokens: 5 },
  ...over,
})

beforeEach(() => {
  create.mockReset()
  setClientForTests({ messages: { create } })
})

const run = () => complete<{ text: string }>({ system: [], user: 'gere', schema: SCHEMA })

describe('complete — integridade da resposta (plano 012)', () => {
  it('resposta completa e no schema → ok', async () => {
    create.mockResolvedValue(response({}))
    const result = await run()
    expect(result).toMatchObject({ ok: true, data: { text: 'ok' } })
  })

  it('truncada (max_tokens) tem motivo próprio', async () => {
    create.mockResolvedValue(response({ stop_reason: 'max_tokens' }))
    expect(await run()).toMatchObject({ ok: false, error: 'resposta truncada' })
  })

  it('recusa tem motivo próprio e não é retentável', async () => {
    create.mockResolvedValue(response({ stop_reason: 'refusal' }))
    expect(await run()).toMatchObject({ ok: false, error: 'recusa do modelo', retryable: false })
  })

  it('JSON que parseia mas foge do schema reprova', async () => {
    create.mockResolvedValue(response({ content: [{ type: 'text', text: '{"texto":"ok"}' }] }))
    const result = await run()
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('formato fora do schema')
  })

  it('resposta descartada devolve o usage — a Anthropic cobra mesmo assim', async () => {
    create.mockResolvedValue(
      response({
        stop_reason: 'max_tokens',
        usage: { input_tokens: 900, output_tokens: 2000, cache_read_input_tokens: 300 },
      })
    )
    expect(await run()).toMatchObject({
      ok: false,
      usage: { inputTokens: 900, outputTokens: 2000, cacheReadTokens: 300, cacheCreationTokens: 0 },
      model: 'claude-sonnet-5',
    })
  })

  it('usa o modelo pedido e, sem ele, o do ambiente', async () => {
    create.mockResolvedValue(response({}))
    await complete({ system: [], user: 'gere', schema: SCHEMA, model: 'claude-haiku-5-5' })
    await run()
    expect(create.mock.calls[0][0].model).toBe('claude-haiku-5-5')
    expect(create.mock.calls[1][0].model).toBe('claude-sonnet-5')
  })
})
