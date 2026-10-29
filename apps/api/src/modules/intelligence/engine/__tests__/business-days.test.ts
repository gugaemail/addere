import { describe, it, expect } from 'vitest'
import { daysOverdueOn, previousBusinessDay, ymdToDate } from '../business-days'

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

describe('previousBusinessDay', () => {
  it('terça olha a segunda; segunda olha a sexta', () => {
    expect(previousBusinessDay('20261103', false)).toBe('20261102')
    expect(previousBusinessDay('20261102', false)).toBe('20261030')
  })

  it('com sábado de trabalho, a segunda olha o sábado', () => {
    expect(previousBusinessDay('20261102', true)).toBe('20261031')
  })

  it('vira o mês e o ano', () => {
    expect(previousBusinessDay('20270101', false)).toBe('20261231')
    expect(previousBusinessDay('20261201', false)).toBe('20261130')
  })
})
