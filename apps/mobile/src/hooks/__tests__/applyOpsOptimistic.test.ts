// useIntel importa lib/api (valida env no import) e o syncStore (AsyncStorage
// nativo) — mocks antes de tudo, no mesmo padrão de useSyncQueue.test
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('../../lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), put: jest.fn() },
}))
jest.mock('../../lib/query-client', () => ({
  queryClient: { invalidateQueries: jest.fn(), prefetchQuery: jest.fn() },
}))
jest.mock('../../services/syncEngine', () => ({
  processSyncQueue: jest.fn().mockResolvedValue(undefined),
}))
// useIntel → useProfile → auth.store (SecureStore + env): o teste é puro, não roda hooks
jest.mock('../../store/auth.store', () => ({ useAuthStore: jest.fn() }))

import { applyOpsOptimistic, intelKeys, makePlanOp } from '../useIntel'
import type { VisitPlanDto, VisitPlanItemDto } from '@addere/types'

function item(
  id: string,
  position: number,
  removedAt: string | null = null,
  plannedDate: string | null = null
): VisitPlanItemDto {
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
    distFromPrevM: null,
    etaMin: null,
    plannedDate,
  }
}

function plan(items: VisitPlanItemDto[], kind: VisitPlanDto['kind'] = 'DAY'): VisitPlanDto {
  return {
    id: 'plan-1',
    date: '2026-08-23',
    kind,
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

  describe('moveToDay (plano semanal, E18)', () => {
    const week = () =>
      plan(
        [
          item('a', 1, null, '2026-09-15'),
          item('b', 2, null, '2026-09-15'),
          item('c', 3, null, '2026-09-16'),
          item('d', 4, null, '2026-09-17'),
          item('x', 5, '2026-09-13T10:00:00Z', '2026-09-15'),
        ],
        'WEEK'
      )

    it('muda plannedDate e leva a parada para o fim do dia de destino', () => {
      const result = applyOpsOptimistic(week(), [
        makePlanOp({ type: 'moveToDay', itemId: 'a', date: '2026-09-16' }),
      ])
      const active = result.items.filter((i) => !i.removedAt)
      expect(active.map((i) => [i.id, i.plannedDate, i.position])).toEqual([
        ['b', '2026-09-15', 1],
        ['c', '2026-09-16', 2],
        ['a', '2026-09-16', 3],
        ['d', '2026-09-17', 4],
      ])
      // Removida continua fora da numeração, ao final
      expect(result.items[result.items.length - 1].id).toBe('x')
    })

    it('mover para um dia ainda sem paradas insere na ordem cronológica', () => {
      const result = applyOpsOptimistic(week(), [
        makePlanOp({ type: 'moveToDay', itemId: 'd', date: '2026-09-14' }),
      ])
      expect(result.items.filter((i) => !i.removedAt).map((i) => i.id)).toEqual(['d', 'a', 'b', 'c'])
      expect(result.items[0].position).toBe(1)
    })

    it('mover para o mesmo dia mantém a parada no fim do dia', () => {
      const result = applyOpsOptimistic(week(), [
        makePlanOp({ type: 'moveToDay', itemId: 'a', date: '2026-09-15' }),
      ])
      expect(result.items.filter((i) => !i.removedAt).map((i) => i.id)).toEqual(['b', 'a', 'c', 'd'])
    })
  })

  it('makePlanOp gera opId único', () => {
    const a = makePlanOp({ type: 'remove', itemId: 'x' })
    const b = makePlanOp({ type: 'remove', itemId: 'x' })
    expect(a.opId).not.toBe(b.opId)
    expect(a.opId).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('intelKeys (cache persistido não pode servir o plano de ontem)', () => {
  it('plano e home carregam o dia civil de São Paulo na chave', () => {
    const today = /^\d{4}-\d{2}-\d{2}$/
    expect(intelKeys.plan()[2]).toMatch(today)
    expect(intelKeys.home()[2]).toMatch(today)
    expect(intelKeys.plan('2026-09-10')).toEqual(['intel', 'plan', '2026-09-10'])
  })

  it('semana usa a segunda-feira e fica sob o prefixo do plano (invalidação da fila)', () => {
    const key = intelKeys.week()
    expect(key.slice(0, 3)).toEqual(['intel', 'plan', 'week'])
    expect(key[3]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(`${key[3]}T00:00:00Z`).getUTCDay()).toBe(1)
  })
})
