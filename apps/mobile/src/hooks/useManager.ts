// Home do gerente no app: meta da equipe (soma das metas dos vendedores
// associados) e as visitas de hoje — GET /intel/manager/home.
import { useQuery } from '@tanstack/react-query'
import type { ManagerHomeDto } from '@addere/types'
import { api } from '../lib/api'
import { useIsManager } from './useProfile'

export const managerKeys = {
  all: ['intel-manager'] as const,
  home: () => [...managerKeys.all, 'home'] as const,
}

export function useManagerHome() {
  const isManager = useIsManager()
  return useQuery({
    queryKey: managerKeys.home(),
    queryFn: () => api.get<ManagerHomeDto>('/intel/manager/home').then((r) => r.data),
    enabled: isManager,
    staleTime: 5 * 60_000,
  })
}
