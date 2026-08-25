'use client'

// Hooks da Inteligência (E9 esqueleto → E10 completo). companyId entra na key
// para o cache do SUPERADMIN não vazar entre empresas; para os demais papéis o
// backend resolve o tenant pelo token (sentinel 'own' na key).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  HealthReport,
  IntelJobRunDto,
  IntelParameterKey,
  IntelQueryDto,
  IntelligenceConfig,
  QueryPreviewResult,
  ReconciliationResult,
} from '@addere/types'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyContext } from '@/contexts/CompanyContext'

export const intelKeys = {
  all: ['intel'] as const,
  queries: (companyId?: string | null) =>
    [...intelKeys.all, 'queries', companyId ?? 'own'] as const,
  query: (name: string, companyId?: string | null) =>
    [...intelKeys.all, 'query', name, companyId ?? 'own'] as const,
  health: (companyId?: string | null) => [...intelKeys.all, 'health', companyId ?? 'own'] as const,
  parameters: (companyId?: string | null) =>
    [...intelKeys.all, 'parameters', companyId ?? 'own'] as const,
  paramHistory: (companyId?: string | null) =>
    [...intelKeys.all, 'param-history', companyId ?? 'own'] as const,
  config: (companyId?: string | null) => [...intelKeys.all, 'config', companyId ?? 'own'] as const,
  jobs: (companyId?: string | null) => [...intelKeys.all, 'jobs', companyId ?? 'own'] as const,
  team: (date: string, range: string, companyId?: string | null) =>
    [...intelKeys.all, 'team', date, range, companyId ?? 'own'] as const,
  pilotMetrics: (from: string, to: string, companyId?: string | null) =>
    [...intelKeys.all, 'pilot-metrics', from, to, companyId ?? 'own'] as const,
}

// Params de tenant das rotas /intel/*: só SUPERADMIN manda companyId na query
// (resolveTenant da API rejeita companyId de quem não é SUPERADMIN — 403).
export function useIntelCompanyParam(): { companyId?: string } {
  const { isSuperAdmin } = useAuth()
  const { companyId } = useCompanyContext()
  return isSuperAdmin && companyId ? { companyId } : {}
}

// ─── Tipos das respostas (formato das rotas /intel/admin/*) ───

export interface QueryContractDto {
  name: string
  labelPt: string
  frequency: string
  requiredPlaceholders: string[]
  optionalPlaceholders: string[]
  columns: { name: string; required: boolean; kind: string }[]
  referenceSql: string
  helpText: string
  status: 'missing' | 'draft' | 'published'
  query: IntelQueryDto | null
}

export interface QueriesResponse {
  contracts: QueryContractDto[]
  goalMeta: { viaApi: boolean; lastSnapshotAt: string | null }
  sqlEndpointConfigured: boolean
}

export interface ParameterRow {
  key: IntelParameterKey
  value: unknown
  segment: string
  isDefault: boolean
  changedBy: string | null
  updatedAt: string | null
}

export interface ParameterHistoryRow {
  key: string
  value: unknown
  segment: string
  changedBy: string | null
  changedAt: string
}

export type IntelJobRunWithMeta = IntelJobRunDto & { metadata?: unknown }

// geocoding chega com a E15-F1 (branch paralela) — opcional até o merge
export type HealthResponse = HealthReport & {
  fixes: { type: string; code: string; detail: string }[]
  config: IntelligenceConfig
  geocoding?: {
    byPrecision: Record<string, number>
    failed: number
    withoutPin: number
  }
}

export interface ConfigResponse {
  intelligenceEnabled: boolean
  config: IntelligenceConfig
}

// ─── W3 · Consultas ───

export function useIntelQueries() {
  const params = useIntelCompanyParam()
  return useQuery({
    queryKey: intelKeys.queries(params.companyId),
    queryFn: () => api.get<QueriesResponse>('/intel/admin/queries', { params }).then((r) => r.data),
  })
}

