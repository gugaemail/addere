import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { pilotTracker } from '../services/pilotTracking'
import type { Product } from '@addere/types'

const STALE_TIME = 1000 * 60 * 60 * 24 // 24h

export function useCatalog(search?: string) {
  const trackedRef = useRef(false)

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

  useEffect(() => {
    if (query.isSuccess && !trackedRef.current) {
      trackedRef.current = true
      pilotTracker.track({
        type: 'CATALOG_LOADED',
        metadata: { fromCache: isFromCache, itemCount: query.data?.length ?? 0 },
      })
    }
  }, [query.isSuccess, isFromCache, query.data])

  return { ...query, isFromCache, lastUpdated }
}
