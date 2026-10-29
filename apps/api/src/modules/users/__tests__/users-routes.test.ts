// Rotas de usuário no escopo global — o perfil Gerente (vendedor +
// intel.manager, decisão D3) e o recorte por empresa de quem não é SUPERADMIN.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { Prisma } from '@prisma/client'
import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'
const TARGET = '33333333-3333-4333-8333-333333333333'

const PERMISSIONS_BY_SUB: Record<string, string[]> = {
  'super-1': [],
  'admin-a': ['users.view', 'users.manage'],
  'sales-a': [],
}

let app: FastifyInstance
let tokens: Record<string, string>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    'super-1': app.jwt.sign({ sub: 'super-1', email: 's@a.com', role: 'SUPERADMIN' }),
    'admin-a': app.jwt.sign({
      sub: 'admin-a',
      email: 'a@a.com',
      role: 'ADMIN',
      companyId: COMPANY_A,
    }),
    'sales-a': app.jwt.sign({
      sub: 'sales-a',
      email: 'v@a.com',
      role: 'SALESPERSON',
      companyId: COMPANY_A,
    }),
  }
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue({ active: true })
  prismaMock.userPermission.findMany.mockImplementation(
    async (args: { where: { userId?: string } }) =>
      (PERMISSIONS_BY_SUB[args.where.userId ?? ''] ?? []).map((key) => ({ permission: { key } }))
  )
})

const auth = (sub: string) => ({ authorization: `Bearer ${tokens[sub]}` })

/** O findUnique serve tanto ao authenticate quanto ao lookup da empresa alvo. */
function targetInCompany(companyId: string | null) {
  prismaMock.user.findUnique.mockImplementation(async (args: { where: { id: string } }) =>
    args.where.id === TARGET ? { companyId } : { active: true }
  )
}