export interface SaveDraftInput {
  sql: string
  definition?: string
  exclusions?: string
  gotchas?: string
}

export function useSaveQueryDraft(name: string) {
  const params = useIntelCompanyParam()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveDraftInput) =>
      api
        .put<IntelQueryDto>(`/intel/admin/queries/${name}`, { ...input, ...params })
        .then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: intelKeys.all }),
  })
}

export function usePreviewQuery(name: string) {
  const params = useIntelCompanyParam()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api
        .post<QueryPreviewResult>(`/intel/admin/queries/${name}/preview`, { ...params })
        .then((r) => r.data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: intelKeys.queries(params.companyId) }),
  })
}

export function useReconcileQuery(name: string) {
  const params = useIntelCompanyParam()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { period: string; refAmount: number }) =>
      api
        .post<ReconciliationResult>(`/intel/admin/queries/${name}/reconcile`, {
          ...input,
          ...params,
        })
        .then((r) => r.data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: intelKeys.queries(params.companyId) }),
  })
}

export function usePublishQuery(name: string) {
  const params = useIntelCompanyParam()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api
        .post<IntelQueryDto>(`/intel/admin/queries/${name}/publish`, { ...params })
        .then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: intelKeys.all }),
  })
}

export function useBackfillQuery(name: string) {
  const params = useIntelCompanyParam()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api
        .post<{ runId: string }>(`/intel/admin/queries/${name}/backfill`, { ...params })
        .then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: intelKeys.jobs(params.companyId) }),
  })
}

// ─── W4 · Saúde ───

export function useIntelHealth() {
  const params = useIntelCompanyParam()
  return useQuery({
    queryKey: intelKeys.health(params.companyId),
    queryFn: () => api.get<HealthResponse>('/intel/admin/health', { params }).then((r) => r.data),
  })
}

// ─── Jobs (status + rodar agora) ───

export function useJobsStatus(options?: { refetchInterval?: number | false }) {
  const params = useIntelCompanyParam()
  return useQuery({
    queryKey: intelKeys.jobs(params.companyId),
    queryFn: () =>
      api
        .get<{ latest: IntelJobRunWithMeta[]; recent: IntelJobRunWithMeta[] }>(
          '/intel/admin/jobs/status',
          { params }
        )
        .then((r) => r.data),
    refetchInterval: options?.refetchInterval ?? false,
  })
}

export function useRunJob() {
  const params = useIntelCompanyParam()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (job: 'nightly' | 'refresh') =>
      api.post<{ runId: string }>('/intel/admin/jobs/run', { job, ...params }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: intelKeys.jobs(params.companyId) }),
  })
}

// ─── W5 · Premissas ───

export function useIntelParameters() {
  const params = useIntelCompanyParam()
  return useQuery({
    queryKey: intelKeys.parameters(params.companyId),
    queryFn: () =>
      api
        .get<{ parameters: ParameterRow[] }>('/intel/admin/parameters', { params })
        .then((r) => r.data.parameters),
  })
}

export function useParameterHistory(enabled: boolean) {
  const params = useIntelCompanyParam()
  return useQuery({
    queryKey: intelKeys.paramHistory(params.companyId),
    queryFn: () =>
      api
        .get<{ history: ParameterHistoryRow[] }>('/intel/admin/parameters/history', { params })
        .then((r) => r.data.history),
    enabled,
  })
}

export function useSaveParameters() {
  const params = useIntelCompanyParam()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (values: Partial<Record<IntelParameterKey, unknown>>) =>
      api.put('/intel/admin/parameters', { values, ...params }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: intelKeys.parameters(params.companyId) })
      queryClient.invalidateQueries({ queryKey: intelKeys.paramHistory(params.companyId) })
    },
  })
}

// ─── Config da empresa (aba Inteligência) ───
// companyIdOverride: a aba vive em /empresas/[id] (SUPERADMIN), fora do
// CompanyContext — o id vem da própria página.

