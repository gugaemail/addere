// Recorte de dados por usuário no app (decisão 1 do teste geral; resolvedor
// unificado pelo plano 007) — prisma mockado.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { customerWhere, orderOwnerIds, resolveViewerScope, sellerWhere } from '../data-scope'

// Ids únicos por teste: getEffectivePermissions cacheia por usuário
let n = 0
const uid = () => `user-${++n}`

function grant(keys: string[]) {
  prismaMock.userPermission.findMany.mockResolvedValue(keys.map((key) => ({ permission: { key } })))
}

beforeEach(() => {
  resetPrismaMock()
})

// Resolvedor unificado de escopo de equipe (plano 007, 10/2026). Substitui
// o antigo resolveDataScope/customerScopeWhere/resolveOrderOwners deste
// arquivo (mecanismo A) — removido depois que customers.service.ts e
// orders.routes.ts migraram para resolveViewerScope/customerWhere/
// orderOwnerIds. O mecanismo B (resolveTeamScope/sellerScopeWhere, em
// intelligence/manager/manager.service.ts) migra num passo seguinte deste
// mesmo plano. Cinco casos espelham o que os mecanismos antigos já faziam
// certo; o sexto prova a trava nova de companyId.
describe('resolveViewerScope', () => {
  const COMPANY_A = 'company-a'

  it('vendedor vê a própria carteira', async () => {
    grant([])
    const seller = uid()
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: '000002' })
    const scope = await resolveViewerScope(seller, 'SALESPERSON', COMPANY_A)
    expect(scope).toEqual({ kind: 'self', userId: seller, vendorCode: '000002' })
    expect(customerWhere(scope)).toEqual({ vendorCode: '000002' })
    if (scope.kind !== 'company') expect(orderOwnerIds(scope)).toEqual([seller])
  })

  it('gerente com dois vendedores vê os dois mais ele próprio', async () => {
    grant(['intel.manager'])
    const managerId = uid()
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: null })
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u-ana', idVendProt: '000001' },
      { id: 'u-bia', idVendProt: '000002' },
    ])
    const scope = await resolveViewerScope(managerId, 'SALESPERSON', COMPANY_A)
    expect(scope).toEqual({
      kind: 'team',
      managerId,
      userIds: [managerId, 'u-ana', 'u-bia'],
      vendorCodes: ['000001', '000002'],
    })
    expect(customerWhere(scope)).toEqual({ vendorCode: { in: ['000001', '000002'] } })
    if (scope.kind !== 'company') {
      expect(orderOwnerIds(scope)).toEqual([managerId, 'u-ana', 'u-bia'])
    }
    expect(sellerWhere(scope)).toEqual({ OR: [{ managerId }, { id: managerId }] })
    // Filtrado também por companyId — trava nova deste plano
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({
      companyId: COMPANY_A,
      active: true,
      managerId,
      idVendProt: { not: null },
    })
  })

  it('gerente sem equipe não vê cliente nenhum (comportamento desejado, mantém)', async () => {
    grant(['intel.manager'])
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: null })
    const scope = await resolveViewerScope(uid(), 'SALESPERSON', COMPANY_A)
    expect(customerWhere(scope)).toEqual({ vendorCode: { in: [] } })
  })

  it('SUPERADMIN não tem recorte', async () => {
    const scope = await resolveViewerScope(uid(), 'SUPERADMIN', COMPANY_A)
    expect(scope).toEqual({ kind: 'company' })
    expect(customerWhere(scope)).toEqual({})
    expect(sellerWhere(scope)).toEqual({})
  })

  // A correção deste plano (007): company tem precedência sobre team, mesmo
  // quando o usuário também tem intel.manager. No mecanismo antigo
  // (resolveDataScope, já removido), a mesma entrada devolvia 'team' com
  // equipe vazia e zerava a aba Clientes — esse era o bug. Mudança
  // intencional: a expectativa aqui é a nova, não a antiga.
  it('ADMIN com intel.manager vê a empresa inteira (company tem precedência sobre team)', async () => {
    grant(['intel.admin', 'intel.manager'])
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: null })
    const scope = await resolveViewerScope(uid(), 'ADMIN', COMPANY_A)
    expect(scope).toEqual({ kind: 'company' })
    expect(customerWhere(scope)).toEqual({})
  })

  // Trava nova de companyId em loadTeamInCompany: um managerId que aponte
  // para alguém de outra empresa (dado sujo, import errado) não deve trazer
  // esse vendedor para a equipe.
  it('gerente da empresa A não enxerga vendedor da empresa B, mesmo com managerId apontando para ele', async () => {
    grant(['intel.manager'])
    const managerId = uid()
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: null })
    // O mock não filtra de verdade — simula o que o banco faria: só devolve
    // quem também bate com o companyId pedido no `where`.
    prismaMock.user.findMany.mockImplementation(async (args: { where: { companyId: string } }) =>
      args.where.companyId === COMPANY_A ? [] : [{ id: 'u-empresa-b', idVendProt: '999999' }]
    )
    const scope = await resolveViewerScope(managerId, 'SALESPERSON', COMPANY_A)
    expect(scope).toEqual({ kind: 'team', managerId, userIds: [managerId], vendorCodes: [] })
    expect(prismaMock.user.findMany.mock.calls[0][0].where.companyId).toBe(COMPANY_A)
  })
})