describe('PATCH /users/:id/active', () => {
  it('o toggle continua funcionando na rota nova', async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET, active: true, companyId: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET, active: false })

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}/active`,
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(200)
  })

  it('vendedor sem users.manage não desativa ninguém', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}/active`,
      headers: auth('sales-a'),
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('PATCH /users/:id', () => {
  it('edita nome e campos de vendedor', async () => {
    targetInCompany(COMPANY_A)
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET, companyId: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET, name: 'Ana Nova' })
    prismaMock.userPermission.findFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { name: 'Ana Nova', visitsPerDay: 10, servedCities: ['Campinas'] },
    })

    expect(res.statusCode).toBe(200)
    const data = prismaMock.user.update.mock.calls[0][0].data
    expect(data).toMatchObject({ name: 'Ana Nova', visitsPerDay: 10, servedCities: ['Campinas'] })
  })

  it('ADMIN não edita usuário de outra empresa', async () => {
    targetInCompany(COMPANY_B)
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { name: 'Tentativa' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMIN não promove ninguém a administrador', async () => {
    targetInCompany(COMPANY_A)
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { role: 'ADMIN' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('promover a Gerente concede intel.manager', async () => {
    targetInCompany(COMPANY_A)
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET, companyId: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET })
    prismaMock.permission.findMany.mockResolvedValue([{ id: 'perm-1' }])

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { role: 'SALESPERSON', intelManager: true },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().intelManager).toBe(true)
    expect(prismaMock.permission.findMany.mock.calls[0][0].where.key.in).toContain('intel.manager')
    expect(prismaMock.userPermission.createMany).toHaveBeenCalled()
  })

  it('rebaixar de Gerente revoga a permissão — rótulo e acesso não podem discordar', async () => {
    targetInCompany(COMPANY_A)
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET, companyId: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET })

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { role: 'SALESPERSON', intelManager: false },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().intelManager).toBe(false)
    expect(prismaMock.userPermission.deleteMany.mock.calls[0][0].where).toMatchObject({
      userId: TARGET,
    })
  })

  it('sem mexer no perfil, a permissão atual é preservada e reportada', async () => {
    targetInCompany(COMPANY_A)
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET, companyId: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET })
    prismaMock.userPermission.findFirst.mockResolvedValue({ id: 'up-1' })

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { name: 'Só o nome' },
    })

    expect(res.json().intelManager).toBe(true)
    expect(prismaMock.userPermission.createMany).not.toHaveBeenCalled()
    expect(prismaMock.userPermission.deleteMany).not.toHaveBeenCalled()
  })

  it('usuário sem empresa não é editável enquanto não for vinculado', async () => {
    targetInCompany(null)
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('super-1'),
      payload: { name: 'Órfão' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().message).toMatch(/sem empresa/i)
  })

  it('vincula o órfão à empresa informada e segue com a edição', async () => {
    // O caso real: usuário criado sem empresa pelo bug antigo do painel. Sem
    // isto ele fica invisível na Equipe em campo e sem caminho de conserto.
    targetInCompany(null)
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A })
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET, companyId: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET, name: 'Gustavo Gerente' })
    prismaMock.userPermission.findFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('super-1'),
      payload: { name: 'Gustavo Gerente', companyId: COMPANY_A },
    })

    expect(res.statusCode).toBe(200)
    // Duas escritas: a do vínculo e a da edição em si
    expect(prismaMock.user.update.mock.calls[0][0].data).toEqual({ companyId: COMPANY_A })
    expect(prismaMock.user.update.mock.calls[1][0].data).toMatchObject({ name: 'Gustavo Gerente' })
    // E o recorte da edição passou a ser a empresa nova, não null
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toMatchObject({ companyId: COMPANY_A })
  })

  it('não vincula a uma empresa que não existe', async () => {
    targetInCompany(null)
    prismaMock.company.findUnique.mockResolvedValue(null)

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('super-1'),
      payload: { name: 'Órfão', companyId: COMPANY_A },
    })

    expect(res.statusCode).toBe(404)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('não move um usuário que já tem empresa', async () => {
    // Trocar de empresa arrastaria pedidos, gerente e código de vendedor junto
    targetInCompany(COMPANY_A)

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('super-1'),
      payload: { companyId: COMPANY_B },
    })

    expect(res.statusCode).toBe(404)
    expect(res.json().message).toMatch(/mover/i)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('repetir a empresa atual não conta como mudança', async () => {
    targetInCompany(COMPANY_A)
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET, companyId: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET })
    prismaMock.userPermission.findFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('super-1'),
      payload: { name: 'Ana', companyId: COMPANY_A },
    })

    expect(res.statusCode).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledTimes(1)
  })

  it('corpo inválido → 400', async () => {
    targetInCompany(COMPANY_A)
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { visitsPerDay: 999 },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /users', () => {
  it('perfil Gerente nasce vendedor com intel.manager', async () => {
    // O findUnique por id é o authenticate; por email é a checagem de duplicado
    prismaMock.user.findUnique.mockImplementation(async (args: { where: { email?: string } }) =>
      args.where.email ? null : { active: true }
    )
    prismaMock.user.create.mockResolvedValue({ id: 'novo', role: 'SALESPERSON' })
    prismaMock.permission.findMany.mockResolvedValue([{ id: 'perm-1' }])

    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('super-1'),
      payload: {
        name: 'Gerente Novo',
        email: 'gerente@a.com',
        password: 'senha12345',
        role: 'SALESPERSON',
        intelManager: true,
        companyId: COMPANY_A,
      },
    })

    expect(res.statusCode).toBe(201)
    expect(res.json().intelManager).toBe(true)
    expect(prismaMock.user.create.mock.calls[0][0].data).toMatchObject({
      role: 'SALESPERSON',
      companyId: COMPANY_A,
    })
  })

  // Bug de 28/10/2026: o schema da criação não tinha os campos do vendedor e o
  // Zod os descartava — código, veículo e gerente só gravavam editando depois.
  const MANAGER = '44444444-4444-4444-8444-444444444444'
  const sellerBody = {
    name: 'Vendedor Novo',
    email: 'vendedor@a.com',
    password: 'senha12345',
    role: 'SALESPERSON',
    idVendProt: '000123',
    visitsPerDay: 8,
    vehicle: 'MOTORCYCLE',
    servedCities: ['Campinas', 'Valinhos'],
    messageTone: 'formal',
    managerId: MANAGER,
  }

  function emailFree() {
    prismaMock.user.findUnique.mockImplementation(async (args: { where: { email?: string } }) =>
      args.where.email ? null : { active: true }
    )
  }

  it('vendedor nasce com código Protheus, veículo, gerente e o resto do perfil', async () => {
    emailFree()
    prismaMock.user.findFirst.mockResolvedValue({ id: MANAGER })
    prismaMock.user.create.mockResolvedValue({ id: 'novo', role: 'SALESPERSON' })

    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('admin-a'),
      payload: sellerBody,
    })

    expect(res.statusCode).toBe(201)
    expect(prismaMock.user.create.mock.calls[0][0].data).toMatchObject({
      companyId: COMPANY_A,
      idVendProt: '000123',
      visitsPerDay: 8,
      vehicle: 'MOTORCYCLE',
      servedCities: ['Campinas', 'Valinhos'],
      messageTone: 'formal',
      managerId: MANAGER,
    })
    // O gerente é conferido na empresa de quem cria
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toMatchObject({
      id: MANAGER,
      companyId: COMPANY_A,
      active: true,
    })
  })

  it('gerente que não é usuário ativo da empresa: 422 e ninguém é criado', async () => {
    emailFree()
    prismaMock.user.findFirst.mockResolvedValue(null)

    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('admin-a'),
      payload: sellerBody,
    })

    expect(res.statusCode).toBe(422)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it('usuário sem empresa não pode nascer com gerente', async () => {
    emailFree()
    // SUPERADMIN sem companyId cria usuário global
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('super-1'),
      payload: sellerBody,
    })

    expect(res.statusCode).toBe(422)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it('veículo fora da lista: 400, como na edição', async () => {
    emailFree()
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('admin-a'),
      payload: { ...sellerBody, vehicle: 'BIKE' },
    })
    expect(res.statusCode).toBe(400)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })
})

