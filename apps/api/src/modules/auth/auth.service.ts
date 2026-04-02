import { prisma } from '@addere/db'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import type { LoginInput } from './auth.schema'

const REFRESH_TOKEN_EXPIRES_DAYS = 30

export async function loginUser(input: LoginInput) {
  // Busca usuário ativo pelo email
  const user = await prisma.user.findFirst({
    where: { email: input.email, active: true },
  })

  // Mensagem genérica para não vazar se o email existe ou não
  if (!user) throw new Error('Credenciais inválidas')

  const passwordValid = await bcrypt.compare(input.password, user.password)
  if (!passwordValid) throw new Error('Credenciais inválidas')

  return user
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS)

  await prisma.refreshToken.create({ data: { token, userId, expiresAt } })

  return token
}

export async function rotateRefreshToken(oldToken: string) {
  const existing = await prisma.refreshToken.findUnique({
    where: { token: oldToken },
    include: { user: true },
  })

  if (!existing || existing.expiresAt < new Date()) {
    throw new Error('Refresh token inválido ou expirado')
  }

  if (!existing.user.active) {
    throw new Error('Usuário inativo')
  }

  // Rotação: invalida o token antigo e emite um novo
  await prisma.refreshToken.delete({ where: { token: oldToken } })
  const newToken = await createRefreshToken(existing.userId)

  return { user: existing.user, newToken }
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token } })
}