export function useIntelConfig(companyIdOverride?: string) {
  const contextParams = useIntelCompanyParam()
  const params = companyIdOverride ? { companyId: companyIdOverride } : contextParams
  return useQuery({
    queryKey: intelKeys.config(params.companyId),
    queryFn: () => api.get<ConfigResponse>('/intel/admin/config', { params }).then((r) => r.data),
  })
}

// O corpo do PUT herda o nome do campo da resposta de propósito: quando os dois
// divergem, o Zod da API descarta a chave desconhecida em silêncio e a flag
// nunca é gravada — o painel salvava `enabled` e a rota espera
// `intelligenceEnabled`, então o botão voltava sozinho depois de cada save.
type SaveIntelConfigInput = Partial<Pick<ConfigResponse, 'intelligenceEnabled'>> & {
  config?: Partial<IntelligenceConfig>
}

export function useSaveIntelConfig(companyIdOverride?: string) {
  const contextParams = useIntelCompanyParam()
  const params = companyIdOverride ? { companyId: companyIdOverride } : contextParams
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SaveIntelConfigInput) =>
      api.put<ConfigResponse>('/intel/admin/config', { ...input, ...params }).then((r) => r.data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: intelKeys.config(params.companyId) }),
  })
}

// ─── W1 · Equipe em campo (E11) ───

export type TeamRange = 'day' | 'week' | 'month'

export interface TeamAlert {
  kind: 'NO_PLAN' | 'FEW_VISITS' | 'STALE_DATA'
  message: string
}

export interface TeamSellerCard {
  userId: string
  name: string
  vendorCode: string
  planned: number
  done: number
  outOfPlan: number
  adherencePct: number | null
  visitPositivationPct: number | null
  portfolioPositivationPct: number | null
  alerts: TeamAlert[]
}

export interface TeamReportResponse {
  range: { fromYmd: string; toYmd: string }
  lastSyncAt: string | null
  totals: {
    sellers: number
    planned: number
    done: number
    adherencePct: number | null
    visitPositivationPct: number | null
    portfolioPositivationPct: number | null
  }
  sellers: TeamSellerCard[]
  alerts: TeamAlert[]
  unassignedSellers: number
}

/**
 * @param date 'YYYY-MM-DD' — a API ancora a janela nesse dia.
 * @param enabled desliga a busca quando não há tenant a resolver (SUPERADMIN
 *   sem empresa escolhida) — sem isso a home dispara um 400 garantido.
 */
export function useTeamReport(date: string, range: TeamRange, enabled = true) {
  const companyParams = useIntelCompanyParam()
  return useQuery({
    enabled,
    queryKey: intelKeys.team(date, range, companyParams.companyId),
    queryFn: () =>
      api
        .get<TeamReportResponse>('/intel/manager/team', {
          params: { date, range, ...companyParams },
        })
        .then((r) => r.data),
  })
}

export interface MetricRatio {
  total: number
  hits: number
  pct: number | null
}

export interface PilotMetricsResponse {
  range: { fromYmd: string; toYmd: string }
  conversionDays: number
  portfolioPositivation: MetricRatio
  suggestionConversion: MetricRatio
  outOfPlanConversion: MetricRatio
  liftPp: number | null
  atRiskRecovery: MetricRatio
}

/** @param from/to 'YYYY-MM-DD'. `enabled` desliga a busca enquanto não há período. */
export function usePilotMetrics(from: string, to: string, enabled = true) {
  const companyParams = useIntelCompanyParam()
  return useQuery({
    enabled,
    queryKey: intelKeys.pilotMetrics(from, to, companyParams.companyId),
    queryFn: () =>
      api
        .get<PilotMetricsResponse>('/intel/manager/pilot-metrics', {
          params: { from, to, ...companyParams },
        })
        .then((r) => r.data),
  })
}
