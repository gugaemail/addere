import axios from 'axios'
import { env } from '../config/env'
import { useAuthStore } from '../store/auth.store'

// Sem timeout explícito o axios espera para sempre (o padrão é 0). Conexão que
// cai no meio deixava a tela girando sem nunca dar erro. Todo endpoint que o app
// chama resolve no PostgreSQL — 30s já é folga larga em 3G.
const DEFAULT_TIMEOUT_MS = 30_000

/**
 * POST /orders/:id/sync é a exceção: fala com o Protheus dentro da própria
 * request, onde a API espera até 60s pelo token e outros 60s pelo envio. Cortar
 * antes disso derrubaria um pedido que o servidor ainda vai concluir — e o
 * endpoint não é idempotente, então o reenvio duplicaria o pedido no ERP.
 */
export const ORDER_SYNC_TIMEOUT_MS = 120_000

export const api = axios.create({
  baseURL: env.apiUrl,
  withCredentials: true, // envia cookies (refresh token HttpOnly)
  timeout: DEFAULT_TIMEOUT_MS,
})

// Injeta o access token em cada request
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Em 401: tenta renovar o token e retenta a request original
let isRefreshing = false
type QueueItem = { resolve: (token: string) => void; reject: (err: unknown) => void }
let refreshQueue: QueueItem[] = []

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    const url: string = originalRequest.url ?? ''
    const isAuthRoute = url.includes('/auth/login') || url.includes('/auth/refresh')

    if (error.response?.status !== 401 || originalRequest._retry || isAuthRoute) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
      // Enfileira requests que chegam enquanto o refresh está em andamento
      return new Promise((resolve, reject) => {
        refreshQueue.push({
          resolve: (token: string) => {
            originalRequest.headers.Authorization = `Bearer ${token}`
            resolve(api(originalRequest))
          },
          reject,
        })
      })
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      // refreshSession (auth.store) é a única implementação de refresh do app:
      // cookie primeiro, fallback para o refresh token do SecureStore
      const newToken = await useAuthStore.getState().refreshSession()

      refreshQueue.forEach(({ resolve }) => resolve(newToken))
      refreshQueue = []

      originalRequest.headers.Authorization = `Bearer ${newToken}`
      return api(originalRequest)
    } catch (err) {
      refreshQueue.forEach(({ reject }) => reject(err))
      refreshQueue = []
      // Só desloga quando o servidor rejeitou o refresh — falha de rede não derruba a sessão
      if ((err as { response?: unknown }).response) {
        useAuthStore.getState().clearAuth()
      }
      return Promise.reject(err)
    } finally {
      isRefreshing = false
    }
  }
)
