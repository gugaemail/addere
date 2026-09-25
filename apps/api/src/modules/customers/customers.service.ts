import { prisma } from '@addere/db'
import type { UserRole } from '@addere/types'
import { notFound } from '../../lib/errors'
import { customerScopeWhere, resolveDataScope } from '../users/data-scope'

const DEFAULT_LIMIT = 500

export async function listCustomers(
  companyId: string,
  search?: string,
  viewer?: { id: string; role: UserRole }
) {
  // Vendedor vê a carteira; gerente, as carteiras da equipe (users/data-scope)
  const scope = viewer ? await resolveDataScope(viewer.id, viewer.role) : null

  return prisma.customer.findMany({
    where: {
      companyId,
      active: true,
      ...(scope ? customerScopeWhere(scope) : {}),
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
        include: {
          items: { include: { product: { select: { id: true, name: true, unit: true } } } },
        },
      },
    },
  })

  if (!customer) throw notFound('Cliente não encontrado')

  return customer
}
