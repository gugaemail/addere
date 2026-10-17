// Para onde o AuthGuard (app/_layout.tsx) manda o usuário — puro, testado em
// __tests__/authRedirect.test.ts. Plano 017: empresa bloqueada vai para a tela
// de acesso suspenso, sem deslogar; liberada, volta para o app.

export type AuthRedirect = '/(auth)/login' | '/(app)' | '/bloqueado'

export function resolveAuthRedirect(input: {
  authenticated: boolean
  companyBlocked: boolean
  firstSegment: string | undefined
}): AuthRedirect | null {
  const { authenticated, companyBlocked, firstSegment } = input
  if (!authenticated) return firstSegment === '(auth)' ? null : '/(auth)/login'
  if (companyBlocked) return firstSegment === 'bloqueado' ? null : '/bloqueado'
  if (firstSegment === '(auth)' || firstSegment === 'bloqueado') return '/(app)'
  return null
}
