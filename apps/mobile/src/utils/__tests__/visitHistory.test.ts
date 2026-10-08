import {
  currentMonthToDate,
  dayHeaderLabel,
  durationLabel,
  historyPeriodLabel,
  historyPeriodRange,
  lastDayOfMonth,
  previousMonthOf,
  previousMonthRange,
  sectionsByDay,
  visitMetaLine,
} from '../visitHistory'
import type { VisitHistoryItemDto } from '@addere/types'

const item = (over: Partial<VisitHistoryItemDto> = {}): VisitHistoryItemDto => ({
  id: 'v1',
  ymd: '2026-09-14',
  arrivedAt: '2026-09-14T11:12:00.000Z', // 08:12 em São Paulo (UTC-3)
  durationMin: 24,
  source: 'CHECKIN',
  channel: null,
  customerCode: 'A',
  loja: '01',
  customerName: 'Cliente A',
  planned: true,
  result: 'ORDER',
  noOrderReason: null,
  orderId: null,
  ...over,
})

describe('dayHeaderLabel', () => {
  it('dia cheio maiúsculo com vírgula — "SEGUNDA, 14/09"', () => {
    expect(dayHeaderLabel('2026-09-14')).toBe('SEGUNDA, 14/09')
    expect(dayHeaderLabel('2026-09-15')).toBe('TERÇA, 15/09')
  })
})

describe('durationLabel', () => {
  it('minutos abaixo de uma hora', () => {
    expect(durationLabel(24)).toBe('24 min')
    expect(durationLabel(1)).toBe('1 min')
  })

  it('duração zero: "menos de 1 min" — visita real nunca dura zero, não confundir com "registrada pelo pedido"', () => {
    expect(durationLabel(0)).toBe('menos de 1 min')
  })

  it('horas e minutos acima de 60, só "Xh" quando exato', () => {
    expect(durationLabel(65)).toBe('1h05min')
    expect(durationLabel(120)).toBe('2h')
  })
})

describe('visitMetaLine', () => {
  it('hora de São Paulo + duração quando há leftAt', () => {
    expect(visitMetaLine(item())).toBe('08:12 · 24 min')
  })

  it('sem leftAt (durationMin null), só a hora — nunca inventa duração', () => {
    expect(visitMetaLine(item({ durationMin: null }))).toBe('08:12')
  })

  it('à distância (source REMOTE): o canal no lugar da duração, nunca o tempo', () => {
    expect(visitMetaLine(item({ source: 'REMOTE', channel: 'PHONE', durationMin: 7 }))).toBe(
      '08:12 · por telefone'
    )
    expect(visitMetaLine(item({ source: 'REMOTE', channel: 'WHATSAPP' }))).toBe('08:12 · por WhatsApp')
    expect(visitMetaLine(item({ source: 'REMOTE', channel: null }))).toBe('08:12 · à distância')
  })

  it('visita nascida do pedido (source ORDER): "registrada pelo pedido", nunca "0 min"', () => {
    expect(visitMetaLine(item({ source: 'ORDER', durationMin: null }))).toBe(
      '08:12 · registrada pelo pedido'
    )
  })
})

describe('lastDayOfMonth', () => {
  it('fevereiro bissexto termina em 29', () => {
    expect(lastDayOfMonth(2028, 2)).toBe(29) // 2028 é bissexto
  })

  it('fevereiro comum termina em 28', () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28)
  })

  it('mês de 31 dias não vira 30 — vem do calendário, não de dia1 + 30', () => {
    expect(lastDayOfMonth(2026, 1)).toBe(31) // janeiro
    expect(lastDayOfMonth(2026, 7)).toBe(31) // julho
  })
})

describe('previousMonthOf', () => {
  it('janeiro cai em dezembro do ano anterior (virada explícita)', () => {
    expect(previousMonthOf('2026-01-15')).toEqual({ year: 2025, month: 12 })
  })

  it('mês comum só decresce, sem virar ano', () => {
    expect(previousMonthOf('2026-03-10')).toEqual({ year: 2026, month: 2 })
  })
})

describe('currentMonthToDate', () => {
  it('do dia 1 do mês até hoje — não vai até o fim do mês', () => {
    expect(currentMonthToDate('2026-09-23')).toEqual({ from: '2026-09-01', to: '2026-09-23' })
  })
})

describe('previousMonthRange', () => {
  it('mês anterior inteiro, do dia 1 ao último dia do calendário', () => {
    expect(previousMonthRange('2026-03-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })

  it('janeiro: mês anterior é dezembro do ano passado, com 31 dias', () => {
    expect(previousMonthRange('2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  it('fevereiro bissexto fecha em 29, não em 28', () => {
    expect(previousMonthRange('2028-03-05')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
})

describe('historyPeriodRange / historyPeriodLabel', () => {
  it('"current" é Este mês; "previous" é Mês passado', () => {
    expect(historyPeriodLabel('current')).toBe('Este mês')
    expect(historyPeriodLabel('previous')).toBe('Mês passado')
    expect(historyPeriodRange('current', '2026-09-23')).toEqual(currentMonthToDate('2026-09-23'))
    expect(historyPeriodRange('previous', '2026-09-23')).toEqual(previousMonthRange('2026-09-23'))
  })
})

describe('sectionsByDay', () => {
  it('agrupa por ymd preservando a ordem de chegada dentro do dia', () => {
    const items = [
      item({ id: 'a', ymd: '2026-09-15', customerCode: 'A' }),
      item({ id: 'b', ymd: '2026-09-14', customerCode: 'B' }),
      item({ id: 'c', ymd: '2026-09-15', customerCode: 'C' }),
    ]
    const sections = sectionsByDay(items)
    expect(sections.map((s) => s.ymd)).toEqual(['2026-09-15', '2026-09-14'])
    expect(sections[0].title).toBe('TERÇA, 15/09')
    expect(sections[0].data.map((i) => i.id)).toEqual(['a', 'c'])
    expect(sections[1].data.map((i) => i.id)).toEqual(['b'])
  })

  it('sem itens, sem seções', () => {
    expect(sectionsByDay([])).toEqual([])
  })
})
