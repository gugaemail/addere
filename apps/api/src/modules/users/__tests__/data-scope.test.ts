// Recorte de dados por usuário no app (decisão 1 do teste geral) — prisma mockado.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { customerScopeWhere, resolveDataScope, resolveOrderOwners } from '../data-scope'

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
