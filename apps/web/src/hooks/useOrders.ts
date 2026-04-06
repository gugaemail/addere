import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Order, DashboardStats } from '@addere/types'

export function useOrderStats() {
  return useQuery({
    queryKey: ['orders', 'stats'],
    queryFn: () => api.get<DashboardStats>('/orders/stats').then((r) => r.data),
  })
}

export function useOrders(limit?: number) {
  return useQuery({
    queryKey: ['orders', { limit }],
    queryFn: () =>
      api.get<Order[]>('/orders', { params: limit ? { limit } : undefined }).then((r) => r.data),
  })
}
