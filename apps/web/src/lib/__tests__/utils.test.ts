import { describe, it, expect } from 'vitest'
import {
  maskDocument,
  maskCEP,
  maskPhone,
  formatPhoneDisplay,
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

describe('maskPhone', () => {
  it('formata progressivamente enquanto digita', () => {
    expect(maskPhone('')).toBe('')
    expect(maskPhone('1')).toBe('(1')
    expect(maskPhone('11')).toBe('(11')
    expect(maskPhone('113')).toBe('(11) 3')
    expect(maskPhone('113456')).toBe('(11) 3456')
    expect(maskPhone('1134567')).toBe('(11) 3456-7')
  })

  it('fixo com 10 dígitos e celular com 11', () => {
    expect(maskPhone('1134567890')).toBe('(11) 3456-7890')
    expect(maskPhone('11987654321')).toBe('(11) 98765-4321')
  })

  it('0800/0300 no formato próprio; zero de longa distância sai', () => {
    expect(maskPhone('08001234567')).toBe('0800 123 4567')
    expect(maskPhone('0800')).toBe('0800')
    expect(maskPhone('011987654321')).toBe('(11) 98765-4321')
  })

  it('ignora o que não é dígito, tira o DDI 55 e limita a 11', () => {
    expect(maskPhone('(11) 98765-4321')).toBe('(11) 98765-4321')
    expect(maskPhone('+55 11 98765-4321')).toBe('(11) 98765-4321')
    expect(maskPhone('119876543219999')).toBe('(11) 98765-4321')
  })
})

describe('formatPhoneDisplay', () => {
  it('formata o que já está gravado, inclusive só dígitos (Protheus)', () => {
    expect(formatPhoneDisplay('1134567890')).toBe('(11) 3456-7890')
    expect(formatPhoneDisplay('5511987654321')).toBe('(11) 98765-4321')
    expect(formatPhoneDisplay('(11) 98765-4321')).toBe('(11) 98765-4321')
  })

  it('vazio vira traço; formato desconhecido fica como veio', () => {
    expect(formatPhoneDisplay(null)).toBe('—')
    expect(formatPhoneDisplay('')).toBe('—')
    expect(formatPhoneDisplay('08001234567')).toBe('0800 123 4567')
    expect(formatPhoneDisplay('12345')).toBe('12345')
    expect(formatPhoneDisplay('ramal 22')).toBe('ramal 22')
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
