// Hooks de dados da Inteligência no app (E12/Fase 2) — as telas montam em
// cima destes. Todas as rotas /intel/app/* resolvem o vendedor pelo token;
// escritas offline-safe entram na fila (syncStore) em vez de POST direto.
import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import type {
  BriefingDto,
  CustomerSignalListItem,
  CustomerStatus,
  CustomerWindowDto,
  PlanPatchOp,
  PortfolioDto,
  StockDto,
  VisitPlanDto,
} from '@addere/types'
import { generateUuid } from '../utils/uuid'
import { mondayOf, saoPauloYmd } from '../utils/calendar'
import type { WindowInput } from '../utils/customerWindows'
import { api } from '../lib/api'
import { useHasVendorCode } from './useProfile'
import { queryClient as globalQueryClient } from '../lib/query-client'
import { useSyncStore } from '../store/syncStore'
import { processSyncQueue } from '../services/syncEngine'

export const intelKeys = {
  all: ['intel'] as const,
  // O dia civil de São Paulo entra na chave: o cache persistido (7 dias)
  // guardava o plano sob 'today' e, no dia seguinte, quando a API respondia
  // 404, o app continuava mostrando o plano de ontem.
  home: () => [...intelKeys.all, 'home', saoPauloYmd()] as const,
  plan: (date?: string) => [...intelKeys.all, 'plan', date ?? saoPauloYmd()] as const,
  week: () => [...intelKeys.all, 'plan', 'week', mondayOf(saoPauloYmd())] as const,
  signals: (status?: string) => [...intelKeys.all, 'signals', status ?? 'all'] as const,
  briefing: (code: string, loja: string) => [...intelKeys.all, 'briefing', code, loja] as const,
  portfolio: () => [...intelKeys.all, 'portfolio'] as const,
  windows: (code: string, loja: string) => [...intelKeys.all, 'windows', code, loja] as const,
  stock: (productCode: string) => [...intelKeys.all, 'stock', productCode] as const,
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

// Sem `import axios` aqui: o adapter fetch do axios sonda ReadableStream ao
// carregar e derruba o worker do jest-expo — por isso lib/api é sempre mockado
// nos testes. As checagens abaixo leem a forma do AxiosError (isAxiosError,
// response), o mesmo que axios.isAxiosError faz.
interface HttpErrorShape {
  isAxiosError?: boolean
  response?: { status?: number }
}

const asHttpError = (err: unknown): HttpErrorShape | null =>
  typeof err === 'object' && err !== null ? (err as HttpErrorShape) : null

/** 404 = "ainda não há" (o motor monta o plano de madrugada): vira null, não erro */
function nullOn404<T>(err: unknown): Promise<T | null> {
  if (asHttpError(err)?.response?.status === 404) return Promise.resolve(null)
  return Promise.reject(err)
}

/** Falha do axios sem resposta HTTP = rede (offline, DNS, timeout) */
export function isNetworkError(err: unknown): boolean {
  const e = asHttpError(err)
  return !!e && e.isAxiosError === true && e.response === undefined
}

// ─── Leituras ───

// As rotas /intel/app/* exigem carteira (idVendProt) — sem ela respondem 422.
// O gerente não tem: as leituras ficam desligadas em vez de bater na parede.
export function useHome() {
  const hasVendorCode = useHasVendorCode()
  return useQuery({
    queryKey: intelKeys.home(),
    queryFn: () => api.get<HomeResponse>('/intel/app/home').then((r) => r.data),
    enabled: hasVendorCode,
    staleTime: 5 * 60_000,
  })
}

export function usePlan(date?: string) {
  const hasVendorCode = useHasVendorCode()
  return useQuery({
    queryKey: intelKeys.plan(date),
    queryFn: () =>
      api
        .get<VisitPlanDto>('/intel/app/plan', { params: date ? { date } : {} })
        .then((r) => r.data)
        .catch(nullOn404<VisitPlanDto>),
    enabled: hasVendorCode,
    staleTime: 5 * 60_000,
  })
}

/** Plano da semana (E18) — GET /intel/app/plan?kind=week; 404 = ainda não montado */
export function useWeekPlan() {
  const hasVendorCode = useHasVendorCode()
  return useQuery({
    queryKey: intelKeys.week(),
    queryFn: () =>
      api
        .get<VisitPlanDto>('/intel/app/plan', { params: { kind: 'week' } })
        .then((r) => r.data)
        .catch(nullOn404<VisitPlanDto>),
    enabled: hasVendorCode,
    staleTime: 5 * 60_000,
  })
}

/** Carteira do vendedor (E19) — GET /intel/app/portfolio */
export function usePortfolio() {
  const hasVendorCode = useHasVendorCode()
  return useQuery({
    queryKey: intelKeys.portfolio(),
    queryFn: () => api.get<PortfolioDto>('/intel/app/portfolio').then((r) => r.data),
    enabled: hasVendorCode,
    staleTime: 5 * 60_000,
  })
}

export function useCustomerSignals(status?: CustomerStatus) {
  const hasVendorCode = useHasVendorCode()
  return useQuery({
    queryKey: intelKeys.signals(status),
    queryFn: () =>
      api
        .get<SignalsListResponse>('/intel/app/customers/signals', {
          params: status ? { status } : {},
        })
        .then((r) => r.data),
    enabled: hasVendorCode,
    staleTime: 5 * 60_000,
  })
}

export function useBriefing(customerCode: string, loja: string, enabled = true) {
  const hasVendorCode = useHasVendorCode()
  return useQuery({
    queryKey: intelKeys.briefing(customerCode, loja),
    queryFn: () =>
      api
        .get<BriefingDto>(`/intel/app/customers/${customerCode}/${loja}/briefing`)
        .then((r) => r.data),
    enabled: enabled && hasVendorCode && !!customerCode && !!loja,
    // O servidor cacheia 4h; aqui seguramos 1h para o "antes de entrar" offline
    staleTime: 60 * 60_000,
    gcTime: 6 * 60 * 60_000,
  })
}

/** Janelas de atendimento do cliente (E16) — GET /intel/app/customers/:code/:loja/windows */
export function useCustomerWindows(customerCode: string, loja: string, enabled = true) {
  const hasVendorCode = useHasVendorCode()
  return useQuery({
    queryKey: intelKeys.windows(customerCode, loja),
    queryFn: () =>
      api
        .get<{ windows: CustomerWindowDto[] }>(`/intel/app/customers/${customerCode}/${loja}/windows`)
        .then((r) => r.data.windows),
    enabled: enabled && hasVendorCode && !!customerCode && !!loja,
    staleTime: 5 * 60_000,
  })
}

/**
 * Estoque ao vivo (E22) — GET /intel/app/stock/:productCode. Consulta sob
 * demanda (`enabled: false` + `refetch()`): pode levar ~8 s quando é ao vivo,
 * então nada dispara sozinho. Sem retry: 404 = produto não existe.
 */
export function useStock(productCode: string) {
  return useQuery({
    queryKey: intelKeys.stock(productCode),
    queryFn: () =>
      api
        .get<StockDto>(`/intel/app/stock/${encodeURIComponent(productCode)}`, { timeout: 15_000 })
        .then((r) => r.data),
    enabled: false,
    retry: false,
    staleTime: 60_000,
    // Saldo envelhece rápido: não vale ocupar o cache persistido por dias
    gcTime: 5 * 60_000,
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

// ─── Escritas (mensagem e janelas são online; o restante entra na fila offline) ───

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

export interface SaveWindowsInput {
  customerCode: string
  loja: string
  /** Lista completa das janelas do vendedor para o cliente (PUT substitui) */
  windows: WindowInput[]
}

/** PUT /intel/app/customers/:code/:loja/windows — online, sem fila (E16) */
export function useSaveCustomerWindows() {
  const queryClientHook = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveWindowsInput) =>
      api
        .put<{ windows: CustomerWindowDto[] }>(
          `/intel/app/customers/${input.customerCode}/${input.loja}/windows`,
          { windows: input.windows }
        )
        .then((r) => r.data.windows),
    onSuccess: (windows, input) => {
      const key = intelKeys.windows(input.customerCode, input.loja)
      queryClientHook.setQueryData<CustomerWindowDto[]>(key, windows)
      queryClientHook.invalidateQueries({ queryKey: key })
    },
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
    if (op.type === 'moveToDay') {
      // Plano semanal (E18): a parada vai para o fim do dia de destino — os
      // ativos ficam ordenados por (plannedDate, position), como no servidor
      target.plannedDate = op.date
      const active = items.filter((i) => !i.removedAt && i.id !== op.itemId)
      let insertAt = 0
      active.forEach((i, index) => {
        if ((i.plannedDate ?? '') <= op.date) insertAt = index + 1
      })
      active.splice(insertAt, 0, target)
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

/** Edição do plano em uma chave de cache: otimista + fila (applyPlanOps é idempotente) */
function usePlanPatchOnKey(queryKey: QueryKey) {
  const queryClientHook = useQueryClient()
  // A chave é recriada a cada render; a identidade estável evita recriar os
  // callbacks das telas (useCallback) sem necessidade
  const keyString = JSON.stringify(queryKey)
  return useMemo(
    () => ({
      apply: (planId: string, ops: PlanPatchOp[]) => {
        const id = enqueueAndSync('planPatch', { planId, ops })
        queryClientHook.setQueryData<VisitPlanDto | null>(JSON.parse(keyString), (current) =>
          current && current.id === planId ? applyOpsOptimistic(current, ops) : current
        )
        return id
      },
    }),
    [queryClientHook, keyString]
  )
}

/** Edição do plano do dia (mesma chave de usePlan) */
export function usePlanPatch(date?: string) {
  return usePlanPatchOnKey(intelKeys.plan(date))
}

/** Edição do plano da semana (mesma chave de useWeekPlan) — E18 */
export function useWeekPlanPatch() {
  return usePlanPatchOnKey(intelKeys.week())
}

export function useMessageSent() {
  return {
    markSent: (messageId: string) => enqueueAndSync('messageSent', { messageId }),
  }
}
