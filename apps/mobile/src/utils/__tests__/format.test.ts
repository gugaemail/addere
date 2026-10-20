import { formatDocument, formatPhone } from '../format'

describe('formatPhone', () => {
  it('fixo e celular com DDD', () => {
    expect(formatPhone('8330481349')).toBe('(83) 3048-1349')
    expect(formatPhone('81992919488')).toBe('(81) 99291-9488')
  })

  it('tira DDI 55, zero de operadora e pontuação', () => {
    expect(formatPhone('+55 81 99291-9488')).toBe('(81) 99291-9488')
    expect(formatPhone('081 3048 1349')).toBe('(81) 3048-1349')
  })

  it('0800 em blocos; formato desconhecido fica como veio; vazio é null', () => {
    expect(formatPhone('08001234567')).toBe('0800 123 4567')
    expect(formatPhone('3048-1349')).toBe('3048-1349')
    expect(formatPhone('')).toBeNull()
    expect(formatPhone(null)).toBeNull()
  })
})

describe('formatDocument', () => {
  it('CPF e CNPJ só com dígitos', () => {
    expect(formatDocument('99576619491')).toBe('995.766.194-91')
    expect(formatDocument('08039087000112')).toBe('08.039.087/0001-12')
  })
})
