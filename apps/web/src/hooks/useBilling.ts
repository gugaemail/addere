import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { companiesKeys } from './useCompanies'
import type {
  BillingDashboardDto,
  BillingEventDto,
  BillingSettingsDto,
  ClientBlockState,
  ClientDetailDto,
  ClientInput,
  ClientListItemDto,
  CompanyContractDto,
  ContractDraftInput,
  LicensePackageDto,
  LlmBudgetDto,
  LlmBudgetInput,
  LlmUsageDetailDto,
  LlmUsageListDto,
  LicenseRequestDecision,
  LicenseRequestDto,
  LicenseRequestInput,
  LicenseRequestStatus,
  SeatUsage,
} from '@addere/types'

// Gestão Addere (plano 013) — só o SUPERADMIN chega às telas que usam estes
// hooks (gestao/layout.tsx), e a API responde 403 a qualquer outro papel. A
// exceção são as licenças do 015: useSeats e useCreateLicenseRequest também
// servem ao ADMIN da empresa.

export const billingKeys = {
  all: ['billing'] as const,
  clients: ['billing', 'clients'] as const,
  client: (id: string) => ['billing', 'clients', id] as const,
  events: (id: string) => ['billing', 'clients', id, 'events'] as const,
  packages: ['billing', 'packages'] as const,
  settings: ['billing', 'settings'] as const,
  // Plano 015
  seats: ['billing', 'seats'] as const,
  seatsOf: (companyId: string | undefined) => ['billing', 'seats', companyId ?? 'me'] as const,
  licenseRequests: (filters: LicenseRequestFilters) =>
    ['billing', 'license-requests', filters.status ?? 'ALL', filters.companyId ?? 'ALL'] as const,
  // Plano 018: debaixo da raiz, para toda mutação que invalida billingKeys.all
  // (contrato, aditivo, pedido de licenças, faturas) atualizar o painel
  dashboard: ['billing', 'dashboard'] as const,
  // Custo de IA: a lista do mês e o detalhe de cada cliente
  llmUsage: ['billing', 'llm-usage'] as const,
  llmUsageOf: (id: string) => ['billing', 'llm-usage', id] as const,
}

export interface LicenseRequestFilters {
  status?: LicenseRequestStatus
  companyId?: string
}

export interface PackageInput {
  name: string
  seats: number | null // null = quantidade definida no contrato
  listPriceStandard: string | null
  listPriceIntelligence: string | null
  listExtraSeatPriceStandard: string | null
  listExtraSeatPriceIntelligence: string | null
  sortOrder: number
}

export interface BillingSettingsInput {
  overdueBlockDays: number
  dueReminderDays: number
  notifyEmail: string | null
  /** Plano 017: o switch do bloqueio automático; sem a chave, a API mantém o valor */
  autoBlockEnabled?: boolean
}

/** Resposta do "Liberar até…" (plano 017) */
export interface UnblockClientResult {
  block: ClientBlockState
  /** null = sem data, nenhum e-mail; false = liberado, mas o e-mail não saiu */
  emailSent: boolean | null
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** Painel da Gestão Addere (plano 018). Sem refetchInterval: atualiza por invalidação. */
export function useBillingDashboard() {
  const { isSuperAdmin } = useAuth()
  return useQuery({
    queryKey: billingKeys.dashboard,
    queryFn: () => api.get<BillingDashboardDto>('/admin/billing/dashboard').then((r) => r.data),
    enabled: isSuperAdmin,
  })
}

export function useClients() {
  return useQuery({
    queryKey: billingKeys.clients,
    queryFn: () => api.get<ClientListItemDto[]>('/admin/billing/clients').then((r) => r.data),
  })
}

// Custo de IA do mês por cliente. Carrega à parte da lista: a cotação do dólar
// pode demorar e não segura a tabela de clientes
export function useLlmUsage() {
  return useQuery({
    queryKey: billingKeys.llmUsage,
    queryFn: () => api.get<LlmUsageListDto>('/admin/billing/llm-usage').then((r) => r.data),
  })
}

export function useClientLlmUsage(id: string) {
  return useQuery({
    queryKey: billingKeys.llmUsageOf(id),
    queryFn: () =>
      api.get<LlmUsageDetailDto>(`/admin/billing/clients/${id}/llm-usage`).then((r) => r.data),
  })
}

export function useUpdateLlmBudget(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LlmBudgetInput) =>
      api.put<LlmBudgetDto>(`/admin/billing/clients/${id}/llm-budget`, input).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: billingKeys.llmUsage })
      queryClient.invalidateQueries({ queryKey: billingKeys.events(id) })
    },
  })
}

