import { describe, it, expect } from 'vitest'
import {
  maskDocument,
  maskCEP,
  formatDocumentDisplay,
  formatCEPDisplay,
  formatCurrency,
  formatDate,
} from '../utils'

describe('maskDocument', () => {
  it('formata CPF progressivamente', () => {
    expect(maskDocument('123')).toBe('123')
    expect(maskDocument('123456')).toBe('123.456')
    expect(maskDocument('123456789')).toBe('123.456.789')
    expect(maskDocument('12345678901')).toBe('123.456.789-01')
  })

  it('formata CNPJ progressivamente', () => {
    expect(maskDocument('123456789012')).toBe('12.345.678/9012')
    expect(maskDocument('12345678901234')).toBe('12.345.678/9012-34')
  })

  it('ignora não-dígitos e limita a 14', () => {
    expect(maskDocument('12.345.678/9012-34xx99')).toBe('12.345.678/9012-34')
  })
})

describe('maskCEP', () => {
  it('formata com hífen após 5 dígitos', () => {
    expect(maskCEP('30130')).toBe('30130')
    expect(maskCEP('30130010')).toBe('30130-010')
    expect(maskCEP('30130-0109999')).toBe('30130-010')
  })
})

describe('formatDocumentDisplay / formatCEPDisplay', () => {
  it('exibe travessão para vazio', () => {
    expect(formatDocumentDisplay(null)).toBe('—')
    expect(formatCEPDisplay('')).toBe('—')
  })

  it('formata CPF, CNPJ e CEP completos', () => {
    expect(formatDocumentDisplay('12345678901')).toBe('123.456.789-01')
    expect(formatDocumentDisplay('12345678901234')).toBe('12.345.678/9012-34')
    expect(formatCEPDisplay('30130010')).toBe('30130-010')
  })

  it('devolve o valor original quando o tamanho não bate', () => {
    expect(formatDocumentDisplay('123')).toBe('123')
    expect(formatCEPDisplay('123')).toBe('123')
  })
})

describe('formatCurrency', () => {
  it('formata em BRL', () => {
    expect(formatCurrency(1234.5).replace(/\u00A0/g, ' ')).toBe('R$ 1.234,50')
    expect(formatCurrency('10').replace(/\u00A0/g, ' ')).toBe('R$ 10,00')
  })
})

describe('formatDate', () => {
  it('dia civil n\u00E3o cai no dia anterior (chave de dia e @db.Date)', () => {
    expect(formatDate('2026-10-15')).toBe('15/10/2026')
    expect(formatDate('2026-10-15T00:00:00.000Z')).toBe('15/10/2026')
    expect(formatDate('2026-10-15T00:00:00Z')).toBe('15/10/2026')
    expect(formatDate(new Date('2026-10-15T00:00:00.000Z'))).toBe('15/10/2026')
  })

  it('data com hora sai no hor\u00E1rio de Bras\u00EDlia, qualquer que seja o fuso do navegador', () => {
    // 02:30 UTC de 15/10 = 23:30 de 14/10 em Bras\u00EDlia
    expect(formatDate('2026-10-15T02:30:00.000Z')).toBe('14/10/2026')
    expect(formatDate(new Date('2026-10-15T02:30:00.000Z'))).toBe('14/10/2026')
    expect(formatDate('2026-10-15T15:00:00.000Z')).toBe('15/10/2026')
  })
})
