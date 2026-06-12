import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Permission } from '@addere/types'

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: () => api.get<Permission[]>('/permissions').then((r) => r.data),
  })
}

export function useUserPermissions(userId: string | null) {
  return useQuery({
    queryKey: ['user-permissions', userId],
    queryFn: () => api.get<{ keys: string[] }>(`/users/${userId}/permissions`).then((r) => r.data.keys),
    enabled: !!userId,
  })
}

export function useSetUserPermissions(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (keys: string[]) =>
      api.put<{ keys: string[] }>(`/users/${userId}/permissions`, { keys }).then((r) => r.data.keys),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] })
    },
  })
}

export function useCopyUserPermissions(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sourceUserId: string) =>
      api.post<{ keys: string[] }>(`/users/${userId}/permissions/copy-from/${sourceUserId}`).then((r) => r.data.keys),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-permissions', userId] })
    },
  })
}
