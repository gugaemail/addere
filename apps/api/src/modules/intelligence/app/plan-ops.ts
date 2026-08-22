// Edição do plano pelo vendedor (E7) — puro e IDEMPOTENTE por construção:
// reaplicar o mesmo lote (retry offline) produz o mesmo estado final.
// opId serve para dedup dentro do lote e telemetria (editar é sinal — doc §4.3).
import type { PlanPatchOp } from '@addere/types'

export interface PlanItemState {
  id: string
  position: number
  removed: boolean
}

export interface PlanState {
  grouping: string | null
  items: PlanItemState[]
}

export interface ApplyResult {
  state: PlanState
  applied: string[] // opIds aplicados
  ignored: string[] // opIds duplicados no lote ou com item inexistente
  edited: boolean // algo mudou → plano vira EDITED
}

function normalize(items: PlanItemState[]): PlanItemState[] {
  // Reposiciona 1..n os ativos (ordem estável), removidos ao final mantendo posição relativa
  const active = items.filter((i) => !i.removed).sort((a, b) => a.position - b.position)
  const removed = items.filter((i) => i.removed).sort((a, b) => a.position - b.position)
  const result = [
    ...active.map((item, index) => ({ ...item, position: index + 1 })),
    ...removed.map((item, index) => ({ ...item, position: active.length + index + 1 })),
  ]
  return result
}

export function applyPlanOps(initial: PlanState, ops: PlanPatchOp[]): ApplyResult {
  let state: PlanState = {
    grouping: initial.grouping,
    items: initial.items.map((i) => ({ ...i })),
  }
  const applied: string[] = []
  const ignored: string[] = []
  const seen = new Set<string>()

  for (const op of ops) {
    if (seen.has(op.opId)) {
      ignored.push(op.opId)
      continue
    }
    seen.add(op.opId)

    if (op.type === 'setGrouping') {
      state = { ...state, grouping: op.grouping }
      applied.push(op.opId)
      continue
    }

    const item = state.items.find((i) => i.id === op.itemId)
    if (!item) {
      ignored.push(op.opId)
      continue
    }

    switch (op.type) {
      case 'remove':
      case 'skip': // pular hoje = sair do dia; a distinção fica na telemetria
        item.removed = true
        break
      case 'restore':
        item.removed = false
        break
      case 'reorder': {
        // Move para a posição pedida entre os ATIVOS (1-based, clampado)
        item.removed = false
        const others = state.items
          .filter((i) => !i.removed && i.id !== item.id)
          .sort((a, b) => a.position - b.position)
        const target = Math.max(1, Math.min(op.position, others.length + 1))
        others.splice(target - 1, 0, item)
        others.forEach((i, index) => {
          i.position = index + 1
        })
        break
      }
    }
    applied.push(op.opId)
  }

  state.items = normalize(state.items)
  const edited =
    applied.length > 0 &&
    (state.grouping !== initial.grouping ||
      JSON.stringify(state.items) !==
        JSON.stringify(normalize(initial.items.map((i) => ({ ...i })))))

  return { state, applied, ignored, edited }
}
