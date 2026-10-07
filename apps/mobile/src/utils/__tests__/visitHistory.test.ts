import { dayHeaderLabel, durationLabel, sectionsByDay, visitMetaLine } from '../visitHistory'
import type { VisitHistoryItemDto } from '@addere/types'

const item = (over: Partial<VisitHistoryItemDto> = {}): VisitHistoryItemDto => ({
  id: 'v1',
  ymd: '2026-09-14',
  arrivedAt: '2026-09-14T11:12:00.000Z', // 08:12 em São Paulo (UTC-3)
  durationMin: 24,
  source: 'CHECKIN',
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
    expect(durationLabel(0)).toBe('0 min')
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

  it('visita nascida do pedido (source ORDER): "registrada pelo pedido", nunca "0 min"', () => {
    expect(visitMetaLine(item({ source: 'ORDER', durationMin: null }))).toBe(
      '08:12 · registrada pelo pedido'
    )
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
