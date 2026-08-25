// Hooks de dados da Inteligência no app (E12) — as telas da E13 montam em
// cima destes. Todas as rotas /intel/app/* resolvem o vendedor pelo token;
// escritas offline-safe entram na fila (syncStore) em vez de POST direto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  BriefingDto,
  CustomerSignalListItem,
  CustomerStatus,
  PlanPatchOp,
  VisitPlanDto,
} from '@addere/types'
import { generateUuid } from '../utils/uuid'
import { api } from '../lib/api'
import { queryClient as globalQueryClient } from '../lib/query-client'
import { useSyncStore } from '../store/syncStore'
import { processSyncQueue } from '../services/syncEngine'

export const intelKeys = {
  all: ['intel'] as const,
  home: () => [...intelKeys.all, 'home'] as const,
  plan: (date?: string) => [...intelKeys.all, 'plan', date ?? 'today'] as const,
  signals: (status?: string) => [...intelKeys.all, 'signals', status ?? 'all'] as const,
  briefing: (code: string, loja: string) => [...intelKeys.all, 'briefing', code, loja] as const,
}

// ─── Tipos das respostas (rotas E7) ───

export interface IntelFreshness {
  lastSyncAt: string | null
  stale: boolean
}

export interface HomeResponse {
  llmSummary: string | null
  plan: {
    id: string
    grouping: string | null
    itemsCount: number
    firstStop: string | null
    status: string
  } | null
  portfolio: { total: number; byStatus: Partial<Record<CustomerStatus, number>> }
  freshness: IntelFreshness
}

export interface SignalsListResponse {
  items: CustomerSignalListItem[]
  freshness: IntelFreshness
}

// ─── Leituras ───

export function useHome() {
  return useQuery({
    queryKey: intelKeys.home(),
    queryFn: () => api.get<HomeResponse>('/intel/app/home').then((r) => r.data),
    staleTime: 5 * 60_000,
  })
}

export function usePlan(date?: string) {
  return useQuery({
    queryKey: intelKeys.plan(date),
    queryFn: () =>
      api
        .get<VisitPlanDto | null>('/intel/app/plan', { params: date ? { date } : {} })
        .then((r) => r.data),
    staleTime: 5 * 60_000,
  })
}

export function useCustomerSignals(status?: CustomerStatus) {
  return useQuery({
    queryKey: intelKeys.signals(status),
    queryFn: () =>
      api
        .get<SignalsListResponse>('/intel/app/customers/signals', {
          params: status ? { status } : {},
        })
        .then((r) => r.data),
    staleTime: 5 * 60_000,
  })
}

export function useBriefing(customerCode: string, loja: string, enabled = true) {
  return useQuery({
    queryKey: intelKeys.briefing(customerCode, loja),
    queryFn: () =>
      api
        .get<BriefingDto>(`/intel/app/customers/${customerCode}/${loja}/briefing`)
        .then((r) => r.data),
    enabled: enabled && !!customerCode && !!loja,
    // O servidor cacheia 4h; aqui seguramos 1h para o "antes de entrar" offline
    staleTime: 60 * 60_000,
    gcTime: 6 * 60 * 60_000,
  })
}

/** Pré-busca os briefings das primeiras paradas (≤ 8) para funcionar offline */
export function prefetchBriefings(plan: VisitPlanDto | null | undefined): void {
  if (!plan) return
  for (const item of plan.items.slice(0, 8)) {
    globalQueryClient
      .prefetchQuery({
        queryKey: intelKeys.briefing(item.customerCode, item.loja),
        queryFn: () =>
          api
            .get<BriefingDto>(`/intel/app/customers/${item.customerCode}/${item.loja}/briefing`)
            .then((r) => r.data),
        staleTime: 60 * 60_000,
      })
      .catch(() => undefined)
  }
}

// ─── Escritas (mensagem é online; o restante entra na fila offline) ───

