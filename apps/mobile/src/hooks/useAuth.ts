import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth.store'
import { useCompanyStore } from '../store/company.store'
import { api } from '../lib/api'
import type { LoginRequest, LoginResponse, CompanyFieldConfig } from '@addere/types'

export function useLogin() {
  const setAuth = useAuthStore((s) => s.setAuth)
  const setFieldConfig = useCompanyStore((s) => s.setFieldConfig)

  return useMutation({
    mutationFn: async (input: LoginRequest) => {
      const { data } = await api.post<LoginResponse>('/auth/login', input)
      return data
    },
    onSuccess: async (data) => {
      await setAuth(data.user, data.accessToken)
      // Carrega config de campos da empresa; ignora erro (usa cache ou default tudo visível)
      try {
        const { data: cfg } = await api.get<CompanyFieldConfig>('/companies/me/field-config')
        await setFieldConfig(cfg)
      } catch {
        // sem conexão ou empresa sem config → mantém cache existente ou tudo visível
      }
    },
  })
}

export function useLogout() {
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const clearFieldConfig = useCompanyStore((s) => s.clearFieldConfig)

  return useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout')
    },
    onSettled: async () => {
      await Promise.all([clearAuth(), clearFieldConfig()])
    },
  })
}
