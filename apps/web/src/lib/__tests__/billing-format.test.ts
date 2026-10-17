import { describe, expect, it } from 'vitest'
import {
  PAYMENT_METHOD_LABELS,
  formatInvoiceNumber,
  moneyToInput,
  parseMoneyInput,
} from '../billing-format'

describe('formatInvoiceNumber', () => {
  it('seis dígitos', () => {
    expect(formatInvoiceNumber(124)).toBe('000124')
    expect(formatInvoiceNumber(1234567)).toBe('1234567')
  })
})

describe('parseMoneyInput', () => {
  it('formato brasileiro com ponto de milhar e vírgula decimal', () => {
    expect(parseMoneyInput('1.234,50')).toBe('1234.50')
    expect(parseMoneyInput('0,1')).toBe('0.10')
    expect(parseMoneyInput('1990,00')).toBe('1990.00')
    expect(parseMoneyInput(' R$ 2.139,80 ')).toBe('2139.80')
  })

  it('sem vírgula: milhar com ponto ou inteiro', () => {
    expect(parseMoneyInput('1.800')).toBe('1800.00')
    expect(parseMoneyInput('1800')).toBe('1800.00')
  })

  it('o total vindo da API (ponto decimal) também é lido', () => {
    expect(parseMoneyInput('2139.80')).toBe('2139.80')
  })

  it('sinal só com allowNegative', () => {
    expect(parseMoneyInput('-10,00', { allowNegative: true })).toBe('-10.00')
    expect(parseMoneyInput('-10,00')).toBeNull()
  })

  it('inválidos e ambíguos → null', () => {
    expect(parseMoneyInput('abc')).toBeNull()
    expect(parseMoneyInput('1,234')).toBeNull()
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('   ')).toBeNull()
    expect(parseMoneyInput('1.23.4')).toBeNull()
    expect(parseMoneyInput('-', { allowNegative: true })).toBeNull()
  })

  it('moneyToInput devolve o texto do campo', () => {
    expect(moneyToInput('2139.80')).toBe('2139,80')
    expect(parseMoneyInput(moneyToInput('2139.80'))).toBe('2139.80')
  })
})

describe('PAYMENT_METHOD_LABELS', () => {
  it('os cinco rótulos', () => {
    expect(PAYMENT_METHOD_LABELS).toEqual({
      PIX: 'PIX',
      BOLETO: 'Boleto',
      TRANSFER: 'Transferência',
      CARD: 'Cartão',
      OTHER: 'Outra',
    })
  })
})
