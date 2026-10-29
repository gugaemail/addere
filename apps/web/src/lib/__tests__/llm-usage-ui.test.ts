// Custo de IA na Gestão Addere: faixas do orçamento e formatação.
import { describe, it, expect } from 'vitest'
import {
  budgetStatus,
  dailyCapLabel,
  dayLabel,
  evalScoreLine,
  fallbackReasonLabel,
  formatCost,
  formatTokens,
  modelLabel,
  pctOfMonthlyFee,
  rateLabel,
  vendorLabel,
} from '../llm-usage-ui'

const nbsp = (s: string) => s.replace(/\u00a0/g, ' ')

describe('budgetStatus', () => {
  it('até 80% ok, de 80% alerta, de 100% estourado; sem orçamento, nada', () => {
    expect(budgetStatus(79.9)).toBe('ok')
    expect(budgetStatus(80)).toBe('warning')
    expect(budgetStatus(100)).toBe('over')
    expect(budgetStatus(null)).toBeNull()
  })
})

describe('formatação', () => {
  it('tokens em mil e milhões', () => {
    expect(formatTokens(980)).toBe('980')
    expect(formatTokens(12_400)).toBe('12,4 mil')
    expect(formatTokens(1_550_000)).toBe('1,55 mi')
  })

  it('custo em R$ com câmbio e em US$ sem', () => {
    expect(nbsp(formatCost({ costBrl: 18.5, costUsd: 3.7 }))).toBe('R$ 18,50')
    expect(nbsp(formatCost({ costBrl: null, costUsd: 3.7 }))).toBe('US$ 3,70')
  })

  it('cotação com a data em São Paulo', () => {
    expect(rateLabel({ rate: 5.3744, quotedAt: '2026-10-29T16:11:53.000Z', stale: false })).toBe(
      'PTAX de 29/10/2026: R$ 5,3744'
    )
    expect(rateLabel({ rate: null, quotedAt: null, stale: true })).toBe(
      'Sem cotação do dólar — valores em US$'
    )
  })

  it('dia do gráfico', () => {
    expect(dayLabel('2026-10-01')).toBe('01/10')
  })
})

describe('vendorLabel', () => {
  it('nome do vendedor; eval e equipe com nome próprio; senão o código', () => {
    expect(vendorLabel({ key: '000001', label: 'Ana Souza' })).toBe('Ana Souza')
    expect(vendorLabel({ key: 'eval', label: null })).toBe('Testes de regressão (eval)')
    expect(vendorLabel({ key: '*', label: null })).toBe('Equipe toda (gerente)')
    expect(vendorLabel({ key: '000009', label: null })).toBe('Vendedor 000009')
  })
})

describe('pctOfMonthlyFee', () => {
  it('custo de IA sobre a mensalidade', () => {
    expect(pctOfMonthlyFee(64.95, '1299.00')).toBe(5)
    expect(pctOfMonthlyFee(10, null)).toBeNull()
    expect(pctOfMonthlyFee(null, '1299.00')).toBeNull()
  })
})

describe('controle de custo', () => {
  it('nome curto do modelo; fora da lista, o id', () => {
    expect(modelLabel('claude-haiku-5-5')).toBe('Haiku 5.5')
    expect(modelLabel('claude-opus-5-5')).toBe('claude-opus-5-5')
  })

  it('teto diário do vendedor: o dele, o padrão ou desligado', () => {
    expect(dailyCapLabel(50_000, 100_000)).toBe('50 mil/dia')
    expect(dailyCapLabel(null, 100_000)).toBe('100 mil/dia')
    expect(dailyCapLabel(0, 100_000)).toBe('IA desligada')
  })

  it('motivo do só-motor em português, e o desconhecido como veio', () => {
    expect(fallbackReasonLabel('daily_cap')).toBe('Teto diário do vendedor atingido')
    expect(fallbackReasonLabel('self_check: número fora dos fatos: N')).toBe(
      'Reprovada no autocheck: número fora dos fatos: N'
    )
    expect(fallbackReasonLabel('Erro da API Anthropic (N)')).toBe('Erro da API Anthropic (N)')
  })

  it('placar do teste de modelo', () => {
    const line = evalScoreLine({
      total: 26,
      passed: 25,
      passedFirst: 24,
      passedRetry: 1,
      failed: 1,
      blockedFailed: 0,
      skipped: 0,
      approved: true,
      promptVersion: 'abcd1234',
      cost: { tokens: 52_000, costUsd: 0.026, costBrl: 0.13 },
      costPerCaseUsd: 0.001,
      failures: [],
    })
    expect(nbsp(line)).toBe(
      '92% de primeira (24 de 26) · 0 falha(s) em bloqueado · US$ 0,0010 por caso'
    )
  })
})