// Teto diário de tokens do agente (custo de IA): todo usuário nasce com o
// padrão do banco (100 mil); só o SUPERADMIN muda e só ele vê.
describe('teto diário de IA do vendedor', () => {
  const body = {
    name: 'Vendedor Novo',
    email: 'vendedor@a.com',
    password: 'senha12345',
    role: 'SALESPERSON',
    idVendProt: '000123',
    companyId: COMPANY_A,
  }

  function emailFree() {
    prismaMock.user.findUnique.mockImplementation(async (args: { where: { email?: string } }) =>
      args.where.email ? null : { active: true }
    )
  }

  it('sem valor, nasce com o padrão do banco', async () => {
    emailFree()
    prismaMock.user.create.mockResolvedValue({ id: 'novo', role: 'SALESPERSON' })
    await app.inject({ method: 'POST', url: '/users', headers: auth('super-1'), payload: body })
    expect(prismaMock.user.create.mock.calls[0][0].data).not.toHaveProperty('llmDailyTokenCap')
  })

  it('SUPERADMIN cria com outro teto', async () => {
    emailFree()
    prismaMock.user.create.mockResolvedValue({ id: 'novo', role: 'SALESPERSON' })
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('super-1'),
      payload: { ...body, llmDailyTokenCap: 50_000 },
    })
    expect(res.statusCode).toBe(201)
    expect(prismaMock.user.create.mock.calls[0][0].data.llmDailyTokenCap).toBe(50_000)
  })

  it('ADMIN da empresa: o teto é ignorado na criação e na edição', async () => {
    emailFree()
    prismaMock.user.create.mockResolvedValue({ id: 'novo', role: 'SALESPERSON' })
    await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('admin-a'),
      payload: { ...body, llmDailyTokenCap: 9_000_000 },
    })
    expect(prismaMock.user.create.mock.calls[0][0].data).not.toHaveProperty('llmDailyTokenCap')

    targetInCompany(COMPANY_A)
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET, companyId: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET })
    await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { name: 'Ana', llmDailyTokenCap: 9_000_000 },
    })
    for (const [args] of prismaMock.user.update.mock.calls) {
      expect(args.data).not.toHaveProperty('llmDailyTokenCap')
    }
  })

  it('SUPERADMIN edita o teto (0 desliga a IA do vendedor)', async () => {
    targetInCompany(COMPANY_A)
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET, companyId: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET })
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('super-1'),
      payload: { llmDailyTokenCap: 0 },
    })
    expect(res.statusCode).toBe(200)
    const capUpdate = prismaMock.user.update.mock.calls.find(
      ([args]: [{ data: Record<string, unknown> }]) => 'llmDailyTokenCap' in args.data
    )
    expect(capUpdate?.[0]).toEqual({ where: { id: TARGET }, data: { llmDailyTokenCap: 0 } })
  })

  it('teto negativo: 400', async () => {
    targetInCompany(COMPANY_A)
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('super-1'),
      payload: { llmDailyTokenCap: -1 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('só o SUPERADMIN recebe o teto na lista', async () => {
    await app.inject({ method: 'GET', url: '/users', headers: auth('super-1') })
    await app.inject({ method: 'GET', url: '/users', headers: auth('admin-a') })
    const [superArgs, adminArgs] = prismaMock.user.findMany.mock.calls.map(
      ([args]: [{ select: Record<string, unknown> }]) => args.select
    )
    expect(superArgs.llmDailyTokenCap).toBe(true)
    expect(adminArgs).not.toHaveProperty('llmDailyTokenCap')
  })
})

// Transportadora e condição de pagamento no pedido do app: o administrador da
// empresa liga e desliga por usuário no formulário de edição (o modal de
// Permissões é só do SUPERADMIN).
describe('permissões do pedido no formulário do usuário', () => {
  const CARRIER = 'orders.change_carrier'
  const PAYMENT = 'orders.change_payment_terms'

  /** Linhas concedidas ao alvo nas consultas por lote; o resto segue o padrão. */
  function targetHolds(keys: string[]) {
    prismaMock.userPermission.findMany.mockImplementation(
      async (args: { where: { userId?: string | { in: string[] } } }) => {
        const userId = args.where.userId
        if (typeof userId === 'object') {
          return keys.map((key) => ({ userId: TARGET, permission: { key } }))
        }
        return (PERMISSIONS_BY_SUB[userId ?? ''] ?? []).map((key) => ({ permission: { key } }))
      }
    )
  }

  function editable() {
    targetInCompany(COMPANY_A)
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET, companyId: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET })
  }

  it('ADMIN desliga a troca de transportadora do vendedor', async () => {
    editable()
    targetHolds([PAYMENT])

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { canChangeCarrier: false },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ canChangeCarrier: false, canChangePaymentTerms: true })
    expect(prismaMock.userPermission.deleteMany.mock.calls[0][0].where).toEqual({
      userId: TARGET,
      permission: { key: { in: [CARRIER] } },
    })
    expect(prismaMock.userPermission.createMany).not.toHaveBeenCalled()
  })

  it('ADMIN liga as duas', async () => {
    editable()
    targetHolds([CARRIER, PAYMENT])
    prismaMock.permission.findMany.mockResolvedValue([{ id: 'p-carrier' }, { id: 'p-payment' }])

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { canChangeCarrier: true, canChangePaymentTerms: true },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ canChangeCarrier: true, canChangePaymentTerms: true })
    expect(prismaMock.permission.findMany.mock.calls[0][0].where.key.in).toEqual([CARRIER, PAYMENT])
    expect(prismaMock.userPermission.createMany.mock.calls[0][0].data).toEqual([
      { userId: TARGET, permissionId: 'p-carrier' },
      { userId: TARGET, permissionId: 'p-payment' },
    ])
  })

  it('sem a permissão no catálogo, avisa em vez de fingir que gravou', async () => {
    editable()
    prismaMock.permission.findMany.mockResolvedValue([])

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { canChangeCarrier: true },
    })

    expect(res.statusCode).not.toBe(200)
    expect(res.json().message).toMatch(/não cadastrada/)
  })

  it('ADMIN não mexe nas permissões de usuário de outra empresa', async () => {
    targetInCompany(COMPANY_B)

    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { canChangeCarrier: true, canChangePaymentTerms: true },
    })

    expect(res.statusCode).toBe(403)
    expect(prismaMock.userPermission.createMany).not.toHaveBeenCalled()
    expect(prismaMock.userPermission.deleteMany).not.toHaveBeenCalled()
  })

  it('vendedor não libera a troca para si mesmo', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/sales-a`,
      headers: auth('sales-a'),
      payload: { canChangeCarrier: true },
    })

    expect(res.statusCode).toBe(403)
    expect(prismaMock.userPermission.createMany).not.toHaveBeenCalled()
  })

  it('vendedor criado com a caixa desmarcada perde a permissão do padrão', async () => {
    prismaMock.user.findUnique.mockImplementation(async (args: { where: { email?: string } }) =>
      args.where.email ? null : { active: true }
    )
    prismaMock.user.create.mockResolvedValue({ id: 'novo', role: 'SALESPERSON' })
    prismaMock.permission.findMany.mockResolvedValue([{ id: 'p-payment' }])

    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('admin-a'),
      payload: {
        name: 'Vendedor Novo',
        email: 'vendedor@a.com',
        password: 'senha12345',
        role: 'SALESPERSON',
        canChangeCarrier: false,
        canChangePaymentTerms: true,
      },
    })

    expect(res.statusCode).toBe(201)
    expect(prismaMock.userPermission.deleteMany.mock.calls[0][0].where).toEqual({
      userId: 'novo',
      permission: { key: { in: [CARRIER] } },
    })
  })

  it('a lista diz o que cada um pode, para o formulário abrir marcado certo', async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: TARGET, name: 'Ana', role: 'SALESPERSON', company: { name: 'A' } },
    ])
    targetHolds([CARRIER, 'intel.manager'])

    const res = await app.inject({ method: 'GET', url: '/users', headers: auth('admin-a') })

    expect(res.statusCode).toBe(200)
    expect(res.json()[0]).toMatchObject({
      intelManager: true,
      canChangeCarrier: true,
      canChangePaymentTerms: false,
    })
  })
})

// Trava de licenças (plano 015, passo 3): os caminhos 1, 3 e 6 e o 5 pela rota
// global. Contrato ACTIVE com limite 22 (20 + 2) e 22 em uso, salvo quando o
// caso diz outro. Sem configurar o contrato, o mock responde "sem contrato" e
// os casos acima seguem sem limite.
describe('trava de licenças', () => {
  function seatsInUse(used: number, status = 'ACTIVE') {
    prismaMock.companyContract.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.companyContract.findUnique.mockResolvedValue({ id: 'contract-1', status })
    prismaMock.contractTerms.findMany.mockResolvedValue([
      {
        status: 'EFFECTIVE',
        version: 1,
        effectiveFrom: new Date('2026-09-01T12:00:00Z'),
        includedSeats: 20,
        extraSeats: 2,
      },
    ])
    prismaMock.user.count.mockResolvedValue(used)
  }

  /** Alvo com papel, status e empresa — o findUnique também responde ao authenticate */
  function target(row: { role: string; active: boolean; companyId: string | null }) {
    prismaMock.user.findUnique.mockImplementation(async (args: { where: { id?: string } }) =>
      args.where.id === TARGET ? row : { active: true }
    )
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET, ...row })
  }

  function newUserEmailFree() {
    prismaMock.user.findUnique.mockImplementation(async (args: { where: { email?: string } }) =>
      args.where.email ? null : { active: true }
    )
  }

  const newSeller = {
    name: 'Vendedor Novo',
    email: 'novo@example.com',
    password: 'senha12345',
    role: 'SALESPERSON',
  }

  beforeEach(() => {
    seatsInUse(22)
  })

  it('caminho 1 no limite: POST /users recusa com o código e o detalhe', async () => {
    newUserEmailFree()
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('admin-a'),
      payload: newSeller,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({
      code: 'SEAT_LIMIT_REACHED',
      details: { used: 22, limit: 22 },
    })
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it('caminho 1: ADMIN é grátis, nem passa pela trava', async () => {
    newUserEmailFree()
    prismaMock.user.create.mockResolvedValue({ id: 'novo', role: 'ADMIN' })
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('super-1'),
      payload: { ...newSeller, role: 'ADMIN', companyId: COMPANY_A },
    })
    expect(res.statusCode).toBe(201)
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })

  it('caminho 1, limite − 1: cria', async () => {
    seatsInUse(21)
    newUserEmailFree()
    prismaMock.user.create.mockResolvedValue({ id: 'novo', role: 'SALESPERSON' })
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: auth('admin-a'),
      payload: newSeller,
    })
    expect(res.statusCode).toBe(201)
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1)
  })

  it('caminho 3: reativar vendedor no limite recusa', async () => {
    target({ role: 'SALESPERSON', active: false, companyId: COMPANY_A })
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}/active`,
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('SEAT_LIMIT_REACHED')
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('caminho 3: reativar abaixo do limite passa', async () => {
    seatsInUse(21)
    target({ role: 'SALESPERSON', active: false, companyId: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET, active: true })
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}/active`,
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(200)
  })

  it('caminho 3: desativar no limite passa, sem trava', async () => {
    target({ role: 'SALESPERSON', active: true, companyId: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET, active: false })
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}/active`,
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })

  it('caminho 5 pela rota global: ADMIN para Gerente recusa com o código', async () => {
    // Prova que o catch do PATCH /users/:id repassa o AppError
    target({ role: 'ADMIN', active: true, companyId: COMPANY_A })
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { role: 'SALESPERSON', intelManager: true },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('SEAT_LIMIT_REACHED')
    expect(prismaMock.refreshToken.deleteMany).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('caminho 6: vincular órfão vendedor ativo no limite recusa', async () => {
    target({ role: 'SALESPERSON', active: true, companyId: null })
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A })
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('super-1'),
      payload: { name: 'Órfão', companyId: COMPANY_A },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('SEAT_LIMIT_REACHED')
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('caminho 6: vincular órfão inativo não ocupa licença', async () => {
    target({ role: 'SALESPERSON', active: false, companyId: null })
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A })
    prismaMock.user.update.mockResolvedValue({ id: TARGET, name: 'Órfão' })
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('super-1'),
      payload: { name: 'Órfão', companyId: COMPANY_A },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.user.update.mock.calls[0][0].data).toEqual({ companyId: COMPANY_A })
    expect(prismaMock.companyContract.updateMany).not.toHaveBeenCalled()
  })

  it('o 422 de gerente inválido deixa de sair como 404', async () => {
    target({ role: 'SALESPERSON', active: true, companyId: COMPANY_A })
    // assertValidManager não acha o gerente
    prismaMock.user.findFirst.mockImplementation(async (args: { where: { id: string } }) =>
      args.where.id === TARGET ? { id: TARGET, role: 'SALESPERSON', active: true } : null
    )
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('admin-a'),
      payload: { managerId: '44444444-4444-4444-8444-444444444444' },
    })
    expect(res.statusCode).toBe(422)
  })
})

