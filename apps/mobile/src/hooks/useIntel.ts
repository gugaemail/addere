// Hooks de dados da Inteligência no app (E12) — as telas da E13 montam em
// cima destes. Todas as rotas /intel/app/* resolvem o vendedor pelo token;
// escritas offline-safe entram na fila (syncStore) em vez de POST direto.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CustomerStatus, VisitPlanDto } from '@addere/types'
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

export interface BriefingResponse {
  customer: { name: string; municipio: string | null }
  briefing: {
    whatHappened: string
    whyItMatters: string
    whatToDo: string
    confidence: string
  } | null
  snapshot: unknown
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
        .get('/intel/app/customers/signals', { params: status ? { status } : {} })
        .then((r) => r.data),
    staleTime: 5 * 60_000,
  })
}

export function useBriefing(customerCode: string, loja: string, enabled = true) {
  return useQuery({
    queryKey: intelKeys.briefing(customerCode, loja),
    queryFn: () =>
      api
        .get<BriefingResponse>(`/intel/app/customers/${customerCode}/${loja}/briefing`)
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
            .get<BriefingResponse>(`/intel/app/customers/${item.customerCode}/${item.loja}/briefing`)
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

export interface PlanOp {
  op: 'remove' | 'restore' | 'move'
  itemId: string
  toPosition?: number
}

/** Edição do plano: otimista no cache + fila (applyPlanOps é idempotente) */
export function usePlanPatch(date?: string) {
  const queryClientHook = useQueryClient()
  return {
    apply: (planId: string, ops: PlanOp[]) => {
      const id = enqueueAndSync('planPatch', { planId, ops })
      // Otimista: marca removidos/restaurados no cache local do plano
      queryClientHook.setQueryData<VisitPlanDto | null>(intelKeys.plan(date), (current) => {
        if (!current || current.id !== planId) return current
        const items = current.items.map((item) => {
          const removeOp = ops.find((o) => o.itemId === item.id && o.op === 'remove')
          const restoreOp = ops.find((o) => o.itemId === item.id && o.op === 'restore')
          if (removeOp) return { ...item, removedAt: new Date().toISOString() }
          if (restoreOp) return { ...item, removedAt: null }
          return item
        })
        return { ...current, items, status: 'EDITED' as VisitPlanDto['status'] }
      })
      return id
    },
  }
}

export function useMessageSent() {
  return {
    markSent: (messageId: string) => enqueueAndSync('messageSent', { messageId }),
  }
}
