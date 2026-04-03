import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Customer, CustomerWithOrders } from '@addere/types'

export function useClientes(search?: string) {
  return useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      const { data } = await api.get<Customer[]>('/customers', { params: { search } })
      return data
    },
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