// A5 do e2e de 18/10/2026: a mensagem crua do Prisma (com o caminho do arquivo
// e o trecho do código) não pode chegar na resposta.
describe('erros sem mensagem crua do Prisma', () => {
  const CRU =
    'Invalid `db.user.create()` invocation in C:\\api\\src\\modules\\users\\users.service.ts:122:13'
  const p2002 = (target: unknown) =>
    new Prisma.PrismaClientKnownRequestError(
      `${CRU}\n\nUnique constraint failed on the fields: (\`email\`)`,
      {
        code: 'P2002',
        clientVersion: '5.22.0',
        meta: { target },
      }
    )

  function emailFree() {
    prismaMock.user.findUnique.mockImplementation(async (args: { where: { email?: string } }) =>
      args.where.email ? null : { active: true }
    )
  }
  const body = {
    name: 'Dup',
    email: 'dup@example.com',
    password: 'senha12345',
    role: 'ADMIN',
    companyId: COMPANY_A,
  }
  const post = () =>
    app.inject({ method: 'POST', url: '/users', headers: auth('super-1'), payload: body })

  it('duas criações ao mesmo tempo: a segunda esbarra no @unique → 409 "Email já cadastrado"', async () => {
    emailFree()
    prismaMock.user.create.mockRejectedValue(p2002(['email']))
    const res = await post()
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ message: 'Email já cadastrado' })
  })

  it('a checagem de antes da criação também responde 409 "Email já cadastrado"', async () => {
    prismaMock.user.findUnique.mockImplementation(async (args: { where: { email?: string } }) =>
      args.where.email ? { id: 'outro' } : { active: true }
    )
    const res = await post()
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ message: 'Email já cadastrado' })
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it('outro erro que não é AppError: 500 com a mensagem genérica, sem o texto do Prisma', async () => {
    emailFree()
    prismaMock.user.create.mockRejectedValue(
      new Prisma.PrismaClientUnknownRequestError(CRU, { clientVersion: '5.22.0' })
    )
    const res = await post()
    expect(res.statusCode).toBe(500)
    expect(res.json()).toEqual({ message: 'Erro interno do servidor' })
    expect(res.body).not.toMatch(/invocation|users\.service|prisma/i)
  })

  it('P2002 em outro campo não vira "Email já cadastrado": 409 genérico do handler', async () => {
    emailFree()
    prismaMock.user.create.mockRejectedValue(p2002(['companyId', 'idVendProt']))
    const res = await post()
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ message: 'Registro duplicado' })
  })

  it('PATCH trocando para um e-mail que já existe: 409 "Email já cadastrado", não 404 cru', async () => {
    targetInCompany(COMPANY_A)
    prismaMock.user.findFirst.mockResolvedValue({ id: TARGET, companyId: COMPANY_A })
    prismaMock.user.update.mockRejectedValue(p2002(['email']))
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}`,
      headers: auth('super-1'),
      payload: { email: 'existe@example.com' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json()).toEqual({ message: 'Email já cadastrado' })
  })

  it('PATCH /users/:id/active de usuário que não existe: 404 com a mensagem de sempre', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null)
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${TARGET}/active`,
      headers: auth('admin-a'),
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ message: 'Usuário não encontrado' })
  })
})
