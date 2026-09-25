import { describe, it, expect } from 'vitest'
import { parseMetaNumber, goalPeriods } from '../goals.service'

describe('parseMetaNumber', () => {
  it('formato BR com milhar e vírgula', () => {
    expect(parseMetaNumber('1.234,56')).toBe(1234.56)
    expect(parseMetaNumber('R$ 12.345,00')).toBe(12345)
  })

  it('formato US e número puro', () => {
    expect(parseMetaNumber('1234.56')).toBe(1234.56)
    expect(parseMetaNumber('1,234.56')).toBe(1234.56)
    expect(parseMetaNumber(987.65)).toBe(987.65)
  })

  it('vazio/inválido vira null', () => {
    expect(parseMetaNumber('')).toBeNull()
    expect(parseMetaNumber(null)).toBeNull()
    expect(parseMetaNumber(undefined)).toBeNull()
    expect(parseMetaNumber('abc')).toBeNull()
  })
})

describe('goalPeriods', () => {
  it('mês atual + anterior', () => {
    expect(goalPeriods(new Date('2026-08-21T12:00:00Z'))).toEqual(['202608', '202607'])
  })

  it('virada de ano: janeiro → dezembro do ano anterior', () => {
    expect(goalPeriods(new Date('2026-01-10T12:00:00Z'))).toEqual(['202601', '202512'])
  })
})
