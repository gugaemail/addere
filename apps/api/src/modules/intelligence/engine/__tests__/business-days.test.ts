import { describe, it, expect } from 'vitest'
import { daysOverdueOn, ymdToDate } from '../business-days'

describe('daysOverdueOn', () => {
  it('não vencido ou vencendo hoje → 0', () => {
    expect(daysOverdueOn(ymdToDate('20261008'), '20261008')).toBe(0)
    expect(daysOverdueOn(ymdToDate('20261020'), '20261008')).toBe(0)
  })

  it('venceu ontem → 1', () => {
    expect(daysOverdueOn(ymdToDate('20261007'), '20261008')).toBe(1)
  })

  it('atravessa virada de mês e de ano', () => {
    expect(daysOverdueOn(ymdToDate('20260930'), '20261001')).toBe(1)
    expect(daysOverdueOn(ymdToDate('20251231'), '20260101')).toBe(1)
    expect(daysOverdueOn(ymdToDate('20251201'), '20260101')).toBe(31)
  })

  it('fevereiro bissexto conta o dia 29', () => {
    expect(daysOverdueOn(ymdToDate('20280228'), '20280301')).toBe(2)
    expect(daysOverdueOn(ymdToDate('20270228'), '20270301')).toBe(1)
  })
})
