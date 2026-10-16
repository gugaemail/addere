import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { companiesKeys } from './useCompanies'
import type {
  BillingEventDto,
  BillingSettingsDto,
  ClientDetailDto,
  ClientInput,
  ClientListItemDto,
  CompanyContractDto,
  ContractDraftInput,
  LicensePackageDto,
} from '@addere/types'

// Gestão Addere (plano 013) — só o SUPERADMIN chega às telas que usam estes
// hooks (gestao/layout.tsx), e a API responde 403 a qualquer outro papel.

export const billingKeys = {
  all: ['billing'] as const,
  clients: ['billing', 'clients'] as const,
  client: (id: string) => ['billing', 'clients', id] as const,
  events: (id: string) => ['billing', 'clients', id, 'events'] as const,
  packages: ['billing', 'packages'] as const,
  settings: ['billing', 'settings'] as const,
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
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useClients() {
  return useQuery({
    queryKey: billingKeys.clients,
    queryFn: () => api.get<ClientListItemDto[]>('/admin/billing/clients').then((r) => r.data),
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

export function useUpdateBillingSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BillingSettingsInput) =>
      api.put<BillingSettingsDto>('/admin/billing/settings', input).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: billingKeys.settings }),
  })
}
