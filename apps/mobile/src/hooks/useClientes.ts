import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useCompanyStore } from '../store/company.store'
import type { Customer, CustomerWithOrders } from '@addere/types'

const FALLBACK_STALE_TIME = 1000 * 60 * 60 * 24 // 24h

export function useClientes(search?: string) {
  const syncSchedule = useCompanyStore((s) => s.syncSchedule)
  const scheduleMin  = syncSchedule?.customers.scheduleMin ?? 0
  const staleTime    = scheduleMin > 0 ? scheduleMin * 60_000 : FALLBACK_STALE_TIME

  return useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      const { data } = await api.get<Customer[]>('/customers', { params: { search } })
      return data
    },
    staleTime,
  })
}

export function useCliente(id: string) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: async () => {
      const { data } = await api.get<CustomerWithOrders>(`/customers/${id}`)
      return data
    },
    enabled: !!id,
  })
}
