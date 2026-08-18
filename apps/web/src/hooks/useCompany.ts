import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { companiesKeys } from './useCompanies'
import type {
  CompanyDetail,
  CompanyFieldConfig,
  CompanyOrder,
  Customer,
  Product,
  ProtheusLogPage,
  SyncSchedule,
} from '@addere/types'

// Resultado das rotas POST /sync/*
export interface SyncResult {
  synced: number
  total: number
  errors: string[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useCompany(id: string) {
  return useQuery({
    queryKey: companiesKeys.detail(id),
    queryFn: () => api.get<CompanyDetail>(`/companies/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCompanyCustomers(id: string) {
  return useQuery({
    queryKey: companiesKeys.entity(id, 'customers'),
    queryFn: () => api.get<Customer[]>(`/companies/${id}/customers`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCompanyProducts(id: string) {
  return useQuery({
    queryKey: companiesKeys.entity(id, 'products'),
    queryFn: () => api.get<Product[]>(`/companies/${id}/products`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCompanyOrders(id: string) {
  return useQuery({
    queryKey: companiesKeys.entity(id, 'orders'),
    queryFn: () => api.get<CompanyOrder[]>(`/companies/${id}/orders`).then((r) => r.data),
    enabled: !!id,
  })
}

export interface ProtheusLogFilters {
  page: number
  operation: string
  success: '' | 'true' | 'false'
}

export function useCompanyProtheusLogs(id: string, filters: ProtheusLogFilters) {
  return useQuery({
    queryKey: [...companiesKeys.entity(id, 'logs'), filters],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(filters.page), limit: '20' })
      if (filters.operation) params.set('operation', filters.operation)
      if (filters.success) params.set('success', filters.success)
      return api
        .get<ProtheusLogPage>(`/companies/${id}/protheus-logs?${params}`)
        .then((r) => r.data)
    },
    enabled: !!id,
  })
}

export function useCompanyFieldConfig(id: string) {
  return useQuery({
    queryKey: companiesKeys.entity(id, 'field-config'),
    queryFn: () => api.get<CompanyFieldConfig>(`/companies/${id}/field-config`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCompanySyncSchedule(id: string) {
  return useQuery({
    queryKey: companiesKeys.entity(id, 'sync-schedule'),
    queryFn: () => api.get<SyncSchedule>(`/companies/${id}/sync-schedule`).then((r) => r.data),
    enabled: !!id,
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useToggleCompany(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (active: boolean) => api.patch(`/companies/${id}/active`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companiesKeys.all }),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Erro ao alterar status da empresa.')),
  })
}

type ToggleEntity = 'branches' | 'users' | 'customers' | 'products'

// Ativa/desativa filial, usuário, cliente ou produto da empresa
export function useToggleCompanyEntity(companyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      entity,
      entityId,
      active,
    }: {
      entity: ToggleEntity
      entityId: string
      active: boolean
    }) => api.patch(`/companies/${companyId}/${entity}/${entityId}/active`, { active }),
    onSuccess: (_data, { entity }) => {
      // Filiais e usuários vêm embutidos no detalhe da empresa
      if (entity === 'branches' || entity === 'users') {
        queryClient.invalidateQueries({ queryKey: companiesKeys.detail(companyId) })
      } else {
        queryClient.invalidateQueries({ queryKey: companiesKeys.entity(companyId, entity) })
      }
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'Erro ao alterar status.')),
  })
}

export function useCancelOrder(companyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderId: string) => api.patch(`/companies/${companyId}/orders/${orderId}/cancel`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: companiesKeys.entity(companyId, 'orders') }),
    onError: (err) => toast.error(getApiErrorMessage(err, 'Erro ao cancelar pedido.')),
  })
}

export function useSaveFieldConfig(companyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (config: CompanyFieldConfig) =>
      api.patch(`/companies/${companyId}/field-config`, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companiesKeys.entity(companyId, 'field-config') })
      toast.success('Configuração de campos salva!')
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, 'Erro ao salvar configuração de campos.')),
  })
}

export function useSaveSyncSchedule(companyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (schedule: SyncSchedule) =>
      api.patch(`/companies/${companyId}/sync-schedule`, schedule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: companiesKeys.entity(companyId, 'sync-schedule') })
      toast.success('Configuração de auto-sync salva!')
    },
    onError: (err) =>
      toast.error(getApiErrorMessage(err, 'Erro ao salvar configuração de auto-sync.')),
  })
}

// ─── Sync Protheus ───────────────────────────────────────────────────────────

export type SyncEntity = 'products' | 'customers' | 'transportadoras' | 'cond-pags'

export const SYNC_ENTITY_LABELS: Record<SyncEntity, string> = {
  products: 'Produtos',
  customers: 'Clientes',
  transportadoras: 'Transportadoras',
  'cond-pags': 'Condições de pagamento',
}

// Sincroniza uma entidade via Protheus (substitui as 4 funções syncX idênticas)
export function useRunSync(companyId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (entity: SyncEntity) =>
      api.post<SyncResult>(`/sync/${entity}`, { companyId }).then((r) => r.data),
    onSuccess: (_data, entity) => {
      if (entity === 'products' || entity === 'customers') {
        queryClient.invalidateQueries({ queryKey: companiesKeys.entity(companyId, entity) })
      }
    },
  })
}
