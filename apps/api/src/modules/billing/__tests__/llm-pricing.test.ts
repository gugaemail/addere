// Preço do agente por modelo (US$/MTok): o id gravado casa pelo prefixo mais
// longo, a gravação de cache custa 1,25× a entrada e a leitura tem preço próprio.
import { describe, it, expect } from 'vitest'
import { billableTokens, llmCostUsd, modelPrice } from '../llm-pricing'

const tokens = (input: number, output: number, cacheWrite = 0, cacheRead = 0) => ({
  inputTokens: input,
  outputTokens: output,
  cacheCreationTokens: cacheWrite,
  cacheReadTokens: cacheRead,
})

describe('modelPrice', () => {
  it('id exato e id com sufixo casam o modelo certo', () => {
    expect(modelPrice('claude-sonnet-5').price).toEqual({ input: 2, output: 10, cacheRead: 0.2 })
    expect(modelPrice('claude-opus-5-5-20261001')).toEqual({
      price: { input: 4, output: 20, cacheRead: 0.2 },
      priced: true,
    })
  })

  it('o prefixo mais longo vence: opus-5-5 não é opus-5', () => {
    expect(modelPrice('claude-opus-5-5').price.input).toBe(4)
    expect(modelPrice('claude-opus-5').price.input).toBe(5)
  })

  it('modelo fora da tabela: preço do Sonnet atual e marcado como sem preço', () => {
    expect(modelPrice('claude-novo-9')).toEqual({
      price: { input: 2, output: 10, cacheRead: 0.2 },
      priced: false,
    })
  })
})

describe('llmCostUsd', () => {
  it('entrada, saída, gravação a 1,25× e leitura de cache', () => {
    // Sonnet 5: 1M entrada = $2, 100k saída = $1, 200k gravação = $0,50, 1M leitura = $0,20
    const { usd, savingsUsd } = llmCostUsd(
      modelPrice('claude-sonnet-5').price,
      tokens(1_000_000, 100_000, 200_000, 1_000_000)
    )
    expect(usd).toBeCloseTo(3.7, 10)
    // A leitura custou $0,20 em vez de $2 da entrada cheia
    expect(savingsUsd).toBeCloseTo(1.8, 10)
  })

  it('tokens cobráveis não incluem a leitura de cache', () => {
    expect(billableTokens(tokens(100, 50, 25, 1000))).toBe(175)
  })
})
