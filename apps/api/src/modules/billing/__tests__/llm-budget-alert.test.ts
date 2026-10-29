// Aviso do orçamento de IA à Addere: uma vez por nível e por mês, para o
// e-mail de avisos das regras de cobrança, com o nome da empresa escapado.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())
vi.mock('../billing-mailer', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sendBillingEmailOnce: vi.fn(async () => 'sent'),
}))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { sendBillingEmailOnce } from '../billing-mailer'
import { budgetAlertSubject, sendLlmBudgetAlert } from '../llm-budget-alert'

const sendMock = vi.mocked(sendBillingEmailOnce)

const alert = {
  companyId: 'company-1',
  month: '2026-10',
  level: 80 as const,
  pct: 82.4,
  tokens: 1_648_000,
  costBrl: 41.2,
  budgetTokens: 2_000_000,
  budgetBrl: 50,
}

beforeEach(() => {
  resetPrismaMock()
  sendMock.mockClear()
  prismaMock.company.findUnique.mockResolvedValue({ name: 'Rava <Embalagens>' })
  prismaMock.billingSettings.findUnique.mockResolvedValue({ notifyEmail: 'avisos@addere.com.br' })
})

describe('sendLlmBudgetAlert', () => {
  it('80 %: aviso para o e-mail da Addere, deduplicado por empresa, mês e nível', async () => {
    await sendLlmBudgetAlert(alert)
    const input = sendMock.mock.calls[0][0]
    expect(input).toMatchObject({
      companyId: 'company-1',
      dedupeKey: 'llm-budget:company-1:2026-10:80',
      eventType: 'LLM_BUDGET_WARNING',
      to: ['avisos@addere.com.br'],
      subject: 'IA em 80% do orçamento do mês — Rava <Embalagens>',
    })
    expect(input.text).toContain('outubro de 2026')
    expect(input.text).toContain('R$ 41,20')
    expect(input.text).toContain('R$ 50,00')
    // Nome da empresa vem do banco: escapado no HTML
    expect(input.html).toContain('Rava &lt;Embalagens&gt;')
    expect(input.html).not.toContain('Rava <Embalagens>')
  })

  it('100 %: avisa que a IA pausou até o fim do mês', async () => {
    await sendLlmBudgetAlert({ ...alert, level: 100, pct: 100 })
    const input = sendMock.mock.calls[0][0]
    expect(input).toMatchObject({
      dedupeKey: 'llm-budget:company-1:2026-10:100',
      eventType: 'LLM_BUDGET_EXCEEDED',
    })
    expect(input.text).toContain('pausou')
  })

  it('sem e-mail de avisos cadastrado: não manda para ninguém', async () => {
    prismaMock.billingSettings.findUnique.mockResolvedValue({ notifyEmail: null })
    await sendLlmBudgetAlert(alert)
    expect(sendMock.mock.calls[0][0].to).toEqual([])
  })

  it('assunto dos dois níveis', () => {
    expect(budgetAlertSubject(100, 'Rava')).toBe('IA pausada: orçamento do mês atingido — Rava')
  })
})
