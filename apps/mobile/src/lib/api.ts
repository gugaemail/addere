import axios from 'axios'
import { useAuthStore } from '../store/auth.store'

export const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333',
  withCredentials: true, // envia cookies (refresh token HttpOnly)
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

    if (error.response?.status !== 401 || originalRequest._retry) {
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
      const { data } = await axios.post(
        `${process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333'}/auth/refresh`,
        {},
        { withCredentials: true }
      )

      const newToken: string = data.accessToken
      const { setAuth, user } = useAuthStore.getState()
      if (user) await setAuth(user, newToken)

      refreshQueue.forEach(({ resolve }) => resolve(newToken))
      refreshQueue = []

      originalRequest.headers.Authorization = `Bearer ${newToken}`
      return api(originalRequest)
    } catch (err) {
      refreshQueue.forEach(({ reject }) => reject(err))
      refreshQueue = []
      useAuthStore.getState().clearAuth()
      return Promise.reject(err)
    } finally {
      isRefreshing = false
    }
  }
)
