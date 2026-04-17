import { prisma } from '@addere/db'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import type { LoginInput } from './auth.schema'

const REFRESH_TOKEN_EXPIRES_DAYS = 30

// Hash dummy para equalizar timing quando o email não existe (previne enumeração por timing)
const DUMMY_HASH = '$2b$12$X4kv7j5ZcGaB3dcBp3rlsOBWRPqhf3IkHGBuPtXOt0OjbhAVJBXkW'

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findFirst({
    where: { email: input.email, active: true },
  })

  // Executa bcrypt mesmo quando o usuário não existe para equalizar o tempo de resposta
  const passwordToCompare = user?.password ?? DUMMY_HASH
  const passwordValid = await bcrypt.compare(input.password, passwordToCompare)

  if (!user || !passwordValid) throw new Error('Credenciais inválidas')

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

  // Rotação atômica: invalida o token antigo e emite um novo na mesma transação
  const newTokenValue = randomUUID()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS)

  await prisma.$transaction([
    prisma.refreshToken.delete({ where: { token: oldToken } }),
    prisma.refreshToken.create({ data: { token: newTokenValue, userId: existing.userId, expiresAt } }),
  ])

  const newToken = newTokenValue

  return { user: existing.user, newToken }
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token } })
}
