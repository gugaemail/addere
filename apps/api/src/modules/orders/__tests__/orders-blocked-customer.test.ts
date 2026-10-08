// Pedido para cliente bloqueado no Protheus (A1_MSBLQL='1') é recusado com 422
// — na criação e na edição do pedido pendente (plano 010). Cliente excluído
// (active=false) ou de outra empresa não é encontrado: 404.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const CUSTOMER = 'cust-1'
const BRANCH = 'branch-1'
const PRODUCT = 'prod-1'
const ORDER = 'order-1'
const BLOCKED_MESSAGE = 'Cliente bloqueado no Protheus — não é possível fazer pedido'

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
  prismaMock.product.findMany.mockResolvedValue([{ id: PRODUCT, price: 10 }])
  prismaMock.order.create.mockResolvedValue({ id: ORDER })
  prismaMock.order.findFirst.mockResolvedValue({
    id: ORDER,
    customerId: CUSTOMER,
    status: 'PENDING',
  })
  prismaMock.order.update.mockResolvedValue({ id: ORDER })
})

const headers = () => ({ authorization: `Bearer ${token}` })
const items = [{ productId: PRODUCT, quantity: 2 }]

/** Cliente visível para a empresa (filtro companyId + active) com o msblql dado. */
function customerWith(msblql: string | null) {
  prismaMock.customer.findFirst.mockImplementation(
    async (args: { where: { id: string; companyId: string; active?: boolean } }) =>
      args.where.id === CUSTOMER && args.where.companyId === COMPANY && args.where.active
        ? { msblql }
        : null
  )
}

function createOrder() {
  return app.inject({
    method: 'POST',
    url: '/orders',
    headers: headers(),
    payload: { customerId: CUSTOMER, branchId: BRANCH, items },
  })
}

function editOrder() {
  return app.inject({
    method: 'PUT',
    url: `/orders/${ORDER}`,
    headers: headers(),
    payload: { items },
  })
}

describe('POST /orders — cliente bloqueado', () => {
  it('bloqueado (msblql=1) → 422 com a mensagem, sem criar o pedido', async () => {
    customerWith('1')
    const res = await createOrder()
    expect(res.statusCode).toBe(422)
    expect(res.json().message).toBe(BLOCKED_MESSAGE)
    expect(prismaMock.order.create).not.toHaveBeenCalled()
  })

  it('liberado (msblql=2) → segue e cria o pedido', async () => {
    customerWith('2')
    const res = await createOrder()
    expect(res.statusCode).toBe(201)
    expect(prismaMock.order.create).toHaveBeenCalledTimes(1)
  })

  it('msblql vazio → segue (só "1" é bloqueado)', async () => {
    customerWith(null)
    const res = await createOrder()
    expect(res.statusCode).toBe(201)
  })

  it('cliente inexistente, excluído ou de outra empresa → 404', async () => {
    const res = await createOrder()
    expect(res.statusCode).toBe(404)
    expect(prismaMock.order.create).not.toHaveBeenCalled()
  })
})

describe('PUT /orders/:id — cliente bloqueado', () => {
  it('pedido pendente de cliente que ficou bloqueado → 422, sem editar', async () => {
    customerWith('1')
    const res = await editOrder()
    expect(res.statusCode).toBe(422)
    expect(res.json().message).toBe(BLOCKED_MESSAGE)
    expect(prismaMock.order.update).not.toHaveBeenCalled()
  })

  it('cliente liberado → segue e edita', async () => {
    customerWith('2')
    const res = await editOrder()
    expect(res.statusCode).toBe(200)
    expect(prismaMock.order.update).toHaveBeenCalledTimes(1)
  })

  it('cliente excluído → 404', async () => {
    const res = await editOrder()
    expect(res.statusCode).toBe(404)
  })
})
