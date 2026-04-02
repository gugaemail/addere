import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import type { UserPublic } from '@addere/types'

const TOKEN_KEY = 'addere_access_token'

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
    await SecureStore.setItemAsync(TOKEN_KEY, token)
    set({ user, accessToken: token })
  },

  clearAuth: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    set({ user: null, accessToken: null })
  },

  // Chamado uma vez no boot do app para restaurar sessão salva
  hydrate: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY)
    set({ accessToken: token ?? null, hydrated: true })
  },
}))
