import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as SecureStore from 'expo-secure-store'
import * as LocalAuthentication from 'expo-local-authentication'
import { useAuthStore, REFRESH_TOKEN_KEY } from '../store/auth.store'
import { useCompanyStore } from '../store/company.store'
import { api } from '../lib/api'
import type { LoginRequest, LoginResponse, CompanyFieldConfig } from '@addere/types'

export const BIOMETRIC_KEY = 'addere_biometric_enabled'

export function useLogin() {
  const queryClient = useQueryClient()
  const setAuth = useAuthStore((s) => s.setAuth)
  const setFieldConfig = useCompanyStore((s) => s.setFieldConfig)

  return useMutation({
    mutationFn: async (input: LoginRequest) => {
      const { data } = await api.post<LoginResponse>('/auth/login', input)
      return data
    },
    onSuccess: async (data) => {
      queryClient.clear() // limpa dados do usuário anterior antes de carregar os do novo
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken)
      await setAuth(data.user, data.accessToken)
      try {
        const { data: cfg } = await api.get<CompanyFieldConfig>('/companies/me/field-config')
        await setFieldConfig(cfg)
      } catch {
        // sem conexão ou empresa sem config → mantém cache existente ou tudo visível
      }

      // Oferecer biometria na primeira vez após login
      const alreadyAsked = await AsyncStorage.getItem(BIOMETRIC_KEY)
      if (alreadyAsked === null) {
        const hasHardware = await LocalAuthentication.hasHardwareAsync()
        const isEnrolled  = await LocalAuthentication.isEnrolledAsync()
        if (hasHardware && isEnrolled) {
          Alert.alert(
            'Usar biometria?',
            'Deseja usar impressão digital ou reconhecimento facial para entrar no app nas próximas vezes?',
            [
              { text: 'Não agora', onPress: () => AsyncStorage.setItem(BIOMETRIC_KEY, 'false') },
              { text: 'Sim, ativar', onPress: () => AsyncStorage.setItem(BIOMETRIC_KEY, 'true') },
            ]
          )
        } else {
          // Dispositivo sem biometria — marca como perguntado para não perguntar de novo
          await AsyncStorage.setItem(BIOMETRIC_KEY, 'false')
        }
      }
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const clearFieldConfig = useCompanyStore((s) => s.clearFieldConfig)

  return useMutation({
    mutationFn: async () => {
      await api.post('/auth/logout')
    },
    onSettled: async () => {
      await Promise.all([clearAuth(), clearFieldConfig()])
      queryClient.clear()
    },
  })
}
