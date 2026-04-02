import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Order, DashboardStats, CreateOrderInput } from '@addere/types'

export function usePedidos(limit?: number) {
  return useQuery({
    queryKey: ['orders', limit],
    queryFn: async () => {
      const { data } = await api.get<Order[]>('/orders', { params: limit ? { limit } : undefined })
      return data
    },
  })
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['orders', 'stats'],
    queryFn: async () => {
      const { data } = await api.get<DashboardStats>('/orders/stats')
      return data
    },
  })
}

export function useCriarPedido() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateOrderInput) => {
      const { data } = await api.post<Order>('/orders', input)
      return data
    },
    onSuccess: () => {
      // Invalida cache de pedidos e stats para refletir o novo pedido
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}
