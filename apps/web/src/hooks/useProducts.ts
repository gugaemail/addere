import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { Product } from '@addere/types'

export function useProducts(search?: string) {
  return useQuery({
    queryKey: ['products', search],
    queryFn: () =>
      api.get<Product[]>('/products', { params: search ? { search } : undefined }).then((r) => r.data),
  })
}
