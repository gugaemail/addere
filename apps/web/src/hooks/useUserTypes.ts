import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { UserType } from '@addere/types'

export function useUserTypes() {
  return useQuery({
    queryKey: ['user-types'],
    queryFn: () => api.get<UserType[]>('/user-types').then((r) => r.data),
  })
}

export function useCreateUserType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.post<UserType>('/user-types', { name }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-types'] })
    },
  })
}

export function useUpdateUserType() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<UserType>(`/user-types/${id}`, { name }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-types'] })
    },
  })
}
