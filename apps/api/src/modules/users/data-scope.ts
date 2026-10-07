// Recorte de dados por usuário no app (decisão 1 do teste geral de 25/08;
// unificado com o mecanismo da Inteligência pelo plano 007 em 10/2026).
//
// Vendedor: a própria carteira (Customer.vendorCode = idVendProt) e os
// próprios pedidos (Order.userId). Gerente — SALESPERSON com intel.manager e
// sem carteira própria — vê os clientes e os pedidos dos vendedores associados
// a ele (User.managerId); se um dia tiver carteira, ela entra junto.
// SUPERADMIN e quem tem intel.admin veem a empresa inteira — mesmo com
// intel.manager também concedido (precedência company > team > self).
//
// ViewerScope é o resolvedor único: antes deste módulo existiam dois
// mecanismos independentes para a mesma pergunta — DataScope aqui (usado por
// Clientes e Pedidos) e TeamScope em intelligence/manager/manager.service.ts
// (usado pela Inteligência) — e eles discordavam quando um ADMIN também tinha
// intel.manager (DataScope zerava a aba Clientes; TeamScope mostrava a
// empresa inteira). O plano 007 removeu o DataScope e migrou o TeamScope para
// importar deste arquivo.
import { prisma } from '@addere/db'
import type { UserRole } from '@addere/types'
import { getEffectivePermissions } from '../permissions/permissions.service'

// ViewerScope carrega só a *decisão* — barata, sem consulta à equipe.
// 'team' guarda managerId e o próprio idVendProt (ownVendorCode); quem precisa
// da lista de vendedores da equipe pede explicitamente a customerWhere/
// orderOwnerIds (únicos chamadores que tocam o banco para isso — a
// Inteligência nunca precisa dessa lista, só de managerId via sellerWhere).
// Correção de 07/10/2026 (ver plano 007): a forma original fazia
// resolveViewerScope carregar a equipe inteira sempre que o escopo era
// 'team', mesmo pra quem só ia usar sellerWhere (que lê só managerId) — uma
// consulta extra e redundante em todo request de /intel/manager/* feito por
// um gerente.
export type ViewerScope =
  | { kind: 'company' }
  | { kind: 'team'; managerId: string; ownVendorCode: string | null }
  | { kind: 'self'; userId: string; vendorCode: string | null }

// Equipe do gerente, travada por companyId: sem isso, um managerId que por
// acaso aponte para um usuário de outra empresa (dado sujo, import errado)
// traria gente de fora para a equipe. Chamada só por quem precisa da lista
// (customerWhere/orderOwnerIds) — nunca por resolveViewerScope nem por
// sellerWhere.
async function loadTeamInCompany(companyId: string, managerId: string) {
  return prisma.user.findMany({
    where: { companyId, active: true, managerId, idVendProt: { not: null } },
    select: { id: true, idVendProt: true },
  })
}

/** Barato: só permissões + o próprio idVendProt. NÃO consulta a equipe. */
export async function resolveViewerScope(userId: string, role: UserRole): Promise<ViewerScope> {
  if (role === 'SUPERADMIN') return { kind: 'company' }

  const permissions = await getEffectivePermissions(userId, role)
  if (permissions.has('intel.admin')) return { kind: 'company' }

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { idVendProt: true } })
  const ownCode = me?.idVendProt ?? null

  if (permissions.has('intel.manager')) return { kind: 'team', managerId: userId, ownVendorCode: ownCode }

  return { kind: 'self', userId, vendorCode: ownCode }
}

/**
 * Trecho do `where` de Customer para o recorte. Carrega a equipe sob demanda
 * (só para 'team') — só o núcleo do app (Clientes) chama isto.
 */
export async function customerWhere(
  companyId: string,
  scope: ViewerScope
): Promise<{ vendorCode?: string | { in: string[] } }> {
  if (scope.kind === 'company') return {}
  if (scope.kind === 'team') {
    const team = await loadTeamInCompany(companyId, scope.managerId)
    const vendorCodes = [
      ...(scope.ownVendorCode ? [scope.ownVendorCode] : []),
      ...team.map((s) => s.idVendProt as string),
    ]
    return { vendorCode: { in: vendorCodes } }
  }
  return scope.vendorCode ? { vendorCode: scope.vendorCode } : {}
}

/**
 * Ids de dono visíveis nos pedidos: o próprio e, para o gerente, a equipe.
 * `null` para 'company' significa "sem filtro de dono" — quem chama precisa
 * omitir o filtro nesse caso (ver orders.routes.ts), e não construir uma
 * lista de usuários ativos, que excluiria pedidos de quem foi desativado.
 * Carrega a equipe sob demanda (só para 'team') — só orders.routes.ts chama.
 */
export async function orderOwnerIds(companyId: string, scope: ViewerScope): Promise<string[] | null> {
  if (scope.kind === 'company') return null
  if (scope.kind === 'team') {
    const team = await loadTeamInCompany(companyId, scope.managerId)
    return [scope.managerId, ...team.map((s) => s.id)]
  }
  return [scope.userId]
}

/**
 * Filtro de vendedores do recorte: a equipe do gerente (managerId = ele) e
 * ele mesmo; para 'self' (não devia ocorrer nas rotas de Inteligência, que
 * exigem intel.admin/intel.manager, mas a função fica total), só ele mesmo;
 * sem recorte (company), a empresa inteira. Puro — só lê `managerId`/
 * `userId` do scope, nunca consulta o banco. É o que a Inteligência usa.
 */
export function sellerWhere(scope: ViewerScope): { OR?: Array<{ managerId: string } | { id: string }> } {
  if (scope.kind === 'team') return { OR: [{ managerId: scope.managerId }, { id: scope.managerId }] }
  if (scope.kind === 'self') return { OR: [{ id: scope.userId }] }
  return {}
}
