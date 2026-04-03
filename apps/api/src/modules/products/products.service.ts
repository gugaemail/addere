import { prisma } from '@addere/db'

export async function listProducts(companyId: string, search?: string) {
  return prisma.product.findMany({
    where: {
      companyId,
      active: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { protheusCode: { contains: search } },
        ],
      }),
    },
    orderBy: { name: 'asc' },
  })
}
