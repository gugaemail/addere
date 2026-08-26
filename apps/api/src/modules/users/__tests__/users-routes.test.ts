// Rotas de usuário no escopo global — o perfil Gerente (vendedor +
// intel.manager, decisão D3) e o recorte por empresa de quem não é SUPERADMIN.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

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
})
