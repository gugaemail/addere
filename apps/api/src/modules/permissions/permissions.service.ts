// Permissões dinâmicas por usuário. SUPERADMIN não participa do cadastro — tem acesso total.

import { prisma } from '@addere/db'
import type { UserRole } from '@addere/types'

interface PermissionCacheEntry {
  keys: Set<string>
  expiresAt: number
}

// Cache em memória: userId → permissões efetivas + expiração (mesmo padrão do protheus.client.ts)
const permissionCache = new Map<string, PermissionCacheEntry>()
const CACHE_TTL_MS = 60 * 1000

export function invalidateUserPermissions(userId: string): void {
  permissionCache.delete(userId)
}

export async function listPermissionCatalog() {
  return prisma.permission.findMany({ orderBy: [{ category: 'asc' }, { label: 'asc' }] })
}

export async function getUserPermissionKeys(userId: string): Promise<string[]> {
  const rows = await prisma.userPermission.findMany({
    where: { userId },
    include: { permission: true },
  })
  return rows.map((row) => row.permission.key)
}

export async function setUserPermissions(userId: string, keys: string[]): Promise<void> {
  const permissions = await prisma.permission.findMany({ where: { key: { in: keys } } })

  await prisma.$transaction([
    prisma.userPermission.deleteMany({ where: { userId } }),
    prisma.userPermission.createMany({
      data: permissions.map((permission) => ({ userId, permissionId: permission.id })),
    }),
  ])

  invalidateUserPermissions(userId)
}

export async function copyUserPermissions(fromUserId: string, toUserId: string): Promise<void> {
  const keys = await getUserPermissionKeys(fromUserId)
  await setUserPermissions(toUserId, keys)
}

// Retorna o conjunto de permissões efetivas do usuário. SUPERADMIN recebe o catálogo completo.
export async function getEffectivePermissions(userId: string, role: UserRole): Promise<Set<string>> {
  if (role === 'SUPERADMIN') {
    const catalog = await listPermissionCatalog()
    return new Set(catalog.map((permission) => permission.key))
  }

  const cached = permissionCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) return cached.keys

  const keys = new Set(await getUserPermissionKeys(userId))
  permissionCache.set(userId, { keys, expiresAt: Date.now() + CACHE_TTL_MS })
  return keys
}
