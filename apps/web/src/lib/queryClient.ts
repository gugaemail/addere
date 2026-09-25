import { QueryClient } from '@tanstack/react-query'

// Fábrica de QueryClient — no App Router o client deve nascer dentro do
// provider (useState) e não em escopo de módulo, para não vazar cache entre
// requests no servidor. A config fica centralizada aqui.
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  })
}
