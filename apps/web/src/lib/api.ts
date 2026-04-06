import axios from 'axios'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333',
  withCredentials: true,
})

// Token em memória — atualizado pelo AuthContext após login/refresh
let authToken: string | null = null

export function setAuthToken(token: string | null) {
  authToken = token
}

// Injeta o access token em cada request
api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers.Authorization = `Bearer ${authToken}`
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

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    if (isRefreshing) {
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
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'}/auth/refresh`,
        {},
        { withCredentials: true }
      )

      const newToken: string = data.accessToken
      setAuthToken(newToken)

      refreshQueue.forEach(({ resolve }) => resolve(newToken))
      refreshQueue = []

      originalRequest.headers.Authorization = `Bearer ${newToken}`
      return api(originalRequest)
    } catch (err) {
      refreshQueue.forEach(({ reject }) => reject(err))
      refreshQueue = []
      setAuthToken(null)
      // Redireciona para login em caso de falha no refresh
      if (typeof window !== 'undefined') {
        window.location.href = '/login'
      }
      return Promise.reject(err)
    } finally {
      isRefreshing = false
    }
  }
)
