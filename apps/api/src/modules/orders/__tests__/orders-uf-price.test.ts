// Preço por UF: item sem unitPrice entra no preço de tabela da UF do cliente;
// sem preço para a UF, no geral. O unitPrice que o app manda continua valendo.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const CUSTOMER = 'cust-1'
const BRANCH = 'branch-1'
const PRODUCT = 'prod-1'

let app: FastifyInstance
let token: string

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  token = app.jwt.sign({
    sub: 'sales-1',
    email: 'v@a.com',
    role: 'SALESPERSON',
    companyId: COMPANY,
  })
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue({ active: true })
  prismaMock.branch.findFirst.mockResolvedValue({ id: BRANCH })
  prismaMock.product.findMany.mockResolvedValue([
    { id: PRODUCT, price: 10, ufPrices: { SP: 12.5 } },
  ])
  prismaMock.order.create.mockResolvedValue({ id: 'order-1' })
})

function createOrderFor(uf: string | null, item: Record<string, unknown> = {}) {
  prismaMock.customer.findFirst.mockResolvedValue({ msblql: null, uf })
  return app.inject({
    method: 'POST',
    url: '/orders',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      customerId: CUSTOMER,
      branchId: BRANCH,
      items: [{ productId: PRODUCT, quantity: 2, ...item }],
    },
  })
}

function createdItem() {
  return prismaMock.order.create.mock.calls[0][0].data.items.create[0]
}

describe('POST /orders — preço de tabela por UF', () => {
  it('cliente de SP: preço de SP', async () => {
    expect((await createOrderFor('SP')).statusCode).toBe(201)
    expect(createdItem().unitPrice).toBe(12.5)
  })

  it('cliente de UF sem preço próprio: preço geral', async () => {
    await createOrderFor('MG')
    expect(createdItem().unitPrice).toBe(10)
  })

  it('cliente sem UF: preço geral', async () => {
    await createOrderFor(null)
    expect(createdItem().unitPrice).toBe(10)
  })

  it('unitPrice informado pelo app vence a tabela', async () => {
    await createOrderFor('SP', { unitPrice: 11 })
    expect(createdItem().unitPrice).toBe(11)
  })
})
