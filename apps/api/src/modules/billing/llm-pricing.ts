// Preço do modelo do agente (US$ por milhão de tokens), da tabela oficial da
// Anthropic em 06/10/2026. Mudou o preço ou entrou modelo novo: atualizar aqui.
//
// A gravação no cache de prompt custa 1,25× a entrada (TTL de 5 minutos, o
// único que o agente usa); a leitura tem preço próprio, que varia por modelo.

export interface ModelPrice {
  input: number
  output: number
  cacheRead: number
}

const CACHE_WRITE_MULTIPLIER = 1.25

const PRICES: Record<string, ModelPrice> = {
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
  'claude-fable-5': { input: 10, output: 50, cacheRead: 1 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheRead: 0.1 },
}

// Modelo sem preço na tabela é cobrado como o Sonnet atual e aparece no painel
// como "sem preço na tabela" — melhor uma estimativa visível que custo zero
const FALLBACK_MODEL = 'claude-sonnet-5-5'

/**
 * Preço pelo id gravado na chamada. Casa o id exato ou o prefixo mais longo
 * ("claude-opus-5-5-…" é Opus 5.5, não Opus 5).
 */
export function modelPrice(model: string): { price: ModelPrice; priced: boolean } {
  let best: string | null = null
  for (const key of Object.keys(PRICES)) {
    if (model !== key && !model.startsWith(`${key}-`)) continue
    if (!best || key.length > best.length) best = key
  }
  return best
    ? { price: PRICES[best], priced: true }
    : { price: PRICES[FALLBACK_MODEL], priced: false }
}

export interface TokenCounts {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

/** Custo em US$ e quanto a leitura de cache economizou frente à entrada cheia. */
export function llmCostUsd(price: ModelPrice, t: TokenCounts): { usd: number; savingsUsd: number } {
  const usd =
    (t.inputTokens * price.input +
      t.outputTokens * price.output +
      t.cacheCreationTokens * price.input * CACHE_WRITE_MULTIPLIER +
      t.cacheReadTokens * price.cacheRead) /
    1_000_000
  const savingsUsd = (t.cacheReadTokens * (price.input - price.cacheRead)) / 1_000_000
  return { usd, savingsUsd }
}

/** Tokens que contam no teto diário e no orçamento: a leitura de cache fica de fora. */
export function billableTokens(t: TokenCounts): number {
  return t.inputTokens + t.outputTokens + t.cacheCreationTokens
}
