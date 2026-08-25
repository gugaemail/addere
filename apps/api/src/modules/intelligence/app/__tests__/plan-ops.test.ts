import { describe, it, expect } from 'vitest'
import { applyPlanOps, type PlanState } from '../plan-ops'

const state = (): PlanState => ({
  grouping: 'Campinas',
  items: [
    { id: 'a', position: 1, removed: false },
    { id: 'b', position: 2, removed: false },
    { id: 'c', position: 3, removed: false },
  ],
})

const positions = (s: PlanState) =>
  [...s.items].sort((a, b) => a.position - b.position).map((i) => `${i.id}${i.removed ? '-' : ''}`)

describe('applyPlanOps', () => {
  it('reorder move para a posição e reindexa', () => {
    const r = applyPlanOps(state(), [{ opId: '1', type: 'reorder', itemId: 'c', position: 1 }])
    expect(positions(r.state)).toEqual(['c', 'a', 'b'])
    expect(r.edited).toBe(true)
  })

  it('remove/skip tiram do dia (vão ao final) e restore devolve', () => {
    const removed = applyPlanOps(state(), [{ opId: '1', type: 'remove', itemId: 'a' }])
    expect(positions(removed.state)).toEqual(['b', 'c', 'a-'])

    const restored = applyPlanOps(removed.state, [{ opId: '2', type: 'restore', itemId: 'a' }])
    expect(restored.state.items.find((i) => i.id === 'a')?.removed).toBe(false)
  })

  it('setGrouping troca o agrupamento do dia', () => {
    const r = applyPlanOps(state(), [{ opId: '1', type: 'setGrouping', grouping: 'Valinhos' }])
    expect(r.state.grouping).toBe('Valinhos')
    expect(r.edited).toBe(true)
  })

  it('opId duplicado no lote é ignorado (idempotência)', () => {
    const r = applyPlanOps(state(), [
      { opId: 'x', type: 'remove', itemId: 'a' },
      { opId: 'x', type: 'remove', itemId: 'b' }, // mesmo opId → ignorado
    ])
    expect(r.applied).toEqual(['x'])
    expect(r.ignored).toEqual(['x'])
    expect(r.state.items.find((i) => i.id === 'b')?.removed).toBe(false)
  })

  it('reaplicar o MESMO lote produz o MESMO estado final (retry offline)', () => {
    const ops = [
      { opId: '1', type: 'reorder' as const, itemId: 'c', position: 1 },
      { opId: '2', type: 'remove' as const, itemId: 'b' },
    ]
    const once = applyPlanOps(state(), ops)
    const twice = applyPlanOps(once.state, ops)
    expect(positions(twice.state)).toEqual(positions(once.state))
  })

  it('item inexistente → op ignorada sem quebrar o lote', () => {
    const r = applyPlanOps(state(), [
      { opId: '1', type: 'remove', itemId: 'zzz' },
      { opId: '2', type: 'remove', itemId: 'a' },
    ])
    expect(r.ignored).toEqual(['1'])
    expect(r.applied).toEqual(['2'])
  })

  it('posição além do fim clampa para o final', () => {
    const r = applyPlanOps(state(), [{ opId: '1', type: 'reorder', itemId: 'a', position: 99 }])
    expect(positions(r.state)).toEqual(['b', 'c', 'a'])
  })

  it('lote sem mudança real → edited=false', () => {
    const r = applyPlanOps(state(), [{ opId: '1', type: 'restore', itemId: 'a' }])
    expect(r.edited).toBe(false)
  })
})
