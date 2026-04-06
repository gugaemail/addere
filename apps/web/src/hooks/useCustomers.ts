import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Customer } from '@addere/types'

export function useCustomers(search?: string) {
  return useQuery({
    queryKey: ['customers', search],
    queryFn: () =>
      api.get<Customer[]>('/customers', { params: search ? { search } : undefined }).then((r) => r.data),
  })
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: () => api.get<Customer>(`/customers/${id}`).then((r) => r.data),
    enabled: !!id,
  })
}
