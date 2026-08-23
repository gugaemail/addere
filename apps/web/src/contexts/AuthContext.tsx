'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { useQueryClient } from '@tanstack/react-query'
import { api, clearAccessToken, setAccessToken } from '@/lib/api'
import type { UserPublic } from '@addere/types'

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
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'}/auth/refresh`,
          {},
          { withCredentials: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } }
        )
        setAccessToken(data.accessToken)
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
