import type { Prisma } from '@prisma/client'
import { prisma } from '@addere/db'

const DEFAULT_LIMIT = 500

/**
 * Busca do catálogo: cada palavra tem de aparecer na descrição ou no código,
 * sem diferença de maiúsculas — "adc", "ADC945" e "saco preto 100l" acham.
 */
export function productSearchWhere(search?: string): Prisma.ProductWhereInput {
  const terms = search?.trim().split(/\s+/).filter(Boolean) ?? []
  if (terms.length === 0) return {}
  return {
    AND: terms.map((term) => ({
      OR: [
        { name: { contains: term, mode: 'insensitive' as const } },
        { protheusCode: { contains: term, mode: 'insensitive' as const } },
      ],
    })),
  }
}

export async function listProducts(companyId: string, search?: string) {
  return prisma.product.findMany({
    where: {
      companyId,
      active: true,
      ...productSearchWhere(search),
    },
    orderBy: { name: 'asc' },
    take: DEFAULT_LIMIT,
  })
}
