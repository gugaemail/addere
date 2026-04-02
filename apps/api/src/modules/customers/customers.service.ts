import { prisma } from '@addere/db'

export async function listCustomers(search?: string) {
  return prisma.customer.findMany({
    where: {
      active: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { document: { contains: search } },
        ],
      }),
    },
    orderBy: { name: 'asc' },
  })
}

export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, active: true },
    include: {
      orders: {
        orderBy: { createdAt: 'desc' },
        include: { items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
      },
    },
  })

  if (!customer) throw new Error('Cliente não encontrado')

  return customer
}
