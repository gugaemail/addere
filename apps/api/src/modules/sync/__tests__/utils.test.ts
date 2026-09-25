import { describe, it, expect } from 'vitest'
import {
  toStr,
  toNum,
  parseJsonField,
  parseProtheusDate,
  formatDateDDMMYYYY,
  buildPhone,
} from '../utils'

describe('toStr', () => {
  it('converte primitivos e apara espaços', () => {
    expect(toStr('  abc  ')).toBe('abc')
    expect(toStr(42)).toBe('42')
    expect(toStr(true)).toBe('true')
  })

  it('usa fallback para nulos e objetos', () => {
    expect(toStr(null, 'x')).toBe('x')
    expect(toStr(undefined)).toBe('')
    expect(toStr({ a: 1 }, 'f')).toBe('f')
  })
})

describe('toNum', () => {
  it('converte número e string com vírgula decimal', () => {
    expect(toNum(3.5)).toBe(3.5)
    expect(toNum('3,5')).toBe(3.5)
    expect(toNum('10')).toBe(10)
  })

  it('usa fallback para valores não numéricos', () => {
    expect(toNum('abc')).toBe(0)
    expect(toNum(null, 7)).toBe(7)
  })
})

describe('parseJsonField', () => {
  it('parseia string JSON e aceita objeto pronto', () => {
    expect(parseJsonField('{"atual": 12.5}')).toEqual({ atual: 12.5 })
    expect(parseJsonField({ atual: 1 })).toEqual({ atual: 1 })
  })

  it('retorna objeto vazio para JSON inválido ou tipos errados', () => {
    expect(parseJsonField('not json')).toEqual({})
    expect(parseJsonField(null)).toEqual({})
    expect(parseJsonField(42)).toEqual({})
  })
})

describe('parseProtheusDate', () => {
  it('parseia YYYYMMDD', () => {
    const d = parseProtheusDate('20260815')
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(7)
    expect(d?.getDate()).toBe(15)
  })

  it('retorna null para vazio, tamanho errado ou inválido', () => {
    expect(parseProtheusDate('')).toBeNull()
    expect(parseProtheusDate('2026081')).toBeNull()
    expect(parseProtheusDate(null)).toBeNull()
    expect(parseProtheusDate('abcdefgh')).toBeNull()
  })
})

describe('formatDateDDMMYYYY', () => {
  it('formata com zeros à esquerda', () => {
    expect(formatDateDDMMYYYY(new Date(2026, 0, 5))).toBe('05/01/2026')
  })
})

describe('buildPhone', () => {
  it('monta com e sem DDD', () => {
    expect(buildPhone('31', '99999-0000')).toBe('(31) 99999-0000')
    expect(buildPhone('', '99999-0000')).toBe('99999-0000')
    expect(buildPhone('31', '')).toBeNull()
  })
})
