import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { UserPublic } from '@addere/types'
import type { CreateUserFormData } from '@/lib/schemas'

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<UserPublic[]>('/users').then((r) => r.data),
  })
}

// companyId opcional: quando informado, cria o usuário dentro da empresa
// (rota POST /companies/:id/users) e invalida o detalhe da empresa.
export function useCreateUser(companyId?: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserFormData) =>
      companyId
        ? api.post<UserPublic>(`/companies/${companyId}/users`, data).then((r) => r.data)
        : api.post<UserPublic>('/users', data).then((r) => r.data),
    onSuccess: () => {
      if (companyId) {
        queryClient.invalidateQueries({ queryKey: ['companies', 'detail', companyId] })
      } else {
        queryClient.invalidateQueries({ queryKey: ['users'] })
      }
    },
  })
}

export function useToggleUser() {
  const queryClient = useQueryClient()
  return useMutation({
    // PATCH /users/:id virou edição; o toggle mora em /:id/active
    mutationFn: (id: string) => api.patch<UserPublic>(`/users/${id}/active`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
