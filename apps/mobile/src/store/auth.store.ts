import { create } from 'zustand'
import axios from 'axios'
import * as SecureStore from 'expo-secure-store'
import type { UserPublic } from '@addere/types'
import { setSentryUser, clearSentryUser } from '../services/sentryContext'
import { env } from '../config/env'

const TOKEN_KEY = 'addere_access_token'
const USER_KEY  = 'addere_user'

interface AuthState {
  user: UserPublic | null
  accessToken: string | null
  hydrated: boolean
  setAuth: (user: UserPublic, token: string) => Promise<void>
  clearAuth: () => Promise<void>
  hydrate: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  hydrated: false,

  setAuth: async (user, token) => {
    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, token),
      SecureStore.setItemAsync(USER_KEY, JSON.stringify(user)),
    ])
    set({ user, accessToken: token })
    // Extrai companyId do payload JWT para contexto Sentry
    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as { companyId?: string }
      setSentryUser({ id: user.id, company: payload.companyId ?? 'superadmin' })
    } catch {
      setSentryUser({ id: user.id, company: 'unknown' })
    }
  },

  clearAuth: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
    ])
    set({ user: null, accessToken: null })
    clearSentryUser()
  },

  // Chamado uma vez no boot do app para restaurar sessão salva
  hydrate: async () => {
    const [token, userJson] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ])
    const user = userJson ? (JSON.parse(userJson) as UserPublic) : null

    if (token) {
      try {
        // Refresh proativo com timeout: se o servidor demorar (ex: Render hibernado),
        // navega imediatamente com o token existente — o interceptor de 401 cuida do resto
        const { data } = await axios.post(
          `${env.apiUrl}/auth/refresh`,
          {},
          { withCredentials: true, timeout: 4000 }
        )
        const newToken: string = data.accessToken
        await SecureStore.setItemAsync(TOKEN_KEY, newToken)
        set({ accessToken: newToken, user, hydrated: true })
      } catch (err) {
        const e = err as { response?: unknown; code?: string }
        if (!e.response || e.code === 'ECONNABORTED') {
          // Sem internet ou timeout: usa token existente e segue em frente
          set({ accessToken: token, user, hydrated: true })
        } else {
          // Refresh token inválido/expirado (401/403): desloga
          await Promise.all([
            SecureStore.deleteItemAsync(TOKEN_KEY),
            SecureStore.deleteItemAsync(USER_KEY),
          ])
          set({ accessToken: null, user: null, hydrated: true })
        }
      }
    } else {
      set({ accessToken: null, user, hydrated: true })
    }
  },
}))
