import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Order, DashboardStats, CreateOrderInput } from '@addere/types'

export function usePedido(id: string) {
  return useQuery({
    queryKey: ['orders', id],
    queryFn: async () => {
      const { data } = await api.get<Order>(`/orders/${id}`)
      return data
    },
    enabled: !!id,
  })
}

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
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['meta-vendedor'] })
    },
  })
}

export function useSincronizarPedido() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data } = await api.post(`/orders/${orderId}/sync`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['meta-vendedor'] })
    },
  })
}

export function useMetaVendedor() {
  return useQuery({
    queryKey: ['meta-vendedor'],
    queryFn: async () => {
      const { data } = await api.get<{ periodo: string; vendido: string; meta: string }>('/sync/metas')
      return data
    },
    staleTime: 0,
  })
}

export function useCancelarPedido() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data } = await api.patch(`/orders/${orderId}/cancel`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

export function useConsultarStatusPedido() {
  return useMutation({
    mutationFn: async (orderId: string) => {
      const { data } = await api.get<{ protheusOrderId: string; codigo: string; status: string }>(`/orders/${orderId}/status`)
      return data
    },
  })
}
