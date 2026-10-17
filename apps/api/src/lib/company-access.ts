import type { AccessBlockReason } from '@prisma/client'
import type { CompanyAccess } from '@addere/types'

// Acesso da empresa (plano 017): a mesma resposta para o authenticate, o
// /auth/me, a faixa do ADMIN e a situação do cliente na Gestão Addere.

interface CompanyAccessFields {
  active?: boolean | null
  accessBlockedAt?: Date | null
  accessBlockReason?: AccessBlockReason | null
}

/**
 * Empresa ausente (SUPERADMIN, ou mock de teste sem empresa) não é bloqueada.
 * `active === false`, e não `!active`: campo ausente também não bloqueia.
 * Bloqueio sem motivo vale OVERDUE: entra na regra, que o libera se não se sustentar.
 */
export function resolveCompanyAccess(
  company: CompanyAccessFields | null | undefined
): CompanyAccess {
  if (!company) return { blocked: false, reason: null }
  if (company.active === false) return { blocked: true, reason: 'INACTIVE' }
  if (company.accessBlockedAt) {
    return { blocked: true, reason: company.accessBlockReason ?? 'OVERDUE' }
  }
  return { blocked: false, reason: null }
}
