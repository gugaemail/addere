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
