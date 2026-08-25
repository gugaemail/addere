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

  it('estruturas aninhadas e arrays são varridas', () => {
    const violations = validateFactsPayload({
      plan: [{ pseudonym: 'C1', customers: [{ status: 'LATE', nome: 'ACME' }] }],
    })
    expect(violations.some((v) => v.includes('nome'))).toBe(true)
  })
})
