import { prisma } from '@addere/db'
import type { CreateOrderInput, UpdateOrderInput } from './orders.schema'

const orderInclude = {
  customer:       { select: { id: true, name: true, document: true } },
  branch:         { select: { id: true, name: true, idProtheus: true } },
  transportadora: { select: { id: true, nome: true } },
  condPag:        { select: { id: true, nome: true } },
  items: {
    include: { product: { select: { id: true, name: true, unit: true } } },
  },
} as const

// Verifica se o usuário tem permissão para definir transportadora/condição de pagamento
// diferentes do padrão cadastrado no cliente. Lança erro se não tiver.
export async function assertCarrierAndPaymentTermsAllowed(
  companyId: string,
  customerId: string,
  input: { transportId?: string; condId?: string },
  permissions: Set<string>
): Promise<void> {
  if (input.transportId === undefined && input.condId === undefined) return

  const customer = await prisma.customer.findFirst({ where: { id: customerId, companyId } })
  if (!customer) throw new Error('Cliente não encontrado')

  if (input.transportId !== undefined && !permissions.has('orders.change_carrier')) {
    const defaultTransp = customer.transpPadrao
      ? await prisma.transportadora.findFirst({ where: { companyId, protheusCode: customer.transpPadrao } })
      : null
    if (input.transportId !== (defaultTransp?.id ?? '')) {
      throw new Error('Você não tem permissão para alterar a transportadora do pedido')
    }
  }

  if (input.condId !== undefined && !permissions.has('orders.change_payment_terms')) {
    const defaultCond = customer.condPagPadrao
      ? await prisma.condPag.findFirst({ where: { companyId, protheusCode: customer.condPagPadrao } })
      : null
    if (input.condId !== (defaultCond?.id ?? '')) {
      throw new Error('Você não tem permissão para alterar a condição de pagamento do pedido')
    }
  }
}

export async function getOrder(userId: string, companyId: string, orderId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, userId, companyId },
    include: orderInclude,
  })
}

export async function listOrders(userId: string, companyId: string, limit?: number) {
  return prisma.order.findMany({
    where: { userId, companyId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: orderInclude,
  })
}

export async function getOrderStats(userId: string, companyId: string) {
  const [totalOrders, pendingOrders, syncedOrders, revenueResult] = await Promise.all([
    prisma.order.count({ where: { userId, companyId } }),
    prisma.order.count({ where: { userId, companyId, status: 'PENDING' } }),
    prisma.order.count({ where: { userId, companyId, status: 'SYNCED' } }),
    prisma.order.aggregate({ where: { userId, companyId }, _sum: { total: true } }),
  ])

  return {
    totalOrders,
    pendingOrders,
    syncedOrders,
    totalRevenue: revenueResult._sum.total?.toString() ?? '0',
  }
}

export async function resetOrderToPending(companyId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, companyId } })
  if (!order) throw new Error('Pedido não encontrado')
  if (order.status !== 'SYNCED') throw new Error('Apenas pedidos com status SYNCED podem ser revertidos para PENDING')
  return prisma.order.update({
    where: { id: orderId },
    data: { status: 'PENDING', protheusOrderId: null, syncedAt: null },
    include: orderInclude,
  })
}

export async function cancelOrder(userId: string, companyId: string, orderId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId, companyId } })
  if (!order) throw new Error('Pedido não encontrado')
  if (order.status === 'CANCELLED') throw new Error('Pedido já está cancelado')
  if (order.status !== 'PENDING' && order.status !== 'SYNCED') throw new Error('Apenas pedidos pendentes ou sincronizados podem ser cancelados')
  return prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' }, include: orderInclude })
}

