import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth.store'
import { api } from '../lib/api'
import type { LoginRequest, LoginResponse } from '@addere/types'

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: async (input: LoginRequest) => {
      const { data } = await api.post<LoginResponse>('/auth/login', input)
      return data
    },
    onSuccess: async (data) => {
      await setAuth(data.user, data.accessToken)
    },
  })
}

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth)

  return useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout')
    },
    onSettled: async () => {
      await clearAuth()
    },
  })
}
