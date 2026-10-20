import type { Prisma } from '@prisma/client'
import { prisma } from '@addere/db'
import type { UserRole } from '@addere/types'
import { notFound } from '../../lib/errors'
import { customerWhere, resolveViewerScope } from '../users/data-scope'

const DEFAULT_LIMIT = 500

/**
 * Busca da carteira: cada palavra tem de aparecer no nome, no código Protheus
 * ou no CPF/CNPJ. O documento é gravado só com dígitos, então "08.039.087"
 * procura "08039087".
 */
export function customerSearchWhere(search?: string): Prisma.CustomerWhereInput {
  const terms = search?.trim().split(/\s+/).filter(Boolean) ?? []
  if (terms.length === 0) return {}
  return {
    AND: terms.map((term) => {
      const digits = term.replace(/\D/g, '')
      return {
        OR: [
          { name: { contains: term, mode: 'insensitive' as const } },
          { protheusCode: { contains: term, mode: 'insensitive' as const } },
          ...(digits ? [{ document: { contains: digits } }] : []),
        ],
      }
    }),
  }
}

export async function listCustomers(
  companyId: string,
  search?: string,
  viewer?: { id: string; role: UserRole }
) {
  // Vendedor vê a carteira; gerente, as carteiras da equipe; admin, a empresa
  // inteira (users/data-scope)
  const scope = viewer ? await resolveViewerScope(viewer.id, viewer.role) : null
  const scopeWhere = scope ? await customerWhere(companyId, scope) : {}

  return prisma.customer.findMany({
    where: {
      companyId,
      active: true,
      ...scopeWhere,
      ...customerSearchWhere(search),
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
