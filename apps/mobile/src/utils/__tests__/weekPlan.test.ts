import { mostFrequent, moveTargets, weekSections } from '../weekPlan'
import type { VisitPlanDto, VisitPlanItemDto } from '@addere/types'

const item = (id: string, plannedDate: string | null, position: number, removedAt: string | null = null) =>
  ({ id, plannedDate, position, removedAt, customerCode: id, loja: '01' }) as VisitPlanItemDto

const plan = (items: VisitPlanItemDto[]): VisitPlanDto =>
  ({ id: 'w1', date: '2026-09-14', kind: 'WEEK', items }) as VisitPlanDto

describe('mostFrequent', () => {
  it('devolve o mais comum, ignorando vazios; empate fica com o primeiro', () => {
    expect(mostFrequent(['Campinas', null, 'Valinhos', 'Campinas'])).toBe('Campinas')
    expect(mostFrequent(['A', 'B'])).toBe('A')
    expect(mostFrequent([null, undefined])).toBeNull()
  })
})

describe('weekSections', () => {
  const items = [
    item('a', '2026-09-14', 2), // segunda (já passou)
    item('b', '2026-09-16', 1), // quarta
    item('c', '2026-09-15', 3), // terça
    item('d', '2026-09-15', 1),
    item('e', '2026-09-15', 2, '2026-09-13T10:00:00Z'), // removida
    item('f', null, 4), // sem dia (não deveria acontecer no WEEK)
  ]

  it('só dias >= hoje, em ordem, itens ativos por posição', () => {
    const sections = weekSections(plan(items), '2026-09-15')
    expect(sections.map((s) => s.ymd)).toEqual(['2026-09-15', '2026-09-16'])
    expect(sections[0].data.map((i) => i.id)).toEqual(['d', 'c'])
    expect(sections[0].title).toBe('Ter 15/09 · 2 paradas')
    expect(sections[1].title).toBe('Qua 16/09 · 1 parada')
  })

  it('cabeçalho ganha a cidade mais frequente quando resolvida', () => {
    const city: Record<string, string | null> = { d: 'Campinas', c: 'Campinas', b: null }
    const sections = weekSections(plan(items), '2026-09-15', (i) => city[i.id])
    expect(sections[0].title).toBe('Ter 15/09 · 2 paradas · Campinas')
    expect(sections[1].title).toBe('Qua 16/09 · 1 parada')
  })

  it('sem plano, sem seções', () => {
    expect(weekSections(null, '2026-09-15')).toEqual([])
  })
})

describe('moveTargets', () => {
  it('segunda a sexta da semana, >= hoje e sem o dia atual', () => {
    const targets = moveTargets(plan([item('a', '2026-09-16', 1)]), '2026-09-15', '2026-09-16')
    expect(targets).toEqual(['2026-09-15', '2026-09-17', '2026-09-18'])
  })

  it('inclui sábado só quando o plano já tem parada no sábado', () => {
    const withSaturday = moveTargets(plan([item('a', '2026-09-19', 1)]), '2026-09-14', null)
    expect(withSaturday).toContain('2026-09-19')
    const without = moveTargets(plan([item('a', '2026-09-16', 1)]), '2026-09-14', null)
    expect(without).not.toContain('2026-09-19')
  })
})
