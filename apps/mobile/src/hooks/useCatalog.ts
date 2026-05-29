import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from '../lib/api'
import { pilotTracker } from '../services/pilotTracking'
import { useSyncStore } from '../store/syncStore'
import { useCompanyStore } from '../store/company.store'
import type { Product } from '@addere/types'

const FALLBACK_STALE_TIME = 1000 * 60 * 60 * 24 // 24h

export function useCatalog(search?: string) {
  const trackedRef = useRef(false)
  const networkAvailable = useSyncStore((s) => s.networkAvailable)
  const syncSchedule = useCompanyStore((s) => s.syncSchedule)

  const scheduleMin = syncSchedule?.products.scheduleMin ?? 0
  const staleTime = scheduleMin > 0 ? scheduleMin * 60_000 : FALLBACK_STALE_TIME

  const query = useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      const { data } = await api.get<Product[]>('/products', { params: { search } })
      return data
    },
    staleTime,
    gcTime:      1000 * 60 * 60 * 24 * 7,
    networkMode: 'offlineFirst',
  })

  const isFromCache =
    query.dataUpdatedAt > 0 &&
    (!networkAvailable || Date.now() - query.dataUpdatedAt > staleTime)

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
