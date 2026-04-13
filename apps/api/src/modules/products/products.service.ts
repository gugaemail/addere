import { prisma } from '@addere/db'

const DEFAULT_LIMIT = 500

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
    take: DEFAULT_LIMIT,
  })
}
