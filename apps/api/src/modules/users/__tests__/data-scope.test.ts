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

const COMPANY_A = 'company-a'

// Resolvedor unificado de escopo de equipe (plano 007, 10/2026; corrigido em
// 07/10/2026). Substitui o antigo resolveDataScope/customerScopeWhere/
// resolveOrderOwners deste arquivo (mecanismo A) e o resolveTeamScope/
// sellerScopeWhere de intelligence/manager/manager.service.ts (mecanismo B)
// — os dois foram removidos depois que seus chamadores migraram para
// resolveViewerScope/customerWhere/orderOwnerIds/sellerWhere.
//
// resolveViewerScope é barata (só permissões + o próprio idVendProt) e NÃO
// consulta a equipe — a correção de 07/10/2026 tirou userIds/vendorCodes do
// tipo porque a Inteligência nunca os lia (sellerWhere usa só managerId) e a
// consulta antiga era redundante em todo request de /intel/manager/* feito
// por um gerente. Quem precisa da equipe (customerWhere/orderOwnerIds, só o
// núcleo do app) carrega sob demanda.
describe('resolveViewerScope', () => {
  it('vendedor vê a própria carteira', async () => {
    grant([])
    const seller = uid()
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: '000002' })
    const scope = await resolveViewerScope(seller, 'SALESPERSON')
    expect(scope).toEqual({ kind: 'self', userId: seller, vendorCode: '000002' })
    // resolveViewerScope não toca a equipe — nenhuma consulta a user.findMany
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it('gerente com intel.manager vira team, carregando só a decisão (sem consultar a equipe ainda)', async () => {
    grant(['intel.manager'])
    const managerId = uid()
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: null })
    const scope = await resolveViewerScope(managerId, 'SALESPERSON')
    expect(scope).toEqual({ kind: 'team', managerId, ownVendorCode: null })
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it('SUPERADMIN não tem recorte', async () => {
    const scope = await resolveViewerScope(uid(), 'SUPERADMIN')
    expect(scope).toEqual({ kind: 'company' })
  })

  // A correção deste plano (007): company tem precedência sobre team, mesmo
  // quando o usuário também tem intel.manager. No mecanismo antigo
  // (resolveDataScope, já removido), a mesma entrada devolvia 'team' com
  // equipe vazia e zerava a aba Clientes — esse era o bug. Mudança
  // intencional: a expectativa aqui é a nova, não a antiga.
  it('ADMIN com intel.manager vê a empresa inteira (company tem precedência sobre team)', async () => {
    grant(['intel.admin', 'intel.manager'])
    prismaMock.user.findUnique.mockResolvedValue({ idVendProt: null })
    const scope = await resolveViewerScope(uid(), 'ADMIN')
    expect(scope).toEqual({ kind: 'company' })
  })
})

describe('sellerWhere', () => {
  it('é puro: team e self não tocam o banco', () => {
    expect(sellerWhere({ kind: 'team', managerId: 'm1', ownVendorCode: null })).toEqual({
      OR: [{ managerId: 'm1' }, { id: 'm1' }],
    })
    expect(sellerWhere({ kind: 'self', userId: 'u1', vendorCode: null })).toEqual({
      OR: [{ id: 'u1' }],
    })
    expect(sellerWhere({ kind: 'company' })).toEqual({})
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })
})

// customerWhere e orderOwnerIds carregam a equipe sob demanda (só para
// 'team') — são os únicos chamadores de loadTeamInCompany.
describe('customerWhere / orderOwnerIds', () => {
  it('self: a própria carteira; dono do pedido é o próprio', async () => {
    const scope = { kind: 'self', userId: 'u1', vendorCode: '000002' } as const
    expect(await customerWhere(COMPANY_A, scope)).toEqual({ vendorCode: '000002' })
    expect(await orderOwnerIds(COMPANY_A, scope)).toEqual(['u1'])
  })

  it('company: sem filtro — vendorCode vazio e dono do pedido null (sem excluir usuário desativado)', async () => {
    const scope = { kind: 'company' } as const
    expect(await customerWhere(COMPANY_A, scope)).toEqual({})
    expect(await orderOwnerIds(COMPANY_A, scope)).toBeNull()
    expect(prismaMock.user.findMany).not.toHaveBeenCalled()
  })

  it('team com dois vendedores: equipe mais o próprio, filtrada por companyId', async () => {
    const managerId = 'manager-a'
    const scope = { kind: 'team', managerId, ownVendorCode: null } as const
    prismaMock.user.findMany.mockResolvedValue([
      { id: 'u-ana', idVendProt: '000001' },
      { id: 'u-bia', idVendProt: '000002' },
    ])

    expect(await customerWhere(COMPANY_A, scope)).toEqual({
      vendorCode: { in: ['000001', '000002'] },
    })
    expect(await orderOwnerIds(COMPANY_A, scope)).toEqual([managerId, 'u-ana', 'u-bia'])

    // Cada chamada carrega a equipe de novo (sem cache entre as duas) — duas
    // consultas, ambas filtradas por companyId e pelo managerId do gerente
    expect(prismaMock.user.findMany).toHaveBeenCalledTimes(2)
    for (const call of prismaMock.user.findMany.mock.calls) {
      expect(call[0].where).toEqual({
        companyId: COMPANY_A,
        active: true,
        managerId,
        idVendProt: { not: null },
      })
    }
  })

  it('gerente que vende: o próprio código entra na carteira junto com a equipe', async () => {
    const managerId = 'manager-b'
    const scope = { kind: 'team', managerId, ownVendorCode: '000009' } as const
    prismaMock.user.findMany.mockResolvedValue([{ id: 'u-ana', idVendProt: '000001' }])
    expect(await customerWhere(COMPANY_A, scope)).toEqual({
      vendorCode: { in: ['000009', '000001'] },
    })
  })

  it('gerente sem equipe não vê cliente nenhum (comportamento desejado, mantém)', async () => {
    const scope = { kind: 'team', managerId: 'manager-c', ownVendorCode: null } as const
    prismaMock.user.findMany.mockResolvedValue([])
    expect(await customerWhere(COMPANY_A, scope)).toEqual({ vendorCode: { in: [] } })
  })

  // Trava de companyId em loadTeamInCompany: um managerId que aponte para
  // alguém de outra empresa (dado sujo, import errado) não deve trazer esse
  // vendedor para a equipe.
  it('gerente da empresa A não enxerga vendedor da empresa B, mesmo com managerId apontando para ele', async () => {
    const managerId = 'manager-d'
    const scope = { kind: 'team', managerId, ownVendorCode: null } as const
    // O mock não filtra de verdade — simula o que o banco faria: só devolve
    // quem também bate com o companyId pedido no `where`.
    prismaMock.user.findMany.mockImplementation(async (args: { where: { companyId: string } }) =>
      args.where.companyId === COMPANY_A ? [] : [{ id: 'u-empresa-b', idVendProt: '999999' }]
    )
    expect(await orderOwnerIds(COMPANY_A, scope)).toEqual([managerId])
    expect(prismaMock.user.findMany.mock.calls[0][0].where.companyId).toBe(COMPANY_A)
  })
})
