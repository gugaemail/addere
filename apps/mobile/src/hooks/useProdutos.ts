import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Product } from '@addere/types'

export function useProdutos(search?: string) {
  return useQuery({
    queryKey: ['products', search],
    queryFn: async () => {
      const { data } = await api.get<Product[]>('/products', { params: { search } })
      return data
    },
  })
}
