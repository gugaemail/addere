import { QueryClient } from '@tanstack/react-query'
import { useSyncStore } from '../store/syncStore'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:   1000 * 60 * 30,
      gcTime:      1000 * 60 * 60 * 24 * 7,
      networkMode: 'offlineFirst',
      retry: (failureCount) => {
        const { networkAvailable } = useSyncStore.getState()
        if (!networkAvailable) return false
        return failureCount < 3
      },
    },
  },
})
