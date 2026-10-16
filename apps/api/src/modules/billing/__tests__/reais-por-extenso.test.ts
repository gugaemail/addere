// Valor por extenso, reais formatados sem Intl e as datas de São Paulo do
// plano 014 (@addere/types). O texto destes formatadores entra no contrato
// com hash: mudar a saída muda o texto que o cliente aceita.
import { describe, it, expect } from 'vitest'
import {
  civilDaySaoPaulo,
  competenceStartInstant,
  effectiveInstantOfDay,
  formatBillingDate,
  formatBrl,
  moneyToCents,
  reaisPorExtenso,
  resolveCompetenceTerms,
} from '@addere/types'

describe('reaisPorExtenso', () => {
  it.each([
    [0, 'zero reais'],
    [100, 'um real'],
    [200, 'dois reais'],
    [1, 'um centavo'],
    [50, 'cinquenta centavos'],
    [101, 'um real e um centavo'],
    [10_000, 'cem reais'],
    [10_100, 'cento e um reais'],
    [11_000, 'cento e dez reais'],
    [1_400, 'quatorze reais'],
    [100_000, 'mil reais'],
    [100_100, 'mil e um reais'],
    [110_000, 'mil e cem reais'],
    [110_100, 'mil, cento e um reais'],
    [125_050, 'mil, duzentos e cinquenta reais e cinquenta centavos'],
    [200_000, 'dois mil reais'],
    [2_100_000, 'vinte e um mil reais'],
    [10_000_000, 'cem mil reais'],
    [100_000_000, 'um milhão de reais'],
    [120_000_000, 'um milhão e duzentos mil reais'],
    [125_000_000, 'um milhão, duzentos e cinquenta mil reais'],
    [250_000_001, 'dois milhões e quinhentos mil reais e um centavo'],
    [100_000_000_000, 'um bilhão de reais'],
    [100_010_000, 'um milhão e cem reais'],
    [
      345_678_912,
      'três milhões, quatrocentos e cinquenta e seis mil, setecentos e oitenta e nove reais e doze centavos',
    ],
  ])('%i centavos → %s', (cents, text) => {
    expect(reaisPorExtenso(cents)).toBe(text)
  })

  it.each([-1, 1.5, 100_000_000_000_000])('%s → RangeError', (cents) => {
    expect(() => reaisPorExtenso(cents)).toThrow(RangeError)
  })

  it('o teto (999 bilhões e 99 centavos) ainda sai por extenso', () => {
    expect(reaisPorExtenso(99_999_999_999_999)).toMatch(/^novecentos e noventa e nove bilhões/)
  })
})

describe('formatBrl e moneyToCents', () => {
  it.each([
    ['0', 'R$ 0,00'],
    ['0.05', 'R$ 0,05'],
    ['1234.56', 'R$ 1.234,56'],
    ['1000000', 'R$ 1.000.000,00'],
    [2400.5, 'R$ 2.400,50'],
    [99, 'R$ 99,00'],
  ] as const)('%s → %s', (value, text) => {
    expect(formatBrl(value)).toBe(text)
  })

  it('usa espaço comum, nunca o espaço não separável do Intl', () => {
    expect(formatBrl('10')).toBe('R$ 10,00')
    expect(formatBrl('10')).not.toContain(' ')
  })

  it('converte por centavos, sem ponto flutuante', () => {
    expect(moneyToCents('0.1')).toBe(10)
    expect(moneyToCents('1234.56')).toBe(123456)
    expect(() => moneyToCents('-1')).toThrow(RangeError)
  })
})

describe('datas de São Paulo do aceite e do aditivo', () => {
  it('23h30 de 31/10 em São Paulo ainda é 31/10', () => {
    const day = civilDaySaoPaulo(new Date('2026-11-01T02:30:00Z'))
    expect(day.toISOString()).toBe('2026-10-31T00:00:00.000Z')
    expect(formatBillingDate(day)).toBe('31/10/2026')
  })

  it('"vale a partir de" é gravado às 00:01 de São Paulo', () => {
    expect(effectiveInstantOfDay('2026-12-01').toISOString()).toBe('2026-12-01T03:01:00.000Z')
  })

  it.each(['2026-13-01', '2026-02-30', '01/12/2026', ''])('%s → RangeError', (ymd) => {
    expect(() => effectiveInstantOfDay(ymd)).toThrow(RangeError)
  })

  it('aditivo que vale em 01/12: dezembro pelas condições anteriores, janeiro pelas novas', () => {
    const effective = effectiveInstantOfDay('2026-12-01')
    const december = new Date(Date.UTC(2026, 11, 1))
    const january = new Date(Date.UTC(2027, 0, 1))
    expect(effective.getTime()).toBeGreaterThan(competenceStartInstant(december).getTime())

    const terms = [
      { status: 'EFFECTIVE' as const, effectiveFrom: new Date('2026-10-16T12:00:00Z'), version: 1 },
      { status: 'EFFECTIVE' as const, effectiveFrom: effective, version: 2 },
    ]
    expect(resolveCompetenceTerms(terms, december)?.version).toBe(1)
    expect(resolveCompetenceTerms(terms, january)?.version).toBe(2)
  })
})
