import { prisma } from '@addere/db'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { Resend } from 'resend'
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

const WEB_URL = process.env.WEB_URL ?? 'https://addere-web.vercel.app'
const RESET_TOKEN_EXPIRES_HOURS = 1

export async function forgotPassword(email: string): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email, active: true } })
  if (!user) return // não revelar se email existe

  const token = randomUUID()
  const expiresAt = new Date()
  expiresAt.setHours(expiresAt.getHours() + RESET_TOKEN_EXPIRES_HOURS)

  await prisma.passwordResetToken.create({ data: { token, userId: user.id, expiresAt } })

  if (!process.env.RESEND_API_KEY) {
    console.warn('[auth] RESEND_API_KEY não configurada — email de reset não enviado')
    return
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const resetLink = `${WEB_URL}/resetar-senha?token=${token}`

  await resend.emails.send({
    from: 'Addere <noreply@addere.com.br>',
    to: [user.email],
    subject: 'Redefinição de senha — Addere',
    html: `
      <p>Olá, ${user.name}.</p>
      <p>Recebemos uma solicitação para redefinir sua senha no Addere.</p>
      <p><a href="${resetLink}" style="background:#1B4FA8;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Redefinir senha</a></p>
      <p>O link expira em ${RESET_TOKEN_EXPIRES_HOURS} hora. Se não foi você, ignore este e-mail.</p>
    `,
  })
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  })

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    throw new Error('Token inválido ou expirado')
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12)

  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { password: hashedPassword } }),
    prisma.passwordResetToken.update({ where: { token }, data: { usedAt: new Date() } }),
    prisma.refreshToken.deleteMany({ where: { userId: resetToken.userId } }),
  ])
}
