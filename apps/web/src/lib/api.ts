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
    // Lax e não Strict: com Strict o navegador omite o cookie em navegação
    // vinda de outro site, então abrir um link direto do painel (e-mail, chat)
    // caía no login mesmo com sessão válida. O cookie é só indicador de UX —
    // não carrega autoridade nenhuma (ver lib/pilot-auth.ts).
    document.cookie = `addere_session=1; expires=${expires}; path=/; SameSite=Lax`
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

// ─── Refresh único (single-flight) ───────────────────────────────────────────
// O refresh token gira a cada uso: dois POST /auth/refresh em paralelo fazem o
// segundo chegar com o token já consumido e receber 401. Era exatamente o que
// acontecia num reload: o AuthContext restaurava a sessão enquanto as páginas
// já disparavam queries, o interceptor abria um refresh próprio e o "perdedor"
// derrubava a sessão inteira — link direto ou F5 em /users caía no login.
// Todo mundo (restore, interceptor, quem mais precisar) compartilha a mesma
// promessa em andamento.

let _refreshPromise: Promise<string> | null = null

export function refreshAccessToken(): Promise<string> {
  if (!_refreshPromise) {
    _refreshPromise = axios
      .post<{ accessToken: string }>(
        `${env.apiUrl}/auth/refresh`,
        {},
        { withCredentials: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } }
      )
      .then(({ data }) => {
        setAccessToken(data.accessToken)
        return data.accessToken
      })
      .finally(() => {
        _refreshPromise = null
      })
  }
  return _refreshPromise
}

// Em caso de 401 tenta renovar o token antes de deslogar
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

    original._retry = true

    try {
      const token = await refreshAccessToken()
      original.headers.Authorization = `Bearer ${token}`
      return api(original)
    } catch {
      clearAccessToken()
      if (typeof window !== 'undefined') window.location.href = '/login'
      return Promise.reject(error)
    }
  }
)

// ─── Extração de mensagem de erro da API ─────────────────────────────────────
// Centraliza o cast que antes era repetido inline em todos os catch de requisição.

export function getApiErrorMessage(err: unknown, fallback = 'Erro inesperado'): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message
    if (message) return message
  }
  return fallback
}
