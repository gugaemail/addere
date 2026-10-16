import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, getApiErrorMessage } from '@/lib/api'
import { billingKeys } from './useBilling'
import type {
  InvoiceDto,
  InvoiceItemKind,
  InvoiceListResponse,
  InvoicePaymentMethod,
  MyInvoiceDto,
} from '@addere/types'

// Faturas (plano 016). As rotas /admin/billing/* são do SUPERADMIN; a
// /billing/me/invoices, do ADMIN da empresa. Toda mutação invalida
// invoicesKeys.all; as de contrato invalidam também a ficha do cliente (013).

export const invoicesKeys = {
  all: ['invoices'] as const,
  list: (filters: InvoiceFilters) => ['invoices', 'list', filters] as const,
  detail: (id: string) => ['invoices', 'detail', id] as const,
  mine: ['invoices', 'me'] as const,
}

export type InvoiceStatusFilter = '' | 'OPEN' | 'OVERDUE' | 'PAID' | 'CANCELLED'

export interface InvoiceFilters {
  status: InvoiceStatusFilter
  competence: string // 'YYYY-MM' ou ''
  companyId: string // '' = todos
  page: number
  pageSize: number
}

export interface ManualItemInput {
  kind: Extract<InvoiceItemKind, 'DISCOUNT' | 'ADJUSTMENT'>
  description: string
  amount: string // '100.00'; DISCOUNT sempre positivo, ADJUSTMENT com sinal
}

export interface ManualInvoiceInput {
  companyId: string
  competence: string // 'YYYY-MM'
  dueDate: string // 'YYYY-MM-DD'
  useContractTerms: boolean
  items: ManualItemInput[]
  notes: string | null
}

export interface PayInvoiceInput {
  paidAt: string // 'YYYY-MM-DD'
  amount: string
  method: InvoicePaymentMethod
  note: string | null
}

export interface BillingTickSummary {
  invoices: {
    competence: string
    created: number
    existing: number
    skipped: number
    failed: number
  } | null
  contractsEnded: number | null
  dueReminders: { sent: number; duplicate: number; skipped: number; failed: number } | null
  documentReminders: { sent: number; duplicate: number; skipped: number; failed: number } | null
  errors: string[]
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useInvoices(filters: InvoiceFilters) {
  return useQuery({
    queryKey: invoicesKeys.list(filters),
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(filters.page),
        pageSize: String(filters.pageSize),
      })
      if (filters.status) params.set('status', filters.status)
      if (filters.competence) params.set('competence', filters.competence)
      if (filters.companyId) params.set('companyId', filters.companyId)
      return api.get<InvoiceListResponse>(`/admin/billing/invoices?${params}`).then((r) => r.data)
    },
    placeholderData: (previous) => previous,
  })
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: invoicesKeys.detail(id),
    queryFn: () => api.get<InvoiceDto>(`/admin/billing/invoices/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useMyInvoices(enabled = true) {
  return useQuery({
    queryKey: invoicesKeys.mine,
    queryFn: () => api.get<MyInvoiceDto[]>('/billing/me/invoices').then((r) => r.data),
    enabled,
  })
}

// ─── Mutações ─────────────────────────────────────────────────────────────────

function useInvalidateInvoices() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: invoicesKeys.all })
}

function useInvalidateContract() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: invoicesKeys.all }),
      queryClient.invalidateQueries({ queryKey: billingKeys.all }),
    ])
}

const onError = (fallback: string) => (err: unknown) =>
  toast.error(getApiErrorMessage(err, fallback))

export function usePayInvoice() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: ({ id, ...input }: PayInvoiceInput & { id: string }) =>
      api.post<InvoiceDto>(`/admin/billing/invoices/${id}/pay`, input).then((r) => r.data),
    onSuccess: invalidate,
    onError: onError('Erro ao dar baixa na fatura.'),
  })
}

export function useCancelInvoice() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<InvoiceDto>(`/admin/billing/invoices/${id}/cancel`, { reason }).then((r) => r.data),
    onSuccess: invalidate,
    onError: onError('Erro ao cancelar a fatura.'),
  })
}

export function useAddInvoiceItem() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: ({ id, ...item }: ManualItemInput & { id: string }) =>
      api.post<InvoiceDto>(`/admin/billing/invoices/${id}/items`, item).then((r) => r.data),
    onSuccess: invalidate,
    onError: onError('Erro ao lançar o item.'),
  })
}

export function useRemoveInvoiceItem() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: ({ id, itemId }: { id: string; itemId: string }) =>
      api.delete<InvoiceDto>(`/admin/billing/invoices/${id}/items/${itemId}`).then((r) => r.data),
    onSuccess: invalidate,
    onError: onError('Erro ao remover o item.'),
  })
}

export function useUpdateInvoice() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; nfNumber: string | null; notes: string | null }) =>
      api.patch<InvoiceDto>(`/admin/billing/invoices/${id}`, input).then((r) => r.data),
    onSuccess: invalidate,
    onError: onError('Erro ao salvar a NF e as observações.'),
  })
}

export function useRecalculateInvoice() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<InvoiceDto>(`/admin/billing/invoices/${id}/recalculate`).then((r) => r.data),
    onSuccess: invalidate,
    onError: onError('Erro ao recalcular a fatura.'),
  })
}

export function useCreateManualInvoice() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: (input: ManualInvoiceInput) =>
      api.post<InvoiceDto>('/admin/billing/invoices', input).then((r) => r.data),
    onSuccess: invalidate,
    onError: onError('Erro ao criar a fatura avulsa.'),
  })
}

export function useRunBillingJobs() {
  const invalidate = useInvalidateContract()
  return useMutation({
    mutationFn: () => api.post<BillingTickSummary>('/admin/billing/jobs/run').then((r) => r.data),
    onSuccess: invalidate,
    onError: onError('Erro ao rodar o faturamento.'),
  })
}

export function useScheduleContractCancel(companyId: string) {
  const invalidate = useInvalidateContract()
  return useMutation({
    mutationFn: (input: { reason: string; deactivateCompany: boolean }) =>
      api
        .post<{ endsAt: string }>(`/admin/billing/clients/${companyId}/contract/cancel`, input)
        .then((r) => r.data),
    onSuccess: invalidate,
    onError: onError('Erro ao agendar o cancelamento do contrato.'),
  })
}

export function useRevertContractCancel(companyId: string) {
  const invalidate = useInvalidateContract()
  return useMutation({
    mutationFn: () =>
      api
        .post<{ reverted: true }>(`/admin/billing/clients/${companyId}/contract/cancel/revert`)
        .then((r) => r.data),
    onSuccess: invalidate,
    onError: onError('Erro ao desfazer o cancelamento do contrato.'),
  })
}
