// Cliente Anthropic do agente (E6, D13): claude-sonnet-5, structured output
// via output_config.format, thinking adaptativo, timeout 60s, 1 retry do SDK.
// Erros viram resultado tipado — quem chama decide o fallback só-motor.
// Truncamento, recusa e JSON fora do schema têm motivo próprio (plano 012):
// antes tudo virava "JSON inválido" e não dava para saber o que medir.
// Resposta descartada também devolve o usage: a Anthropic cobra os tokens, e
// sem ele o custo do mês e o teto diário ficavam abaixo do real.
import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../../lib/env'
import { schemaViolations } from './schema-check'

const TIMEOUT_MS = 60_000
const MAX_TOKENS = 2_000

export interface LlmUsage {
  inputTokens: number // exclui o que passou pelo cache de prompt
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export type CompleteResult<T> =
  | { ok: true; data: T; usage: LlmUsage; ms: number; model: string }
  | { ok: false; error: string; retryable: boolean; usage?: LlmUsage; model?: string; ms?: number }

export interface CompleteInput {
  system: Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl?: '1h' } }>
  user: string
  schema: Record<string, unknown>
  effort?: 'low' | 'medium' | 'high'
  maxTokens?: number
  /** Modelo da empresa ou do eval; sem ele, o INTEL_LLM_MODEL do ambiente */
  model?: string
}

let client: Anthropic | null = null

export function llmAvailable(): boolean {
  return env.INTEL_LLM_ENABLED === 'true' && Boolean(env.ANTHROPIC_API_KEY)
}

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      timeout: TIMEOUT_MS,
      maxRetries: 1, // 1 retry automático do SDK (rede/5xx/rate limit)
    })
  }
  return client
}

/** Visível para testes — troca o client por um fake. */
export function setClientForTests(fake: unknown): void {
  client = fake as Anthropic
}

export async function complete<T>(input: CompleteInput): Promise<CompleteResult<T>> {
  if (!llmAvailable()) {
    return { ok: false, error: 'LLM desabilitado ou sem ANTHROPIC_API_KEY', retryable: false }
  }

  const t0 = Date.now()
  try {
    const response = await getClient().messages.create({
      model: input.model ?? env.INTEL_LLM_MODEL,
      max_tokens: input.maxTokens ?? MAX_TOKENS,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: input.effort ?? 'low',
        format: { type: 'json_schema', schema: input.schema },
      },
      system: input.system,
      messages: [{ role: 'user', content: input.user }],
    })

    const usage: LlmUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    }
    const discarded = (error: string, retryable: boolean): CompleteResult<T> => ({
      ok: false,
      error,
      retryable,
      usage,
      model: response.model,
      ms: Date.now() - t0,
    })

    // Com thinking adaptativo, o raciocínio consome o mesmo max_tokens: medir
    // a taxa de 'resposta truncada' no registro antes de mexer no limite
    if (response.stop_reason === 'max_tokens') return discarded('resposta truncada', true)
    if (response.stop_reason === 'refusal') return discarded('recusa do modelo', false)

    const text = response.content.find((block) => block.type === 'text')
    if (!text || text.type !== 'text') return discarded('Resposta sem bloco de texto', true)

    let data: T
    try {
      data = JSON.parse(text.text) as T
    } catch {
      return discarded('Resposta não é JSON válido', true)
    }
    const problems = schemaViolations(data, input.schema)
    if (problems.length > 0) return discarded(`formato fora do schema: ${problems[0]}`, true)

    return { ok: true, data, usage, ms: Date.now() - t0, model: response.model }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: 'ANTHROPIC_API_KEY inválida', retryable: false }
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, error: 'Rate limit da API Anthropic', retryable: true }
    }
    if (err instanceof Anthropic.APIError) {
      return {
        ok: false,
        error: `Erro da API Anthropic (${err.status})`,
        retryable: (err.status ?? 500) >= 500,
      }
    }
    return { ok: false, error: (err as Error).message.slice(0, 200), retryable: true }
  }
}
