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

// --- Resolvedor unificado (plano 007) ---------------------------------
//
// ViewerScope substitui DataScope (acima) e TeamScope
// (intelligence/manager/manager.service.ts). Três estados explícitos, com
// precedência company > team > self: SUPERADMIN e intel.admin veem a
// empresa inteira mesmo com intel.manager também concedido — é essa ordem
// que conserta o bug de ADMIN + intel.manager (ver data-scope.test.ts).
export type ViewerScope =
  | { kind: 'company' }
  | { kind: 'team'; managerId: string; userIds: string[]; vendorCodes: string[] }
  | { kind: 'self'; userId: string; vendorCode: string | null }

// Mesmo filtro de loadTeam, mas também travado por companyId: sem isso, um
// managerId que por acaso aponte para um usuário de outra empresa (dado sujo,
// import errado) traria gente de fora para a equipe.
async function loadTeamInCompany(companyId: string, managerId: string) {
  return prisma.user.findMany({
    where: { companyId, active: true, managerId, idVendProt: { not: null } },
    select: { id: true, idVendProt: true },
  })
}

export async function resolveViewerScope(
  userId: string,
  role: UserRole,
  companyId: string
): Promise<ViewerScope> {
  if (role === 'SUPERADMIN') return { kind: 'company' }

  const permissions = await getEffectivePermissions(userId, role)
  if (permissions.has('intel.admin')) return { kind: 'company' }

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { idVendProt: true } })
  const ownCode = me?.idVendProt ?? null

  if (permissions.has('intel.manager')) {
    const team = await loadTeamInCompany(companyId, userId)
    return {
      kind: 'team',
      managerId: userId,
      userIds: [userId, ...team.map((s) => s.id)],
      vendorCodes: [...(ownCode ? [ownCode] : []), ...team.map((s) => s.idVendProt as string)],
    }
  }

  return { kind: 'self', userId, vendorCode: ownCode }
}

/** Trecho do `where` de Customer para o recorte. Equipe vazia → lista vazia. */
export function customerWhere(scope: ViewerScope): { vendorCode?: string | { in: string[] } } {
  if (scope.kind === 'company') return {}
  if (scope.kind === 'team') return { vendorCode: { in: scope.vendorCodes } }
  return scope.vendorCode ? { vendorCode: scope.vendorCode } : {}
}

/**
 * Ids de dono visíveis nos pedidos: o próprio e, para o gerente, a equipe.
 * 'company' não tem lista de donos para enumerar — quem chama resolve a
 * empresa inteira por fora (orders.routes.ts busca todo mundo ativo da
 * empresa antes de montar o filtro), por isso a assinatura exclui esse caso.
 */
export function orderOwnerIds(scope: Exclude<ViewerScope, { kind: 'company' }>): string[] {
  return scope.kind === 'team' ? scope.userIds : [scope.userId]
}

/**
 * Filtro de vendedores do recorte: a equipe do gerente (managerId = ele) e
 * ele mesmo; para 'self' (não devia ocorrer nas rotas de Inteligência, que
 * exigem intel.admin/intel.manager, mas a função fica total), só ele mesmo;
 * sem recorte (company), a empresa inteira.
 */
export function sellerWhere(scope: ViewerScope): { OR?: Array<{ managerId: string } | { id: string }> } {
  if (scope.kind === 'team') return { OR: [{ managerId: scope.managerId }, { id: scope.managerId }] }
  if (scope.kind === 'self') return { OR: [{ id: scope.userId }] }
  return {}
}
