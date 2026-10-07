// Recorte de dados por usuário no app (decisão 1 do teste geral) — prisma mockado.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import {
  customerScopeWhere,
  customerWhere,
  orderOwnerIds,
  resolveDataScope,
  resolveOrderOwners,
  resolveViewerScope,
  sellerWhere,
} from '../data-scope'

// Ids únicos por teste: getEffectivePermissions cacheia por usuário
let n = 0
const uid = () => `user-${++n}`

function grant(keys: string[]) {
  prismaMock.userPermission.findMany.mockResolvedValue(keys.map((key) => ({ permission: { key } })))
}

beforeEach(() => {
  resetPrismaMock()
})

describe('resolveDataScope', () => {
  it('vendedor vê a própria carteira', async () => {
    grant([])
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: '000002' })
    const scope = await resolveDataScope(uid(), 'SALESPERSON')
    expect(scope).toEqual({ kind: 'self', vendorCode: '000002' })
    expect(customerScopeWhere(scope)).toEqual({ vendorCode: '000002' })
  })

  it('sem carteira e sem intel.manager, vê a empresa inteira (ADMIN)', async () => {
    grant([])
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: null })
    const scope = await resolveDataScope(uid(), 'ADMIN')
    expect(customerScopeWhere(scope)).toEqual({})
  })

  it('gerente vê as carteiras e os pedidos dos vendedores associados', async () => {
    grant(['intel.manager'])
    const managerId = uid()
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: null })
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u-ana', idVendProt: '000001' },
      { id: 'u-bia', idVendProt: '000002' },
    ])
    const scope = await resolveDataScope(managerId, 'SALESPERSON')
    expect(scope).toEqual({
      kind: 'team',
      userIds: [managerId, 'u-ana', 'u-bia'],
      vendorCodes: ['000001', '000002'],
    })
    expect(customerScopeWhere(scope)).toEqual({ vendorCode: { in: ['000001', '000002'] } })
    // Só os ativos, com carteira, que apontam para ele
    expect(prismaMock.user.findMany.mock.calls[0][0].where).toEqual({
      active: true,
      managerId,
      idVendProt: { not: null },
    })
  })

  it('gerente sem vendedores associados não vê cliente nenhum', async () => {
    grant(['intel.manager'])
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: null })
    const scope = await resolveDataScope(uid(), 'SALESPERSON')
    expect(customerScopeWhere(scope)).toEqual({ vendorCode: { in: [] } })
  })

  it('SUPERADMIN tem todas as permissões, mas não é gerente', async () => {
    prismaMock.permission.findMany.mockResolvedValue([{ key: 'intel.manager' }])
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: null })
    const scope = await resolveDataScope(uid(), 'SUPERADMIN')
    expect(scope.kind).toBe('self')
  })

  // BUG (plano 007): ADMIN com intel.manager cai em 'team' aqui, e loadTeam
  // não acha subordinados dele (ele não é gerente de ninguém) — a equipe sai
  // vazia e customerScopeWhere trava em `{ in: [] }`, zerando a aba Clientes.
  // No mecanismo B (intelligence/manager), o mesmo usuário é `isAdmin` e vê a
  // empresa inteira — as duas implementações discordam. O passo 3 deste plano
  // inverte esta expectativa para `kind: 'company'` depois de unificar os
  // resolvedores; até lá, este teste documenta o comportamento atual (errado).
  it('ADMIN com intel.manager hoje cai em team com equipe vazia (bug)', async () => {
    grant(['intel.manager'])
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: null })
    const scope = await resolveDataScope(uid(), 'ADMIN')
    expect(scope.kind).toBe('team')
    expect(customerScopeWhere(scope)).toEqual({ vendorCode: { in: [] } })
  })
})

describe('resolveOrderOwners', () => {
  it('vendedor: só ele; gerente: ele mais a equipe', async () => {
    grant([])
    const seller = uid()
    expect(await resolveOrderOwners(seller, 'SALESPERSON')).toEqual([seller])

    grant(['intel.manager'])
    const managerId = uid()
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u-ana', idVendProt: '000001' }])
    expect(await resolveOrderOwners(managerId, 'SALESPERSON')).toEqual([managerId, 'u-ana'])
  })
})

// Resolvedor unificado (plano 007). Mesmos cinco casos de resolveDataScope,
// mais o sexto que prova a trava de companyId em loadTeamInCompany.
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

  // A correção deste plano: company tem precedência sobre team, mesmo quando
  // o usuário também tem intel.manager. Compare com o teste do bug acima
  // (describe('resolveDataScope')), que documenta a mesma entrada no
  // mecanismo antigo devolvendo 'team' com equipe vazia.
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
