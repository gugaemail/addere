import { PrismaClient } from '@prisma/client'

// Evita múltiplas instâncias do Prisma Client em desenvolvimento (hot reload)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Re-exporta os tipos gerados pelo Prisma para uso nos outros workspaces
export type { User, Customer, Product, Order, OrderItem, RefreshToken } from '@prisma/client'
export { Role, OrderStatus } from '@prisma/client'
