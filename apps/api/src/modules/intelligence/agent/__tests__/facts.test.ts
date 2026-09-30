import { describe, it, expect } from 'vitest'
import type { SignalsSnapshot } from '@addere/types'
import { buildCustomerFacts, validateFactsPayload } from '../facts'
import { Pseudonymizer } from '../pseudonymizer'

const snapshot: SignalsSnapshot = {
  status: 'LATE',
  confidence: 'HIGH',
  cycleDays: 28,
  daysSinceLastPurchase: 41,
  orders12m: 10,
  avgTicket: '1500.00',
  trendPct: -10,
  usualMix: [{ productCode: 'CAFE', productDesc: 'Café torrado' }],
  cutMix: [],
  openTitles: { count: 1, totalBalance: '900.00', maxDaysOverdue: 3 },
  reasons: ['Compra a cada 28 dias, está no dia 41'],
}

describe('validateFactsPayload — allowlist (D13/LGPD)', () => {
  it('payload construído pelo builder passa limpo', () => {
    const facts = buildCustomerFacts(
      { customerCode: '000123', loja: '01', city: 'Campinas', snapshot },
      new Pseudonymizer()
    )
    expect(validateFactsPayload({ customers: [facts] })).toEqual([])
    // o código real do cliente NÃO aparece em lugar nenhum do payload
    expect(JSON.stringify(facts)).not.toContain('000123')
    expect(facts.pseudonym).toBe('C1')
  })

  it.each(['nome', 'cnpj', 'telefone', 'endereco', 'cep', 'email'])(
    'chave proibida "%s" é denunciada',
    (key) => {
      const violations = validateFactsPayload({ customers: [{ pseudonym: 'C1', [key]: 'x' }] })
      expect(violations.some((v) => v.includes(key))).toBe(true)
    }
  )

  it('valores com cara de dado pessoal são denunciados mesmo em chave permitida', () => {
    expect(
      validateFactsPayload({ reasons: ['CNPJ 12.345.678/0001-90 em atraso'] })[0]
    ).toContain('CNPJ')
    expect(validateFactsPayload({ reasons: ['fale com joao@empresa.com.br'] })[0]).toContain(
      'e-mail'
    )
    expect(validateFactsPayload({ reasons: ['entrega no CEP 13010-111'] })[0]).toContain('CEP')
    expect(validateFactsPayload({ reasons: ['liga (19) 99999-8888'] })[0]).toContain('telefone')
  })

  it('data e código não são confundidos com dado pessoal', () => {
    // Regressão de produção (25–30/09/2026): a data do plano sai como
    // AAAAMMDD e o padrão de CEP casa com qualquer número de 8 dígitos, então
    // todo payload era reprovado e o agente nunca era chamado.
    expect(validateFactsPayload({ date: '20260930' })).toEqual([])
    expect(validateFactsPayload({ days: [{ date: '20260928' }] })).toEqual([])
    expect(validateFactsPayload({ freshness: { lastSyncAt: '20260930' } })).toEqual([])
    // Código de produto do Protheus cai nas mesmas faixas de dígitos
    expect(validateFactsPayload({ usualMix: [{ productCode: '13011101' }] })).toEqual([])
    expect(validateFactsPayload({ usualMix: [{ productCode: '12345678000190' }] })).toEqual([])
  })

  it('a exceção vale só para o campo de código, não para texto livre ao lado', () => {
    // Sem isto a exceção viraria porta: o mesmo número em `reasons` continua
    // sendo denunciado, formatado ou não.
    expect(validateFactsPayload({ reasons: ['entrega no CEP 13010-111'] })[0]).toContain('CEP')
    expect(validateFactsPayload({ reasons: ['CEP 13010111 confirmado'] })[0]).toContain('CEP')
    expect(
      validateFactsPayload({ plan: [{ shortReason: 'cobrar 12.345.678/0001-90' }] })[0]
    ).toContain('CNPJ')
  })

  it('estruturas aninhadas e arrays são varridas', () => {
    const violations = validateFactsPayload({
      plan: [{ pseudonym: 'C1', customers: [{ status: 'LATE', nome: 'ACME' }] }],
    })
    expect(violations.some((v) => v.includes('nome'))).toBe(true)
  })
})
