import { prisma } from '@addere/db'
import bcrypt from 'bcryptjs'
import type { JwtPayload } from '@addere/types'
import type { CreateUserInput } from './users.schema'
import { copyUserPermissions } from '../permissions/permissions.service'

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  userTypeId: true,
  createdAt: true,
} as const

// SUPERADMIN enxerga todos os usuários; demais roles apenas os da própria empresa
export async function listUsers(requester: JwtPayload) {
  const where = requester.role === 'SUPERADMIN' ? {} : { companyId: requester.companyId }
  return prisma.user.findMany({
    where,
    select: userSelect,
    orderBy: { createdAt: 'desc' },
  })
}

export async function createUser(input: CreateUserInput, requester: JwtPayload) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new Error('Email já cadastrado')

  const hashedPassword = await bcrypt.hash(input.password, 10)

  // Usuário criado por ADMIN nasce vinculado à empresa do criador;
  // SUPERADMIN pode indicar a empresa (ou criar usuário global sem empresa)
  const companyId =
    requester.role === 'SUPERADMIN' ? (input.companyId ?? null) : requester.companyId

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: hashedPassword,
      role: input.role,
      userTypeId: input.userTypeId,
      companyId,
    },
    select: userSelect,
  })

  // Sem origem informada, o usuário nasce sem nenhuma permissão marcada
  if (input.copyPermissionsFromUserId) {
    await copyUserPermissions(input.copyPermissionsFromUserId, user.id)
  }

  return user
}

export async function toggleUserActive(id: string, requester: JwtPayload) {
  const where =
    requester.role === 'SUPERADMIN' ? { id } : { id, companyId: requester.companyId }
  const user = await prisma.user.findFirst({ where })
  if (!user) throw new Error('Usuário não encontrado')

  // Ao desativar, invalida todas as sessões ativas
  if (user.active) {
    await prisma.refreshToken.deleteMany({ where: { userId: id } })
  }

  return prisma.user.update({
    where: { id },
    data: { active: !user.active },
    select: userSelect,
  })
}
