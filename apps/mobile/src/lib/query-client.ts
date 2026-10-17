import { QueryClient } from '@tanstack/react-query'
import { isCompanyBlockedError } from '@addere/types'
import { useSyncStore } from '../store/syncStore'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 60 * 24,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      networkMode: 'offlineFirst',
      retry: (failureCount, error) => {
        const { networkAvailable } = useSyncStore.getState()
        if (!networkAvailable) return false
        // Empresa suspensa (plano 017): tentar de novo daria o mesmo 403
        if (isCompanyBlockedError(error)) return false
        return failureCount < 3
      },
    },
  },
})
