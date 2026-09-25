import { describe, it, expect } from 'vitest'
import { computeHealthyPct, nextNightlyAt, fixesToCsv } from '../health.service'

describe('computeHealthyPct', () => {
  it('média simples arredondada', () => {
    expect(computeHealthyPct([100, 100, 100])).toBe(100)
    expect(computeHealthyPct([90, 80, 100])).toBe(90)
    expect(computeHealthyPct([])).toBe(100)
  })
})

describe('nextNightlyAt', () => {
  it('antes da hora → hoje às syncHour BRT', () => {
    // 04:00 UTC = 01:00 BRT — antes das 03h
    const next = nextNightlyAt(new Date('2026-08-21T04:00:00Z'), 3)
    expect(next.toISOString()).toBe('2026-08-21T06:00:00.000Z')
  })

  it('depois da hora → amanhã', () => {
    // 12:00 UTC = 09:00 BRT — já passou das 03h
    const next = nextNightlyAt(new Date('2026-08-21T12:00:00Z'), 3)
    expect(next.toISOString()).toBe('2026-08-22T06:00:00.000Z')
  })
})

describe('fixesToCsv', () => {
  it('cabeçalho + linhas com ; escapado', () => {
    const csv = fixesToCsv([
      { type: 'cliente_sem_cidade', code: '000123', detail: 'ACME; filial SP' },
    ])
    expect(csv.split('\n')).toEqual([
      'tipo;codigo;detalhe',
      'cliente_sem_cidade;000123;ACME, filial SP',
    ])
  })
})
