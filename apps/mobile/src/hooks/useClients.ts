import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Customer, CustomerWithOrders } from '@addere/types'

const STALE_TIME = 1000 * 60 * 60 * 24 // 24h

export function useClients(search?: string) {
  const query = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      const { data } = await api.get<Customer[]>('/customers', { params: { search } })
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

export function useClient(id: string) {
  const query = useQuery({
    queryKey: ['customers', id],
    queryFn: async () => {
      const { data } = await api.get<CustomerWithOrders>(`/customers/${id}`)
      return data
    },
    enabled:     !!id,
    staleTime:   STALE_TIME,
    gcTime:      1000 * 60 * 60 * 24 * 7,
    networkMode: 'offlineFirst',
  })

  const isFromCache =
    query.dataUpdatedAt > 0 && Date.now() - query.dataUpdatedAt > STALE_TIME

  return { ...query, isFromCache }
}
