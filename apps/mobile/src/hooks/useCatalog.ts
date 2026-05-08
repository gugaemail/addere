import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Product } from '@addere/types'

const STALE_TIME = 1000 * 60 * 60 * 24 // 24h

export function useCatalog(search?: string) {
  const query = useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      const { data } = await api.get<Product[]>('/products', { params: { search } })
      return data
    },
    staleTime:   STALE_TIME,
    gcTime:      1000 * 60 * 60 * 24 * 7,
    networkMode: 'offlineFirst',
  })

  const isFromCache =
    query.dataUpdatedAt > 0 && Date.now() - query.dataUpdatedAt > STALE_TIME

  const lastUpdated =
    query.dataUpdatedAt > 0 ? new Date(query.dataUpdatedAt) : null

  return { ...query, isFromCache, lastUpdated }
}
