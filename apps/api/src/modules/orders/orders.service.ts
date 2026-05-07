import { prisma } from '@addere/db'
import type { CreateOrderInput } from './orders.schema'

const orderInclude = {
  customer: { select: { id: true, name: true, document: true } },
  items: {
    include: { product: { select: { id: true, name: true, unit: true } } },
  },
} as const

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
  if (order.status !== 'PENDING') throw new Error('Apenas pedidos pendentes podem ser cancelados')
  return prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' }, include: orderInclude })
}

export async function createOrder(userId: string, companyId: string, input: CreateOrderInput) {
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
      productId: item.productId,
      quantity:  item.quantity,
      unitPrice,
      discount,
      total:     totalCents / 100,
      descricao: item.descricao,
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
