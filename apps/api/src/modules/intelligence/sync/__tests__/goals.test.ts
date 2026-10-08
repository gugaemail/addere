import { describe, it, expect } from 'vitest'
import { parseMetaNumber, goalPeriods, normalizeGoalPeriod } from '../goals.service'

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

describe('normalizeGoalPeriod', () => {
  it('aceita os formatos comuns e grava sempre AAAAMM', () => {
    for (const raw of [
      '202610',
      '2026-10',
      '2026/10',
      '10/2026',
      '10-2026',
      '102026',
      '20261001',
    ]) {
      expect(normalizeGoalPeriod(raw, '202601'), raw).toBe('202610')
    }
  })

  it('vazio, desconhecido ou mês inválido → o ANOMES pedido', () => {
    for (const raw of ['', null, undefined, 'outubro', '2026-13', '13/2026']) {
      expect(normalizeGoalPeriod(raw, '202610'), String(raw)).toBe('202610')
    }
  })

  it('número vindo como number também serve', () => {
    expect(normalizeGoalPeriod(202610, '202601')).toBe('202610')
  })
})
