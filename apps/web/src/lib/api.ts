import axios from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // envia o cookie de refreshToken
})

// Injeta o accessToken salvo no header de cada requisição
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Em caso de 401 tenta renovar o token antes de deslogar
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const { data } = await axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
        setAccessToken(data.accessToken)
        original.headers.Authorization = `Bearer ${data.accessToken}`
        return api(original)
      } catch {
        clearAccessToken()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// ─── Helpers para gerenciar o accessToken em cookie ──────────────────────────

const TOKEN_KEY = 'addere_access_token'

export function setAccessToken(token: string) {
  // Cookie com 8h (mesmo TTL do JWT)
  const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${TOKEN_KEY}=${token}; expires=${expires}; path=/; SameSite=Strict`
}

export function getAccessToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_KEY}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function clearAccessToken() {
  document.cookie = `${TOKEN_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
}
