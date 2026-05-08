import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import type { UserPublic } from '@addere/types'
import { setSentryUser, clearSentryUser } from '../services/sentryContext'

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
    set({ accessToken: token ?? null, user, hydrated: true })
  },
}))
