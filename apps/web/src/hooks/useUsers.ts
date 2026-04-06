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

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserFormData) =>
      api.post<UserPublic>('/users', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useToggleUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.patch<UserPublic>(`/users/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
