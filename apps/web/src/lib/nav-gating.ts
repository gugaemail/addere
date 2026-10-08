// Gating puro dos itens de navegação da sidebar (E9) — testado em
// __tests__/nav-gating.test.ts. O layout monta os grupos e filtra por aqui.
export type NavRequirement =
  | 'superadmin'
  | 'admin'
  | { permission: string | string[]; orAdmin?: boolean }

// Configuração da Inteligência (Consultas, Premissas): só intel.admin, igual à
// API — sem orAdmin, para não abrir a tela a quem a API responderia 403. O ADMIN
// nasce com ela (D3c); o gerente não vê, nem para leitura (decisão de 08/10/2026).
export const INTEL_ADMIN_ONLY: NavRequirement = { permission: 'intel.admin' }

export interface NavGateContext {
  isSuperAdmin: boolean
  isAdmin: boolean
  hasPermission: (key: string) => boolean
}

export function canSeeNavItem(
  requires: NavRequirement | undefined,
  ctx: NavGateContext
): boolean {
  if (!requires) return true
  if (requires === 'superadmin') return ctx.isSuperAdmin
  if (requires === 'admin') return ctx.isAdmin || ctx.isSuperAdmin
  if (ctx.isSuperAdmin) return true // SUPERADMIN tem o catálogo inteiro
  // orAdmin: item também aberto por papel — a home do ADMIN é /inteligencia
  // (resolveHome), então o item precisa existir mesmo sem a permissão
  if (requires.orAdmin && ctx.isAdmin) return true
  const keys = Array.isArray(requires.permission) ? requires.permission : [requires.permission]
  return keys.some((key) => ctx.hasPermission(key))
}

// Filtra itens por permissão e remove grupos que ficaram vazios
export function filterNavGroups<
  Item extends { requires?: NavRequirement },
  Group extends { items: Item[] },
>(groups: Group[], ctx: NavGateContext): Group[] {
  return groups
    .map((group) => ({ ...group, items: group.items.filter((i) => canSeeNavItem(i.requires, ctx)) }))
    .filter((group) => group.items.length > 0)
}