export function useClient(id: string) {
  return useQuery({
    queryKey: billingKeys.client(id),
    queryFn: () => api.get<ClientDetailDto>(`/admin/billing/clients/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useClientEvents(id: string) {
  return useQuery({
    queryKey: billingKeys.events(id),
    queryFn: () =>
      api.get<BillingEventDto[]>(`/admin/billing/clients/${id}/events`).then((r) => r.data),
    enabled: !!id,
  })
}

export function usePackages() {
  return useQuery({
    queryKey: billingKeys.packages,
    queryFn: () => api.get<LicensePackageDto[]>('/admin/billing/packages').then((r) => r.data),
  })
}

export function useBillingSettings() {
  return useQuery({
    queryKey: billingKeys.settings,
    queryFn: () => api.get<BillingSettingsDto>('/admin/billing/settings').then((r) => r.data),
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

// Mutação de cliente invalida também as empresas: o seletor de empresa do menu
// lê GET /companies
function useInvalidateClients() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: billingKeys.all }),
      queryClient.invalidateQueries({ queryKey: companiesKeys.all }),
    ])
}

// A empresa nasce pelo POST /companies, que aceita o cadastro comercial
export function useCreateClient() {
  const invalidate = useInvalidateClients()
  return useMutation({
    mutationFn: ({ idProtheus, ...input }: ClientInput) =>
      api
        // O POST /companies não aceita idProtheus null: vazio vai sem a chave
        .post<{ id: string }>('/companies', { ...input, idProtheus: idProtheus ?? undefined })
        .then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useUpdateClient(id: string) {
  const invalidate = useInvalidateClients()
  return useMutation({
    mutationFn: (input: ClientInput) =>
      api.put<ClientDetailDto>(`/admin/billing/clients/${id}`, input).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useSaveContractDraft(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ContractDraftInput) =>
      api
        .put<CompanyContractDto>(`/admin/billing/clients/${id}/contract`, input)
        .then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.all }),
  })
}

export function useCreatePackage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PackageInput & { code: string }) =>
      api.post<LicensePackageDto>('/admin/billing/packages', input).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.all }),
  })
}

export function useUpdatePackage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: PackageInput & { id: string }) =>
      api.patch<LicensePackageDto>(`/admin/billing/packages/${id}`, input).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.all }),
  })
}

export function useSetPackageActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api
        .patch<LicensePackageDto>(`/admin/billing/packages/${id}/active`, { active })
        .then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.all }),
  })
}

// Plano 017: "Liberar até…" da ficha. Invalida a ficha, o histórico e a lista
export function useUnblockClient(companyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { until?: string }) =>
      api
        .post<UnblockClientResult>(`/admin/billing/clients/${companyId}/unblock`, input)
        .then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.all }),
  })
}

export function useUpdateBillingSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BillingSettingsInput) =>
      api.put<BillingSettingsDto>('/admin/billing/settings', input).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.settings }),
  })
}

// ─── Licenças (plano 015) ────────────────────────────────────────────────────

/**
 * Licenças em uso da empresa. `undefined` = a do token (ADMIN); um id = a
 * empresa pedida (SUPERADMIN, empresa ativa ou a ficha); `null` = SUPERADMIN
 * sem empresa ativa, e a consulta fica desligada.
 */
export function useSeats(companyId?: string | null) {
  return useQuery({
    queryKey: billingKeys.seatsOf(companyId ?? undefined),
    queryFn: () =>
      api
        .get<SeatUsage>('/billing/me/seats', { params: companyId ? { companyId } : undefined })
        .then((r) => r.data),
    enabled: companyId !== null,
  })
}

/** O pedido do administrador indicado; quem chama recarrega o GET /billing/me */
export function useCreateLicenseRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LicenseRequestInput) =>
      api.post<LicenseRequestDto>('/billing/me/license-requests', input).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.all }),
  })
}

export function useLicenseRequests(filters: LicenseRequestFilters = {}) {
  return useQuery({
    queryKey: billingKeys.licenseRequests(filters),
    queryFn: () =>
      api
        .get<LicenseRequestDto[]>('/admin/billing/license-requests', { params: filters })
        .then((r) => r.data),
  })
}

export function useDecideLicenseRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...decision }: LicenseRequestDecision & { id: string }) =>
      api
        .post<LicenseRequestDto>(`/admin/billing/license-requests/${id}/decide`, decision)
        .then((r) => r.data),
    // A aprovação muda o limite, os termos e a situação na lista de clientes
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.all }),
  })
}
