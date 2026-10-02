// Gating puro da ficha da empresa (E23) — espelha o requireCompanyScope da
// API. Vive aqui, e não dentro do componente, pelo mesmo motivo do nav-gating:
// é a regra que decide quem entra, e regra assim se testa sem montar React.

export interface CompanyScopeContext {
  isSuperAdmin: boolean
  isAdmin: boolean
  /** Empresa do usuário logado (null para SUPERADMIN, que não pertence a uma) */
  companyId: string | null
  /** Empresa que a URL está pedindo (/empresas/[id]) */
  targetId?: string | null
}

/** SUPERADMIN abre qualquer empresa; ADMIN, só a dele; os demais, nenhuma. */
export function canOpenCompany(ctx: CompanyScopeContext): boolean {
  if (ctx.isSuperAdmin) return true
  if (!ctx.isAdmin) return false
  return Boolean(ctx.targetId) && ctx.targetId === ctx.companyId
}
