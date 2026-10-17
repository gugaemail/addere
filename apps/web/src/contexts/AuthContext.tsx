'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  api,
  clearAccessToken,
  COMPANY_BLOCKED_EVENT,
  refreshAccessToken,
  setAccessToken,
} from '@/lib/api'
import type { CompanyAccess, UserPublic } from '@addere/types'

// Releitura do /auth/me disparada por 403 COMPANY_BLOCKED (plano 017): no
// máximo uma a cada 10 s, porque uma página com cinco queries dispara cinco
// eventos. O "Verificar de novo" e o aceite do contrato (014) não esperam.
const BLOCKED_REFRESH_MIN_MS = 10_000

interface AuthContextValue {
  user: UserPublic | null
  isLoading: boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  // ─── E9: permissões e tenant vindos de GET /auth/me ───
  permissions: string[]
  hasPermission: (key: string) => boolean
  companyId: string | null
  intelligenceEnabled: boolean
  login: (email: string, password: string) => Promise<UserPublic>
  logout: () => Promise<void>
  /**
   * Relê o GET /auth/me (ex.: depois do aceite do contrato, a faixa some; no 017,
   * o "Verificar de novo" da tela de acesso suspenso). Uma chamada por vez; erro
   * não desloga (quem chama decide se mostra).
   */
  refreshUser: () => Promise<void>
  /** Plano 017: o acesso da empresa do usuário (null = SUPERADMIN ou sem empresa) */
  companyAccess: CompanyAccess | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<UserPublic | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Tenta restaurar a sessão via refresh token (cookie httpOnly) na montagem
  useEffect(() => {
    const restoreSession = async () => {
      try {
        // Mesmo refresh do interceptor (single-flight): se uma página já
        // disparou queries e caiu em 401, os dois esperam a mesma chamada.
        await refreshAccessToken()
        // Obtém o usuário atual com o novo token
        const { data: userData } = await api.get<UserPublic>('/auth/me')
        setUser(userData)
      } catch {
        // Sem sessão restaurável: limpa o cookie indicador, senão o middleware
        // fica devolvendo /login → '/' em loop até o cookie expirar (E9)
        clearAccessToken()
      } finally {
        setIsLoading(false)
      }
    }

    restoreSession()
  }, [])

  const login = useCallback(async (email: string, password: string): Promise<UserPublic> => {
    const { data } = await api.post<{ user: UserPublic; accessToken: string }>('/auth/login', {
      email,
      password,
    })
    setAccessToken(data.accessToken)
    // O login não devolve permissões/empresa — o /auth/me devolve (E1c).
    // Se falhar, segue com o usuário do login (sem permissions → sem itens intel).
    try {
      const { data: me } = await api.get<UserPublic>('/auth/me')
      setUser(me)
      return me
    } catch {
      setUser(data.user)
      return data.user
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setAccessToken(null)
      setUser(null)
      // Painel multiusuário (E9): sem isso, dados do tenant anterior ficam
      // no cache e aparecem para o próximo login na mesma aba
      queryClient.clear()
    }
  }, [queryClient])

  // Plano 014: o aceite muda o documento pendente (e a Inteligência) do /auth/me.
  // Plano 017: também é por aqui que o bloqueio da empresa entra e sai da tela.
  const refreshInFlight = useRef<Promise<void> | null>(null)
  const lastBlockedRefreshAt = useRef(0)
  const wasBlocked = useRef(false)
  useEffect(() => {
    wasBlocked.current = user?.company?.access?.blocked === true
  }, [user])

  const refreshUser = useCallback((): Promise<void> => {
    if (!refreshInFlight.current) {
      refreshInFlight.current = api
        .get<UserPublic>('/auth/me')
        .then(({ data }) => {
          // Saiu do bloqueio: as queries que levaram 403 voltam a buscar
          const unblocked = wasBlocked.current && data.company?.access?.blocked !== true
          setUser(data)
          if (unblocked) void queryClient.invalidateQueries()
        })
        .finally(() => {
          refreshInFlight.current = null
        })
    }
    return refreshInFlight.current
  }, [queryClient])

  // 403 COMPANY_BLOCKED do interceptor (lib/api.ts): relê o /auth/me, no máximo
  // uma vez a cada 10 s. Erro aqui não desloga — a sessão continua válida
  const refreshAfterBlocked = useCallback(() => {
    const now = Date.now()
    if (now - lastBlockedRefreshAt.current < BLOCKED_REFRESH_MIN_MS) return
    lastBlockedRefreshAt.current = now
    refreshUser().catch(() => undefined)
  }, [refreshUser])

  useEffect(() => {
    window.addEventListener(COMPANY_BLOCKED_EVENT, refreshAfterBlocked)
    return () => window.removeEventListener(COMPANY_BLOCKED_EVENT, refreshAfterBlocked)
  }, [refreshAfterBlocked])

  // Enquanto bloqueada, a aba que volta ao foco relê o acesso (o pagamento pode
  // ter sido baixado enquanto ela estava em segundo plano)
  const blocked = user?.company?.access?.blocked === true
  useEffect(() => {
    if (!blocked) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshAfterBlocked()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [blocked, refreshAfterBlocked])

  const permissions = user?.permissions ?? []
  const hasPermission = useCallback(
    (key: string) => user?.role === 'SUPERADMIN' || (user?.permissions ?? []).includes(key),
    [user]
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAdmin: user?.role === 'ADMIN',
        isSuperAdmin: user?.role === 'SUPERADMIN',
        permissions,
        hasPermission,
        companyId: user?.companyId ?? null,
        intelligenceEnabled: user?.company?.intelligenceEnabled ?? false,
        login,
        logout,
        refreshUser,
        companyAccess: user?.company?.access ?? null,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider')
  return context
}
