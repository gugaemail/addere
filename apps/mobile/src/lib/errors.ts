// Extração centralizada de mensagem de erro das respostas da API (axios).
// Prioridade: mensagem do backend → sem resposta (rede) → message do Error →
// fallback → texto genérico.
export const NETWORK_ERROR_MESSAGE =
  'Sem conexão com o servidor. Confira a internet e tente de novo.'

export function getApiErrorMessage(err: unknown, fallback?: string): string {
  const e = err as { response?: { data?: { message?: string } }; isAxiosError?: boolean } | null
  const serverMessage = e?.response?.data?.message
  if (serverMessage) return serverMessage
  // Axios sem resposta é rede fora, timeout ou servidor inalcançável: o
  // err.message ("Network Error", "timeout of 8000ms exceeded") ia cru à tela
  if (e?.isAxiosError && !e.response) return NETWORK_ERROR_MESSAGE
  return err instanceof Error ? err.message : (fallback ?? 'Erro desconhecido')
}
