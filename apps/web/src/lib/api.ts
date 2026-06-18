import axios from 'axios'
import { env } from '../config/env'

export const api = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true, // envia o cookie de refreshToken
})

// ─── Access token em memória (nunca em cookie legível) ───────────────────────
// Armazenado em variável de módulo: sobrevive a navegações SPA mas não a reloads.
// No reload, o interceptor de 401 faz refresh automático via cookie httpOnly.

let _accessToken: string | null = null

export function setAccessToken(token: string | null) {
  _accessToken = token
  if (token) {
    const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toUTCString()
    document.cookie = `addere_session=1; expires=${expires}; path=/; SameSite=Strict`
  } else {
    document.cookie = `addere_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
  }
}

export function getAccessToken(): string | null {
  return _accessToken
}

export function clearAccessToken() {
  _accessToken = null
  document.cookie = 'addere_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
}

// Injeta o accessToken no header de cada requisição
api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`
  }
  return config
})

// Em caso de 401 tenta renovar o token antes de deslogar
let _refreshing = false
let _refreshQueue: Array<(token: string | null) => void> = []

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    // Não tenta refresh em endpoints de auth (login/refresh/logout retornam 401 por conta própria)
    if (/\/auth\/(login|refresh|logout)/.test(original.url ?? '')) {
      return Promise.reject(error)
    }

    if (_refreshing) {
      return new Promise((resolve, reject) => {
        _refreshQueue.push((token) => {
          if (!token) return reject(error)
          original.headers.Authorization = `Bearer ${token}`
          resolve(api(original))
        })
      })
    }

    original._retry = true
    _refreshing = true

    try {
      const { data } = await axios.post(`${env.apiUrl}/auth/refresh`, {}, { withCredentials: true })
      setAccessToken(data.accessToken)
      _refreshQueue.forEach((cb) => cb(data.accessToken))
      original.headers.Authorization = `Bearer ${data.accessToken}`
      return api(original)
    } catch {
      _refreshQueue.forEach((cb) => cb(null))
      clearAccessToken()
      if (typeof window !== 'undefined') window.location.href = '/login'
      return Promise.reject(error)
    } finally {
      _refreshing = false
      _refreshQueue = []
    }
  }
)
