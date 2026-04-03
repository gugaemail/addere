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

  // Calcula totais de cada item
  const itemsWithTotals = input.items.map((item) => {
    const product = productMap.get(item.productId)!
    const unitPrice = Number(product.price)
    const discount = item.discount ?? 0
    const total = unitPrice * item.quantity * (1 - discount / 100)

    return {
      productId: item.productId,
      quantity:  item.quantity,
      unitPrice,
      discount,
      total:     Math.round(total * 100) / 100,
      descricao: item.descricao,
    }
  })

  const orderTotal = itemsWithTotals.reduce((sum, i) => sum + i.total, 0)

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
      total:       Math.round(orderTotal * 100) / 100,
      items:       { create: itemsWithTotals },
    },
    include: orderInclude,
  })
}
