// Perfil de usuário no painel — puro, testado em __tests__/user-profile.test.ts.
//
// "Gerente" não é um valor do enum Role (decisão D3: o enum tem só SUPERADMIN,
// ADMIN e SALESPERSON). É um vendedor com a permissão intel.manager. Este
// módulo é a única tradução entre o que a tela mostra e o que o banco guarda —
// nas duas direções, para o rótulo e o formulário nunca discordarem.
import type { UserPublic, UserRole } from '@addere/types'

export type Profile = 'SALESPERSON' | 'MANAGER' | 'ADMIN' | 'SUPERADMIN'

export const PROFILE_LABELS: Record<Profile, string> = {
  SALESPERSON: 'Vendedor',
  MANAGER: 'Gerente',
  ADMIN: 'Administrador',
  SUPERADMIN: 'Super administrador',
}

/** Perfis oferecidos no cadastro — SUPERADMIN não se cria pelo painel. */
export const SELECTABLE_PROFILES: Profile[] = ['SALESPERSON', 'MANAGER', 'ADMIN']

type ProfileSource = Pick<UserPublic, 'role'> & { intelManager?: boolean }

export function profileOf(user: ProfileSource): Profile {
  if (user.role === 'SUPERADMIN') return 'SUPERADMIN'
  if (user.role === 'ADMIN') return 'ADMIN'
  return user.intelManager ? 'MANAGER' : 'SALESPERSON'
}

export function profileLabel(user: ProfileSource): string {
  return PROFILE_LABELS[profileOf(user)]
}

/**
 * O que gravar para cada perfil. `intelManager` é a permissão intel.manager,
 * concedida por cima dos defaults do role — nunca é default (decisão D3c).
 */
export function profileToPayload(profile: Profile): {
  role: UserRole
  intelManager: boolean
} {
  if (profile === 'ADMIN') return { role: 'ADMIN', intelManager: false }
  if (profile === 'MANAGER') return { role: 'SALESPERSON', intelManager: true }
  if (profile === 'SUPERADMIN') return { role: 'SUPERADMIN', intelManager: false }
  return { role: 'SALESPERSON', intelManager: false }
}

/** Vendedor e gerente têm carteira; o administrador não. */
export function hasVendorProfile(profile: Profile): boolean {
  return profile === 'SALESPERSON' || profile === 'MANAGER'
}
