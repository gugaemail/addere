import { prisma } from '@addere/db'

const DEFAULT_LIMIT = 500

export async function listCustomers(companyId: string, search?: string, userId?: string) {
  let vendorCode: string | null = null
  if (userId) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { idVendProt: true } })
    vendorCode = user?.idVendProt ?? null
  }

  return prisma.customer.findMany({
    where: {
      companyId,
      active: true,
      ...(vendorCode && { vendorCode }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { document: { contains: search } },
        ],
      }),
    },
    orderBy: { name: 'asc' },
    take: DEFAULT_LIMIT,
  })
}

export async function getCustomerById(companyId: string, id: string) {
  const customer = await prisma.customer.findFirst({
    where: { id, companyId, active: true },
    include: {
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { items: { include: { product: { select: { id: true, name: true, unit: true } } } } },
      },
    },
  })

  if (!customer) throw new Error('Cliente não encontrado')

  return customer
}
