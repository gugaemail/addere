// Competência do faturamento (plano 016). Horários em UTC; São Paulo é UTC−3.
// O erro de dinheiro que estes testes seguram: às 22h de Brasília do dia 31 já
// é dia 1 em UTC, e o gerador não pode faturar o mês antes de ele acabar.
import { describe, expect, it } from 'vitest'
import { computeBillingCalendar } from '@addere/types'
import {
  addMonthsYm,
  competenceAt,
  competenceEnd,
  competenceStart,
  dateToCompetence,
  dateToIsoDay,
  dueDateFor,
  isoDayToDate,
  isoToYm,
  previousCompetenceAt,
  todaySaoPaulo,
  ymToIso,
} from '../competence'

const day = (d: Date) => d.toISOString().slice(0, 10)

describe('previousCompetenceAt — 22h de Brasília do último dia do mês', () => {
  it('31/10 às 22h em São Paulo ainda fatura setembro', () => {
    expect(previousCompetenceAt(new Date('2026-11-01T01:00:00Z'))).toBe('202609')
  })

  it('01/11 à 0h em São Paulo fatura outubro', () => {
    expect(previousCompetenceAt(new Date('2026-11-01T03:00:00Z'))).toBe('202610')
  })

  it('31/12 às 22h em São Paulo ainda fatura novembro', () => {
    expect(previousCompetenceAt(new Date('2027-01-01T01:00:00Z'))).toBe('202611')
  })

  it('01/01 à 0h em São Paulo fatura dezembro (virada de ano)', () => {
    expect(previousCompetenceAt(new Date('2027-01-01T03:00:00Z'))).toBe('202612')
  })

  it('competenceAt segue o mesmo fuso', () => {
    expect(competenceAt(new Date('2026-11-01T02:59:59Z'))).toBe('202610')
    expect(competenceAt(new Date('2026-11-01T03:00:00Z'))).toBe('202611')
  })
})

describe('dueDateFor', () => {
  it('dueDay 1 e 10', () => {
    expect(day(dueDateFor('202610', 1))).toBe('2026-11-01')
    expect(day(dueDateFor('202610', 10))).toBe('2026-11-10')
  })

  it('virada de ano', () => {
    expect(day(dueDateFor('202612', 10))).toBe('2027-01-10')
  })

  it('recusa dueDay fora de 1 a 10', () => {
    expect(() => dueDateFor('202610', 0)).toThrow(RangeError)
    expect(() => dueDateFor('202610', 11)).toThrow(RangeError)
    expect(() => dueDateFor('202610', 31)).toThrow(RangeError)
  })

  it('mesma regra que o 013: a primeira competência vence na data de computeBillingCalendar', () => {
    const cases = [
      { acceptDate: new Date('2026-10-15T15:00:00Z'), graceMonths: 0, dueDay: 5 },
      { acceptDate: new Date('2026-11-01T02:30:00Z'), graceMonths: 2, dueDay: 1 },
      { acceptDate: new Date('2026-12-20T12:00:00Z'), graceMonths: 1, dueDay: 10 },
      { acceptDate: new Date('2026-10-01T03:00:00Z'), graceMonths: 12, dueDay: 7 },
    ]
    for (const input of cases) {
      const cal = computeBillingCalendar(input)
      const first = dateToCompetence(cal.firstBilledCompetence)
      expect(day(dueDateFor(first, input.dueDay))).toBe(day(cal.firstDueDate))
    }
  })
})

describe('conversões', () => {
  it('início e fim da competência como @db.Date', () => {
    expect(day(competenceStart('202602'))).toBe('2026-02-01')
    expect(day(competenceEnd('202602'))).toBe('2026-02-28')
    expect(day(competenceEnd('202802'))).toBe('2028-02-29')
    expect(day(competenceEnd('202610'))).toBe('2026-10-31')
    expect(competenceStart('202610').toISOString()).toBe('2026-10-01T00:00:00.000Z')
  })

  it('addMonthsYm atravessa o ano nos dois sentidos', () => {
    expect(addMonthsYm('202612', 1)).toBe('202701')
    expect(addMonthsYm('202701', -1)).toBe('202612')
    expect(addMonthsYm('202610', 14)).toBe('202712')
  })

  it("'YYYYMM' ↔ 'YYYY-MM'", () => {
    expect(ymToIso('202610')).toBe('2026-10')
    expect(isoToYm('2026-10')).toBe('202610')
    expect(() => isoToYm('2026-13')).toThrow(RangeError)
    expect(() => isoToYm('202610')).toThrow(RangeError)
    expect(() => competenceStart('202600')).toThrow(RangeError)
  })

  it('todaySaoPaulo: 23h59 de 31/10 em São Paulo ainda é 31/10', () => {
    expect(day(todaySaoPaulo(new Date('2026-11-01T02:59:00Z')))).toBe('2026-10-31')
    expect(day(todaySaoPaulo(new Date('2026-11-01T03:00:00Z')))).toBe('2026-11-01')
  })

  it("dia civil viaja como 'YYYY-MM-DD'", () => {
    expect(dateToIsoDay(new Date('2026-11-10T00:00:00.000Z'))).toBe('2026-11-10')
    expect(isoDayToDate('2026-11-10')?.toISOString()).toBe('2026-11-10T00:00:00.000Z')
    expect(isoDayToDate('2026-02-30')).toBeNull()
    expect(isoDayToDate('10/11/2026')).toBeNull()
  })
})
