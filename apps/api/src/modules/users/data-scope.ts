// Recorte de dados por usuário no app (decisão 1 do teste geral de 25/08).
//
// Vendedor: a própria carteira (Customer.vendorCode = idVendProt) e os
// próprios pedidos (Order.userId). Gerente — SALESPERSON com intel.manager e
// sem carteira própria — vê os clientes e os pedidos dos vendedores associados
// a ele (User.managerId); se um dia tiver carteira, ela entra junto. Quem não
// tem carteira nem é gerente (ADMIN, por exemplo) continua vendo a empresa
// inteira nos clientes, como sempre foi.
import { prisma } from '@addere/db'
import type { UserRole } from '@addere/types'
import { getEffectivePermissions } from '../permissions/permissions.service'

export type DataScope =
  | { kind: 'self'; vendorCode: string | null }
  | { kind: 'team'; userIds: string[]; vendorCodes: string[] }

/** SUPERADMIN tem o catálogo inteiro de permissões — não é gerente de ninguém. */
export async function isTeamManager(userId: string, role: UserRole): Promise<boolean> {
  if (role === 'SUPERADMIN') return false
  const permissions = await getEffectivePermissions(userId, role)
  return permissions.has('intel.manager')
}

async function loadTeam(managerId: string) {
  return prisma.user.findMany({
    where: { active: true, managerId, idVendProt: { not: null } },
    select: { id: true, idVendProt: true },
  })
}

export async function resolveDataScope(userId: string, role: UserRole): Promise<DataScope> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { idVendProt: true },
  })
  const ownCode = me?.idVendProt ?? null
  if (!(await isTeamManager(userId, role))) return { kind: 'self', vendorCode: ownCode }

  const team = await loadTeam(userId)
  return {
    kind: 'team',
    userIds: [userId, ...team.map((s) => s.id)],
    vendorCodes: [...(ownCode ? [ownCode] : []), ...team.map((s) => s.idVendProt as string)],
  }
}

/** Donos de pedido visíveis: o próprio usuário e, para o gerente, a equipe. */
export async function resolveOrderOwners(userId: string, role: UserRole): Promise<string[]> {
  if (!(await isTeamManager(userId, role))) return [userId]
  const team = await loadTeam(userId)
  return [userId, ...team.map((s) => s.id)]
}

/** Trecho do `where` de Customer para o recorte. Equipe vazia → lista vazia. */
export function customerScopeWhere(scope: DataScope): {
  vendorCode?: string | { in: string[] }
} {
  if (scope.kind === 'team') return { vendorCode: { in: scope.vendorCodes } }
  return scope.vendorCode ? { vendorCode: scope.vendorCode } : {}
}
