import { addDays, dayLabel, mondayOf, saoPauloYmd, weekdayOf } from '../calendar'

describe('calendar (fuso de São Paulo)', () => {
  it('saoPauloYmd usa o dia civil de SP, não o UTC', () => {
    // 01:30 UTC de 14/09 ainda é 22:30 de 13/09 em São Paulo (UTC-3)
    expect(saoPauloYmd(new Date('2026-09-14T01:30:00Z'))).toBe('2026-09-13')
    expect(saoPauloYmd(new Date('2026-09-14T12:00:00Z'))).toBe('2026-09-14')
  })

  it('addDays atravessa mês e ano', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
  })

  it('weekdayOf segue 0=dom … 6=sáb', () => {
    expect(weekdayOf('2026-09-13')).toBe(0) // domingo
    expect(weekdayOf('2026-09-14')).toBe(1) // segunda
    expect(weekdayOf('2026-09-19')).toBe(6) // sábado
  })

  it('mondayOf devolve a segunda da semana (segunda a domingo)', () => {
    expect(mondayOf('2026-09-14')).toBe('2026-09-14')
    expect(mondayOf('2026-09-16')).toBe('2026-09-14')
    expect(mondayOf('2026-09-20')).toBe('2026-09-14') // domingo fecha a semana
  })

  it('dayLabel abrevia o dia da semana em PT', () => {
    expect(dayLabel('2026-09-14')).toBe('Seg 14/09')
    expect(dayLabel('2026-09-19')).toBe('Sáb 19/09')
  })
})