export interface CreateMessageInput {
  customerCode: string
  loja: string
  template: 'STALLED_PROPOSAL' | 'WENT_QUIET' | 'REACTIVATE'
}

export function useMessage() {
  return useMutation({
    mutationFn: (input: CreateMessageInput) =>
      api
        .post<{ id: string; text: string; source: string }>('/intel/app/messages', input)
        .then((r) => r.data),
  })
}

function enqueueAndSync(type: Parameters<ReturnType<typeof useSyncStore.getState>['enqueue']>[0], payload: unknown): string {
  const id = useSyncStore.getState().enqueue(type, payload)
  processSyncQueue().catch(() => undefined)
  return id
}

/** Check-in/resultado de visita — sempre via fila (nunca bloqueia no campo) */
export function useVisitMutation() {
  return {
    checkIn: (payload: {
      clientId: string
      customerCode: string
      loja: string
      arrivedAt: string
      planItemId?: string | null
      lat?: number | null
      lng?: number | null
      accuracyM?: number | null
    }) => enqueueAndSync('visit', payload),
    setResult: (payload: {
      clientId: string
      result: 'ORDER' | 'NO_ORDER' | 'NOT_FOUND' | 'RESCHEDULED'
      leftAt?: string
      noOrderReason?: string | null
      orderId?: string | null
      notes?: string | null
    }) => enqueueAndSync('visitResult', payload),
  }
}

export function useFeedback() {
  return {
    send: (payload: {
      targetType: 'PLAN' | 'ITEM' | 'MESSAGE' | 'ANSWER'
      targetId: string
      rating: 1 | -1
      comment?: string | null
    }) => enqueueAndSync('feedback', payload),
  }
}

// Omit comum colapsa a união discriminada — a versão distributiva preserva cada variante
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** Cria uma op do PATCH já com opId (idempotência no servidor) */
export function makePlanOp(op: DistributiveOmit<PlanPatchOp, 'opId'>): PlanPatchOp {
  return { opId: generateUuid(), ...op } as PlanPatchOp
}

/** Aplicação otimista das ops no DTO em cache — pura, espelha applyPlanOps (E7) */
export function applyOpsOptimistic(plan: VisitPlanDto, ops: PlanPatchOp[]): VisitPlanDto {
  let items = plan.items.map((i) => ({ ...i }))
  let grouping = plan.grouping
  for (const op of ops) {
    if (op.type === 'setGrouping') {
      grouping = op.grouping
      continue
    }
    const target = items.find((i) => i.id === op.itemId)
    if (!target) continue
    if (op.type === 'remove' || op.type === 'skip') target.removedAt = new Date().toISOString()
    if (op.type === 'restore') target.removedAt = null
    if (op.type === 'reorder') {
      const active = items.filter((i) => !i.removedAt && i.id !== op.itemId)
      const clamped = Math.max(1, Math.min(op.position, active.length + 1))
      active.splice(clamped - 1, 0, target)
      const removed = items.filter((i) => i.removedAt)
      items = [...active, ...removed]
    }
  }
  // Renumera ativos 1..n (removidos ao final), como o servidor faz
  const active = items.filter((i) => !i.removedAt)
  const removed = items.filter((i) => i.removedAt)
  active.forEach((item, index) => {
    item.position = index + 1
  })
  return { ...plan, grouping, items: [...active, ...removed], status: 'EDITED' }
}

/** Edição do plano: otimista no cache + fila (applyPlanOps é idempotente) */
export function usePlanPatch(date?: string) {
  const queryClientHook = useQueryClient()
  return {
    apply: (planId: string, ops: PlanPatchOp[]) => {
      const id = enqueueAndSync('planPatch', { planId, ops })
      queryClientHook.setQueryData<VisitPlanDto | null>(intelKeys.plan(date), (current) =>
        current && current.id === planId ? applyOpsOptimistic(current, ops) : current
      )
      return id
    },
  }
}

export function useMessageSent() {
  return {
    markSent: (messageId: string) => enqueueAndSync('messageSent', { messageId }),
  }
}
