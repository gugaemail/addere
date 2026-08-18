// Extração centralizada de mensagem de erro das respostas da API (axios).
// Prioridade: mensagem do backend → message do Error → fallback → texto genérico.
export function getApiErrorMessage(err: unknown, fallback?: string): string {
  return (
    (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
    (err instanceof Error ? err.message : fallback ?? 'Erro desconhecido')
  )
}
