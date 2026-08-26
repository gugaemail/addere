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
  /**
   * false enquanto a seleção do SUPERADMIN ainda não foi lida do localStorage.
   * As telas da Inteligência esperam por isso: sem esperar, a primeira busca
   * saía sem companyId e voltava 400 antes da seleção ser restaurada.
   */
  ready: boolean
}

const CompanyContext = createContext<CompanyContextValue | null>(null)

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isSuperAdmin } = useAuth()
  const [selected, setSelected] = useState<string | null>(null)
  const [restored, setRestored] = useState(false)

  // Restaura a seleção do SUPERADMIN após o carregamento da sessão; sem
  // sessão, limpa — a seleção de um SUPERADMIN não pode vazar para o
  // próximo login no mesmo browser
  useEffect(() => {
    if (isLoading) return
    if (isSuperAdmin) {
      setSelected(localStorage.getItem(STORAGE_KEY))
      setRestored(true)
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
  const ready = !isLoading && (!isSuperAdmin || restored)

  return (
    <CompanyContext.Provider value={{ companyId, setCompanyId, canSelect: isSuperAdmin, ready }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompanyContext(): CompanyContextValue {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompanyContext precisa estar dentro de <CompanyProvider>')
  return ctx
}