export async function updateOrder(userId: string, companyId: string, orderId: string, input: UpdateOrderInput, permissions: Set<string>) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId, companyId } })
  if (!order) throw new Error('Pedido não encontrado')
  if (order.status !== 'PENDING') throw new Error('Apenas pedidos pendentes podem ser editados')

  await assertCarrierAndPaymentTermsAllowed(companyId, order.customerId, input, permissions)

  const productIds = input.items.map((i) => i.productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, companyId, active: true },
  })

  if (products.length !== productIds.length) {
    throw new Error('Um ou mais produtos não foram encontrados ou estão inativos')
  }

  const productMap = new Map(products.map((p) => [p.id, p]))

  const itemsWithTotals = input.items.map((item) => {
    const product = productMap.get(item.productId)!
    const unitPrice = item.unitPrice !== undefined ? item.unitPrice : Number(product.price)
    const discount = item.discount ?? 0

    const priceCents  = Math.round(unitPrice * 100)
    const qty1000     = Math.round(item.quantity * 1000)
    const discountBP  = Math.round(discount * 100)
    const totalCents  = Math.round(priceCents * qty1000 / 1000 * (10000 - discountBP) / 10000)

    return {
      productId:    item.productId,
      quantity:     item.quantity,
      unitPrice,
      discount,
      total:        totalCents / 100,
      descricao:    item.descricao,
      largura:      item.largura,
      espessura:    item.espessura,
      encolhimento: item.encolhimento,
      xcrav:        item.xcrav,
      tara:         item.tara,
    }
  })

  const orderTotalCents = itemsWithTotals.reduce((sum, i) => sum + Math.round(i.total * 100), 0)

  return prisma.$transaction(async (tx) => {
    await tx.orderItem.deleteMany({ where: { orderId } })
    return tx.order.update({
      where: { id: orderId },
      data: {
        transportId: input.transportId ?? null,
        condId:      input.condId ?? null,
        emissao:     input.emissao ? new Date(input.emissao) : null,
        mennota:     input.mennota,
        notes:       input.notes,
        total:       orderTotalCents / 100,
        items:       { create: itemsWithTotals },
      },
      include: orderInclude,
    })
  })
}

export async function createOrder(userId: string, companyId: string, input: CreateOrderInput, permissions: Set<string>) {
  await assertCarrierAndPaymentTermsAllowed(companyId, input.customerId, input, permissions)

  // Busca os produtos para calcular os preços (filtrado pela empresa)
  const productIds = input.items.map((i) => i.productId)
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, companyId, active: true },
  })

  if (products.length !== productIds.length) {
    throw new Error('Um ou mais produtos não foram encontrados ou estão inativos')
  }

  const productMap = new Map(products.map((p) => [p.id, p]))

  // Calcula totais de cada item usando aritmética inteira (centavos) para evitar erros de float
  const itemsWithTotals = input.items.map((item) => {
    const product = productMap.get(item.productId)!
    const unitPrice = item.unitPrice !== undefined ? item.unitPrice : Number(product.price)
    const discount = item.discount ?? 0

    // Trabalha em centavos e milésimos de unidade para manter precisão inteira
    const priceCents      = Math.round(unitPrice * 100)
    const qty1000         = Math.round(item.quantity * 1000)
    const discountBP      = Math.round(discount * 100)          // basis points 0-10000
    const totalCents      = Math.round(priceCents * qty1000 / 1000 * (10000 - discountBP) / 10000)

    return {
      productId:    item.productId,
      quantity:     item.quantity,
      unitPrice,
      discount,
      total:        totalCents / 100,
      descricao:    item.descricao,
      largura:      item.largura,
      espessura:    item.espessura,
      encolhimento: item.encolhimento,
      xcrav:        item.xcrav,
      tara:         item.tara,
    }
  })

  const orderTotalCents = itemsWithTotals.reduce((sum, i) => sum + Math.round(i.total * 100), 0)

  return prisma.order.create({
    data: {
      userId,
      companyId,
      customerId:  input.customerId,
      branchId:    input.branchId,
      transportId: input.transportId,
      condId:      input.condId,
      emissao:     input.emissao ? new Date(input.emissao) : undefined,
      mennota:     input.mennota,
      notes:       input.notes,
      total:       orderTotalCents / 100,
      items:       { create: itemsWithTotals },
    },
    include: orderInclude,
  })
}
