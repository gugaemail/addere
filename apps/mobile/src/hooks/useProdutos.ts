import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCompanyStore } from '../store/company.store'
import type { Product } from '@addere/types'

const FALLBACK_STALE_TIME = 1000 * 60 * 60 * 24 // 24h

export function useProdutos(search?: string) {
  const syncSchedule = useCompanyStore((s) => s.syncSchedule)
  const scheduleMin  = syncSchedule?.products.scheduleMin ?? 0
  const staleTime    = scheduleMin > 0 ? scheduleMin * 60_000 : FALLBACK_STALE_TIME

  return useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      const { data } = await api.get<Product[]>('/products', { params: { search } })
      return data
    },
    staleTime,
  })
}
