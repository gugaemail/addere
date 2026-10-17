import { resolveAuthRedirect } from '../authRedirect'

// O redirecionamento do AuthGuard (plano 017): empresa suspensa vai para
// /bloqueado sem deslogar; liberada, volta ao app.
describe('resolveAuthRedirect', () => {
  const go = (authenticated: boolean, companyBlocked: boolean, firstSegment?: string) =>
    resolveAuthRedirect({ authenticated, companyBlocked, firstSegment })

  it('sem sessão fora do login → login', () => {
    expect(go(false, false, '(app)')).toBe('/(auth)/login')
    expect(go(false, false, undefined)).toBe('/(auth)/login')
  })

  it('sem sessão no login → nada', () => {
    expect(go(false, false, '(auth)')).toBeNull()
  })

  it('sem sessão em bloqueado → login (e o bloqueio antigo não segura ninguém)', () => {
    expect(go(false, false, 'bloqueado')).toBe('/(auth)/login')
    expect(go(false, true, 'bloqueado')).toBe('/(auth)/login')
  })

  it('bloqueado em (app) ou no login → /bloqueado', () => {
    expect(go(true, true, '(app)')).toBe('/bloqueado')
    expect(go(true, true, '(auth)')).toBe('/bloqueado')
  })

  it('bloqueado em bloqueado → nada', () => {
    expect(go(true, true, 'bloqueado')).toBeNull()
  })

  it('liberado em bloqueado → (app)', () => {
    expect(go(true, false, 'bloqueado')).toBe('/(app)')
  })

  it('liberado em (auth) → (app)', () => {
    expect(go(true, false, '(auth)')).toBe('/(app)')
  })

  it('liberado em (app) → nada', () => {
    expect(go(true, false, '(app)')).toBeNull()
  })
})
