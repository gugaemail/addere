// Regras puras de acesso e home do painel (E9) — testadas em __tests__/home-redirect.test.ts.
// O painel deixa de ser exclusivo do SUPERADMIN: ADMIN e quem tem permissão
// intel.* também entram, cada papel caindo na sua home.
import type { UserPublic } from '@addere/types'

export type PanelUser = Pick<UserPublic, 'role'> & { permissions?: string[] }

export function hasIntelPermission(permissions: string[] | undefined): boolean {
  return (permissions ?? []).some((key) => key.startsWith('intel.'))
}

// Quem pode entrar no painel web
export function canAccessPanel(user: PanelUser): boolean {
  return user.role === 'SUPERADMIN' || user.role === 'ADMIN' || hasIntelPermission(user.permissions)
}

// Home por papel: SUPERADMIN cai nas Empresas; demais na Inteligência
export function resolveHome(user: PanelUser): string {
  return user.role === 'SUPERADMIN' ? '/dashboard' : '/inteligencia'
}

// Destino guardado no `?next=` do login. Só caminho interno: absoluto
// (http://…), protocol-relative (//host) e a variante com barra invertida
// viram open redirect depois da autenticação. Páginas públicas também não
// servem de destino — voltaria para o login em looping.
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/')) return null
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null
  if (raw.startsWith('/login') || raw.startsWith('/resetar-senha')) return null
  return raw
}
