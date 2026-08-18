import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { CompanyListItem } from '@addere/types'

// Query keys namespaced: ['companies','list'] | ['companies','detail',id] | ['companies',id,<entidade>]
export const companiesKeys = {
  all: ['companies'] as const,
  list: ['companies', 'list'] as const,
  detail: (id: string) => ['companies', 'detail', id] as const,
  entity: (id: string, entity: string) => ['companies', id, entity] as const,
}

export function useCompanies() {
  return useQuery({
    queryKey: companiesKeys.list,
    queryFn: () => api.get<CompanyListItem[]>('/companies').then((r) => r.data),
  })
}

export function useCreateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; cnpj: string; idProtheus?: string }) =>
      api.post('/companies', data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companiesKeys.all }),
  })
}

export function useUpdateCompany() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: {
      id: string
      name: string
      cnpj: string
      idProtheus: string | null
    }) => api.patch(`/companies/${id}`, data).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companiesKeys.all }),
  })
}

export function useToggleCompanyActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/companies/${id}/active`, { active }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: companiesKeys.all }),
  })
}
