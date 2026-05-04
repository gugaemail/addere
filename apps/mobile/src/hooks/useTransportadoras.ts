import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { Transportadora } from '@addere/types'

export function useTransportadoras() {
  return useQuery({
    queryKey: ['transportadoras'],
    queryFn: async () => {
      const { data } = await api.get<Transportadora[]>('/transportadoras')
      return data
    },
  })
}
