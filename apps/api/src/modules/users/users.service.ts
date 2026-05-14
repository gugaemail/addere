import { prisma } from '@addere/db'
import bcrypt from 'bcryptjs'
import type { CreateUserInput } from './users.schema'

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} as const

export async function listUsers() {
  return prisma.user.findMany({
    select: userSelect,
    orderBy: { createdAt: 'desc' },
  })
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) throw new Error('Email já cadastrado')

  const hashedPassword = await bcrypt.hash(input.password, 10)

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      password: hashedPassword,
      role: input.role,
    },
    select: userSelect,
  })
}

export async function toggleUserActive(id: string) {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw new Error('Usuário não encontrado')

  return prisma.user.update({
    where: { id },
    data: { active: !user.active },
    select: userSelect,
  })
}
