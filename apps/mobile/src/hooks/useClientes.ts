import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCompanyStore } from '../store/company.store'
import type { Customer, CustomerWithOrders } from '@addere/types'

const FALLBACK_STALE_TIME = 1000 * 60 * 60 * 24 // 24h

export function useClientes(search?: string) {
  const syncSchedule = useCompanyStore((s) => s.syncSchedule)
  const scheduleMin = syncSchedule?.customers.scheduleMin ?? 0
  const staleTime = scheduleMin > 0 ? scheduleMin * 60_000 : FALLBACK_STALE_TIME

  return useQuery({
    queryKey: ['customers', 'list', search],
    queryFn: async () => {
      const { data } = await api.get<Customer[]>('/customers', { params: { search } })
      return data
    },
    staleTime,
    // Mantém a lista anterior enquanto a nova busca carrega — sem isso a FlatList é
    // trocada por LoadingState a cada tecla (pisca e engole toques durante a digitação)
    placeholderData: keepPreviousData,
  })
}

export function useCliente(id: string) {
  return useQuery({
    queryKey: ['customers', 'detail', id],
    queryFn: async () => {
      const { data } = await api.get<CustomerWithOrders>(`/customers/${id}`)
      return data
    },
    enabled: !!id,
  })
}
