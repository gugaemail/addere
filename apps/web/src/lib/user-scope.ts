// Recorte da lista de usuários por empresa — puro, para poder ser testado.
//
// A regra tem uma exceção que não é óbvia: usuário sem empresa não pertence a
// recorte nenhum, então um filtro ingênuo por companyId o faz desaparecer da
// tela — inclusive de /users, a única capaz de consertá-lo. Foi assim que o
// "Gustavo Gerente" sumiu depois da unificação.
import type { UserPublic } from '@addere/types'

/** Usuário que deveria ter empresa e não tem — defeito de cadastro, não estado válido. */
export function isCompanyless(user: Pick<UserPublic, 'companyId' | 'role'>): boolean {
  return !user.companyId && user.role !== 'SUPERADMIN'
}

/**
 * Aplica a empresa ativa da sidebar à lista. Sem empresa selecionada, devolve
 * tudo. Com empresa, devolve os dela **mais os órfãos**: eles precisam ficar
 * alcançáveis para serem vinculados. O SUPERADMIN é global de propósito — não
 * é órfão e fica de fora do recorte de uma empresa.
 */
export function scopeUsersToCompany(users: UserPublic[], companyId: string | null): UserPublic[] {
  if (!companyId) return users
  return users.filter((u) => u.companyId === companyId || isCompanyless(u))
}

/** Candidatos a gerente de um usuário: intel.manager, ativo e da mesma empresa (D3b). */
export function managerOptions(
  users: UserPublic[],
  companyId: string | null
): { id: string; name: string }[] {
  if (!companyId) return []
  return users
    .filter((u) => u.intelManager && u.active && u.companyId === companyId)
    .map((u) => ({ id: u.id, name: u.name }))
}
