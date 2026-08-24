'use client'

// Tenant ativo do painel (E9). Usuário comum herda a empresa do próprio
// cadastro (JWT); SUPERADMIN escolhe no seletor da sidebar (persistido em
// localStorage). Os hooks da Inteligência enviam companyId na query SÓ quando
// SUPERADMIN — para os demais, o resolveTenant da API usa o token.
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'

const STORAGE_KEY = 'addere.activeCompanyId'

interface CompanyContextValue {
  /** Tenant efetivo (null = SUPERADMIN sem empresa selecionada) */
  companyId: string | null
  /** Troca o tenant ativo — só tem efeito para SUPERADMIN */
  setCompanyId: (id: string | null) => void
  /** true quando o usuário pode escolher a empresa (SUPERADMIN) */
  canSelect: boolean
}

const CompanyContext = createContext<CompanyContextValue | null>(null)

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isSuperAdmin } = useAuth()
  const [selected, setSelected] = useState<string | null>(null)

  // Restaura a seleção do SUPERADMIN após o carregamento da sessão; sem
  // sessão, limpa — a seleção de um SUPERADMIN não pode vazar para o
  // próximo login no mesmo browser
  useEffect(() => {
    if (isLoading) return
    if (isSuperAdmin) {
      setSelected(localStorage.getItem(STORAGE_KEY))
    } else if (!user) {
      setSelected(null)
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [isLoading, isSuperAdmin, user])

  const setCompanyId = useCallback(
    (id: string | null) => {
      if (!isSuperAdmin) return
      setSelected(id)
      if (id) localStorage.setItem(STORAGE_KEY, id)
      else localStorage.removeItem(STORAGE_KEY)
    },
    [isSuperAdmin]
  )

  const companyId = isSuperAdmin ? selected : (user?.companyId ?? null)

  return (
    <CompanyContext.Provider value={{ companyId, setCompanyId, canSelect: isSuperAdmin }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompanyContext(): CompanyContextValue {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompanyContext precisa estar dentro de <CompanyProvider>')
  return ctx
}
