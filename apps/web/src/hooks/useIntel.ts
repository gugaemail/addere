'use client'

// Esqueleto dos hooks da Inteligência (E9) — as telas W3/W4/W5 (E10) montam
// as queries em cima destas keys. companyId entra na key para o cache do
// SUPERADMIN não vazar entre empresas.
import { useAuth } from '@/contexts/AuthContext'
import { useCompanyContext } from '@/contexts/CompanyContext'

export const intelKeys = {
  all: ['intel'] as const,
  queries: (companyId?: string | null) => [...intelKeys.all, 'queries', companyId ?? 'own'] as const,
  query: (name: string, companyId?: string | null) =>
    [...intelKeys.all, 'query', name, companyId ?? 'own'] as const,
  health: (companyId?: string | null) => [...intelKeys.all, 'health', companyId ?? 'own'] as const,
  parameters: (companyId?: string | null) =>
    [...intelKeys.all, 'parameters', companyId ?? 'own'] as const,
  config: (companyId?: string | null) => [...intelKeys.all, 'config', companyId ?? 'own'] as const,
  jobs: (companyId?: string | null) => [...intelKeys.all, 'jobs', companyId ?? 'own'] as const,
}

// Params de tenant das rotas /intel/*: só SUPERADMIN manda companyId na query
// (resolveTenant da API rejeita companyId de quem não é SUPERADMIN — 403).
export function useIntelCompanyParam(): { companyId?: string } {
  const { isSuperAdmin } = useAuth()
  const { companyId } = useCompanyContext()
  return isSuperAdmin && companyId ? { companyId } : {}
}
