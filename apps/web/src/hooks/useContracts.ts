import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { billingKeys } from './useBilling'
import type {
  AmendmentInput,
  ClientDocumentsDto,
  ContractDocumentDto,
  ContractDocumentKind,
  ContractTemplateDto,
  ContractTemplateSummaryDto,
  DocumentPreviewDto,
  DocumentSendResultDto,
  MyBillingDto,
  MyDocumentsDto,
  TemplatePreviewDto,
} from '@addere/types'

// Contrato de licença de uso e aceite (plano 014). As rotas /admin/billing/*
// são do SUPERADMIN; as /billing/me/*, do ADMIN da empresa.
//
// Toda mutação que muda contrato ou documento invalida também billingKeys.all:
// a situação do cliente na lista e na ficha (013) muda junto.

export const contractKeys = {
  all: ['contracts'] as const,
  templates: ['contracts', 'templates'] as const,
  template: (id: string) => ['contracts', 'templates', id] as const,
  clientDocuments: (companyId: string) => ['contracts', 'client', companyId] as const,
  adminDocument: (id: string) => ['contracts', 'document', id] as const,
  me: ['contracts', 'me'] as const,
  myDocuments: ['contracts', 'me', 'documents'] as const,
  myDocument: (id: string) => ['contracts', 'me', 'documents', id] as const,
}

function useInvalidateContracts() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: contractKeys.all }),
      queryClient.invalidateQueries({ queryKey: billingKeys.all }),
    ])
}

// ─── Modelos (SUPERADMIN) ────────────────────────────────────────────────────

export function useContractTemplates() {
  return useQuery({
    queryKey: contractKeys.templates,
    queryFn: () =>
      api
        .get<ContractTemplateSummaryDto[]>('/admin/billing/contract-templates')
        .then((r) => r.data),
  })
}

export function useContractTemplate(id: string | null) {
  return useQuery({
    queryKey: contractKeys.template(id ?? ''),
    queryFn: () =>
      api.get<ContractTemplateDto>(`/admin/billing/contract-templates/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}

export function useCreateTemplateVersion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { kind: ContractDocumentKind; fromTemplateId?: string }) =>
      api.post<ContractTemplateDto>('/admin/billing/contract-templates', input).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: contractKeys.templates }),
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; body: string; changeNote: string | null }) =>
      api
        .put<ContractTemplateDto>(`/admin/billing/contract-templates/${id}`, input)
        .then((r) => r.data),
    onSuccess: (saved) => {
      queryClient.setQueryData(contractKeys.template(saved.id), saved)
      return queryClient.invalidateQueries({ queryKey: contractKeys.templates })
    },
  })
}

export function usePublishTemplate() {
  const invalidate = useInvalidateContracts()
  return useMutation({
    mutationFn: (id: string) =>
      api
        .post<ContractTemplateDto>(`/admin/billing/contract-templates/${id}/publish`)
        .then((r) => r.data),
    onSuccess: invalidate,
  })
}

/** Prévia do modelo com os dados reais de uma empresa (não grava nada) */
export function useTemplatePreview() {
  return useMutation({
    mutationFn: ({ id, companyId }: { id: string; companyId: string }) =>
      api
        .post<TemplatePreviewDto>(`/admin/billing/contract-templates/${id}/preview`, { companyId })
        .then((r) => r.data),
  })
}

// ─── Documentos da ficha (SUPERADMIN) ────────────────────────────────────────

export function useClientDocuments(companyId: string) {
  return useQuery({
    queryKey: contractKeys.clientDocuments(companyId),
    queryFn: () =>
      api
        .get<ClientDocumentsDto>(`/admin/billing/clients/${companyId}/documents`)
        .then((r) => r.data),
    enabled: !!companyId,
  })
}

export function useDocumentPreview(companyId: string) {
  return useMutation({
    mutationFn: (input: { carryConditions: boolean }) =>
      api
        .post<DocumentPreviewDto>(`/admin/billing/clients/${companyId}/documents/preview`, input)
        .then((r) => r.data),
  })
}

export function useSendDocument(companyId: string) {
  const invalidate = useInvalidateContracts()
  return useMutation({
    mutationFn: (input: { carryConditions: boolean }) =>
      api
        .post<DocumentSendResultDto>(`/admin/billing/clients/${companyId}/documents/send`, input)
        .then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useResendDocument() {
  const invalidate = useInvalidateContracts()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ emailSent: boolean }>(`/admin/billing/documents/${id}/resend`).then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useCancelDocument() {
  const invalidate = useInvalidateContracts()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string | null }) =>
      api
        .post<{ cancelled: number }>(`/admin/billing/documents/${id}/cancel`, { reason })
        .then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useSetDesignatedAdmin(companyId: string) {
  const invalidate = useInvalidateContracts()
  return useMutation({
    mutationFn: (userId: string) =>
      api
        .put<{ changed: boolean; cancelledDocuments: number }>(
          `/admin/billing/clients/${companyId}/designated-admin`,
          { userId }
        )
        .then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useSaveAmendment(companyId: string) {
  const invalidate = useInvalidateContracts()
  return useMutation({
    mutationFn: (input: AmendmentInput) =>
      api
        .put<{ termsVersion: number; changed: boolean }>(
          `/admin/billing/clients/${companyId}/amendment`,
          input
        )
        .then((r) => r.data),
    onSuccess: invalidate,
  })
}

export function useWithdrawAmendment(companyId: string) {
  const invalidate = useInvalidateContracts()
  return useMutation({
    mutationFn: () =>
      api
        .post<{ termsVersion: number }>(`/admin/billing/clients/${companyId}/amendment/withdraw`)
        .then((r) => r.data),
    onSuccess: invalidate,
  })
}

/** Documento de qualquer empresa (impressão do SUPERADMIN) */
export function useAdminDocument(id: string, enabled = true) {
  return useQuery({
    queryKey: contractKeys.adminDocument(id),
    queryFn: () =>
      api.get<ContractDocumentDto>(`/admin/billing/documents/${id}`).then((r) => r.data),
    enabled: enabled && !!id,
  })
}

// ─── Contrato do ADMIN da empresa ────────────────────────────────────────────

export function useMyBilling(enabled = true) {
  return useQuery({
    queryKey: contractKeys.me,
    queryFn: () => api.get<MyBillingDto>('/billing/me').then((r) => r.data),
    enabled,
  })
}

export function useMyDocuments(enabled = true) {
  return useQuery({
    queryKey: contractKeys.myDocuments,
    queryFn: () => api.get<MyDocumentsDto>('/billing/me/documents').then((r) => r.data),
    enabled,
  })
}

export function useMyDocument(id: string, enabled = true) {
  return useQuery({
    queryKey: contractKeys.myDocument(id),
    queryFn: () => api.get<ContractDocumentDto>(`/billing/me/documents/${id}`).then((r) => r.data),
    enabled: enabled && !!id,
  })
}

export function useAcceptDocument() {
  const invalidate = useInvalidateContracts()
  return useMutation({
    mutationFn: ({ id, sha256 }: { id: string; sha256: string }) =>
      api
        .post<ContractDocumentDto>(`/billing/me/documents/${id}/accept`, { sha256 })
        .then((r) => r.data),
    onSuccess: invalidate,
  })
}
