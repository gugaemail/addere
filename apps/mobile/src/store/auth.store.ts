import { create } from 'zustand'
import axios from 'axios'
import * as SecureStore from 'expo-secure-store'
import type { UserPublic } from '@addere/types'
import { setSentryUser, clearSentryUser } from '../services/sentryContext'
import { env } from '../config/env'

// Cada limpeza de sessão (logout, biometria recusada) abre uma nova época.
// Escritas assíncronas que começaram antes não aplicam mais: era assim que o
// app voltava com token e sem usuário — meio logado, caindo no dashboard
// legado com "Olá," sem nome.
let sessionEpoch = 0
const openEpoch = () => sessionEpoch
const epochIsCurrent = (epoch: number) => epoch === sessionEpoch

const TOKEN_KEY = 'addere_access_token'
const USER_KEY = 'addere_user'
export const REFRESH_TOKEN_KEY = 'addere_refresh_token'

interface AuthState {
  user: UserPublic | null
  accessToken: string | null
  permissions: string[]
  hydrated: boolean
  setAuth: (user: UserPublic, token: string) => Promise<void>
  clearAuth: () => Promise<void>
  hydrate: () => Promise<void>
  fetchPermissions: (token: string) => Promise<void>
  fetchMe: (token: string) => Promise<void>
  refreshSession: () => Promise<string>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  permissions: [],
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
    await Promise.all([
      useAuthStore.getState().fetchPermissions(token),
      useAuthStore.getState().fetchMe(token),
    ])
  },

  clearAuth: async () => {
    sessionEpoch += 1
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
      // REFRESH_TOKEN_KEY é mantido para permitir re-autenticação biométrica após logout
    ])
    set({ user: null, accessToken: null, permissions: [] })
    clearSentryUser()
  },

  // Busca as permissões efetivas do usuário logado (SUPERADMIN recebe o catálogo completo)
  fetchPermissions: async (token) => {
    const epoch = openEpoch()
    try {
      const { data } = await axios.get<{ keys: string[] }>(`${env.apiUrl}/auth/me/permissions`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      })
      if (!epochIsCurrent(epoch)) return
      set({ permissions: data.keys })
    } catch {
      // Mantém as permissões atuais (ex: offline) — não bloqueia o app
    }
  },

  // Atualiza o usuário com o /auth/me completo (permissions + company com a
  // flag da Inteligência — E12). Persiste para a flag valer offline no boot.
  fetchMe: async (token) => {
    const epoch = openEpoch()
    try {
      const { data } = await axios.get<UserPublic>(`${env.apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 8000,
      })
      if (!epochIsCurrent(epoch)) return
      await SecureStore.setItemAsync(USER_KEY, JSON.stringify(data))
      set({ user: data })
    } catch {
      // Offline: mantém o usuário persistido (flag da última sessão)
    }
  },

  // Única implementação de refresh do app — usada pelo interceptor de 401,
  // pela hidratação no boot e pelo login biométrico.
  // Tenta via cookie (sessão ativa) e cai para o refresh token do SecureStore.
  refreshSession: async () => {
    const epoch = openEpoch()
    const storedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)

    const tryRefresh = async (body: Record<string, string> = {}) => {
      const { data } = await axios.post(`${env.apiUrl}/auth/refresh`, body, {
        withCredentials: true,
        timeout: 8000,
        // O RN guarda o cookie de sessão e o envia junto; sem este header a API
        // trata a chamada como possível CSRF e devolve 403 (o que derrubava a
        // sessão no boot do app).
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      return data as { accessToken: string; refreshToken: string }
    }

    let data: { accessToken: string; refreshToken: string }
    try {
      data = await tryRefresh()
    } catch (cookieErr) {
      const e = cookieErr as { response?: unknown }
      if (storedRefreshToken && e.response) {
        // Cookie recusado/ausente: tenta com o refresh token do SecureStore
        data = await tryRefresh({ refreshToken: storedRefreshToken })
      } else {
        throw cookieErr
      }
    }

    // Sessão encerrada no meio do refresh (logout, 401, biometria recusada):
    // devolve o token para quem pediu, mas não o grava. Escrever aqui deixava
    // um access token órfão no keychain — sem o usuário, que clearAuth apagou —
    // e no boot seguinte o app subia meio logado.
    if (!epochIsCurrent(epoch)) return data.accessToken

    await Promise.all([
      SecureStore.setItemAsync(TOKEN_KEY, data.accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken),
    ])
    set({ accessToken: data.accessToken })
    return data.accessToken
  },

  // Chamado uma vez no boot do app para restaurar sessão salva
  hydrate: async () => {
    const epoch = openEpoch()
    // O guard de biometria roda em paralelo e pode limpar a sessão no meio da
    // hidratação: `hydrated` sempre avança (senão o app trava no splash), mas
    // usuário e token só voltam se a época ainda for a mesma.
    const applySession = (partial: { user?: UserPublic | null; accessToken?: string | null }) =>
      set(epochIsCurrent(epoch) ? { ...partial, hydrated: true } : { hydrated: true })

    const dropSession = async () => {
      await Promise.all([
        SecureStore.deleteItemAsync(TOKEN_KEY),
        SecureStore.deleteItemAsync(USER_KEY),
        SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
      ])
      applySession({ accessToken: null, user: null })
    }

    const [token, userJson] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ])
    const user = userJson ? (JSON.parse(userJson) as UserPublic) : null

    if (token) {
      try {
        const newToken = await useAuthStore.getState().refreshSession()
        applySession({ user })
        await Promise.all([
          useAuthStore.getState().fetchPermissions(newToken),
          useAuthStore.getState().fetchMe(newToken),
        ])
      } catch (err) {
        const e = err as { response?: unknown; code?: string }
        if (!e.response || e.code === 'ECONNABORTED') {
          // Sem internet ou timeout: usa token existente e segue em frente
          applySession({ accessToken: token, user })
          await useAuthStore.getState().fetchPermissions(token)
        } else {
          // Refresh token inválido/expirado: desloga
          await dropSession()
        }
      }

      // Token sem usuário é sessão inutilizável: sobra de um keychain que ficou
      // com o access token órfão e um /auth/me que não conseguiu repor o
      // usuário (offline, instância fria). Encerra em vez de subir o app com
      // "Olá," vazio — o login é o estado honesto.
      const current = useAuthStore.getState()
      if (epochIsCurrent(epoch) && current.accessToken && !current.user) {
        await dropSession()
      }
    } else {
      applySession({ accessToken: null, user })
    }
  },
}))
