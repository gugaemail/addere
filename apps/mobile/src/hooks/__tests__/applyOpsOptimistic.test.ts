// useIntel importa lib/api (valida env no import) e o syncStore (AsyncStorage
// nativo) — mocks antes de tudo, no mesmo padrão de useSyncQueue.test
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}))
jest.mock('../../lib/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn(), prefetchQuery: jest.fn() },
}))
jest.mock('../../services/syncEngine', () => ({
  processSyncQueue: jest.fn().mockResolvedValue(undefined),
}))
// useIntel → useProfile → auth.store (SecureStore + env): o teste é puro, não roda hooks
jest.mock('../../store/auth.store', () => ({ useAuthStore: jest.fn() }))

import { applyOpsOptimistic, makePlanOp } from '../useIntel'
import type { VisitPlanDto, VisitPlanItemDto } from '@addere/types'

function item(id: string, position: number, removedAt: string | null = null): VisitPlanItemDto {
  return {
    id,
    position,
    customerCode: id.toUpperCase(),
    loja: '01',
    customerName: `Cliente ${id}`,
    customerAddress: null,
    customerPhone: null,
    statusAtTime: 'LATE',
    shortReason: null,
    suggestedOffer: null,
    expectedAmount: null,
    origin: 'ENGINE',
    removedAt,
    signals: null,
    lat: null,
    lng: null,
    plannedTime: null,
  }
}

function plan(items: VisitPlanItemDto[]): VisitPlanDto {
  return {
    id: 'plan-1',
    date: '2026-08-23',
    kind: 'DAY',
    status: 'GENERATED',
    generatedAt: '2026-08-23T06:00:00Z',
    grouping: 'Campinas',
    expectedAmount: null,
    llmSummary: null,
    items,
    freshness: { lastSyncAt: null, stale: false },
    goal: null,
  }
}

describe('applyOpsOptimistic (espelha applyPlanOps do servidor)', () => {
  it('remove marca removedAt, renumera ativos e vira EDITED', () => {
    const result = applyOpsOptimistic(plan([item('a', 1), item('b', 2), item('c', 3)]), [
      makePlanOp({ type: 'remove', itemId: 'b' }),
    ])
    const active = result.items.filter((i) => !i.removedAt)
    expect(active.map((i) => [i.id, i.position])).toEqual([
      ['a', 1],
      ['c', 2],
    ])
    expect(result.items.find((i) => i.id === 'b')?.removedAt).not.toBeNull()
    expect(result.status).toBe('EDITED')
  })

  it('reorder move para a posição pedida (clampada)', () => {
    const result = applyOpsOptimistic(plan([item('a', 1), item('b', 2), item('c', 3)]), [
      makePlanOp({ type: 'reorder', itemId: 'c', position: 1 }),
    ])
    expect(result.items.filter((i) => !i.removedAt).map((i) => i.id)).toEqual(['c', 'a', 'b'])

    const clamped = applyOpsOptimistic(plan([item('a', 1), item('b', 2)]), [
      makePlanOp({ type: 'reorder', itemId: 'a', position: 99 }),
    ])
    expect(clamped.items.filter((i) => !i.removedAt).map((i) => i.id)).toEqual(['b', 'a'])
  })

  it('restore devolve para o fim dos ativos; setGrouping troca o agrupamento', () => {
    const removed = item('b', 2, '2026-08-23T08:00:00Z')
    const result = applyOpsOptimistic(plan([item('a', 1), removed]), [
      makePlanOp({ type: 'restore', itemId: 'b' }),
      makePlanOp({ type: 'setGrouping', grouping: 'Valinhos' }),
    ])
    expect(result.items.filter((i) => !i.removedAt).map((i) => i.id)).toEqual(['a', 'b'])
    expect(result.grouping).toBe('Valinhos')
  })

  it('op de item inexistente é ignorada (idempotência do retry)', () => {
    const base = plan([item('a', 1)])
    const result = applyOpsOptimistic(base, [makePlanOp({ type: 'remove', itemId: 'zzz' })])
    expect(result.items.filter((i) => !i.removedAt)).toHaveLength(1)
  })

  it('makePlanOp gera opId único', () => {
    const a = makePlanOp({ type: 'remove', itemId: 'x' })
    const b = makePlanOp({ type: 'remove', itemId: 'x' })
    expect(a.opId).not.toBe(b.opId)
    expect(a.opId).toMatch(/^[0-9a-f-]{36}$/)
  })
})
