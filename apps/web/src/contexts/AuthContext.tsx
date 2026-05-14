'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { api, setAuthToken } from '@/lib/api'
import type { UserPublic } from '@addere/types'

interface AuthContextValue {
  user: UserPublic | null
  isLoading: boolean
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserPublic | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Tenta restaurar a sessão via refresh token (cookie httpOnly) na montagem
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const { data } = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'}/auth/refresh`,
          {},
          { withCredentials: true }
        )
        setAuthToken(data.accessToken)
        // Obtém o usuário atual com o novo token
        const { data: userData } = await api.get<UserPublic>('/auth/me')
        setUser(userData)
      } catch {
        // Sem sessão ativa — usuário não está autenticado
      } finally {
        setIsLoading(false)
      }
    }

    restoreSession()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ user: UserPublic; accessToken: string }>('/auth/login', {
      email,
      password,
    })
    setAuthToken(data.accessToken)
    setUser(data.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setAuthToken(null)
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAdmin: user?.role === 'ADMIN',
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
