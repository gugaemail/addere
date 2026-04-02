import { prisma } from '@addere/db'

export async function listProducts(search?: string) {
  return prisma.product.findMany({
    where: {
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
