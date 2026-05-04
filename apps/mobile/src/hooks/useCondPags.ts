import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { CondPag } from '@addere/types'

export function useCondPags() {
  return useQuery({
    queryKey: ['condpags'],
    queryFn: async () => {
      const { data } = await api.get<CondPag[]>('/condpags')
      return data
    },
  })
}
