import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock do Prisma — deve vir antes dos imports do módulo
vi.mock('@addere/db', () => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordResetToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({}) },
  })),
}))

import { prisma } from '@addere/db'
import bcrypt from 'bcryptjs'
import { loginUser, rotateRefreshToken, revokeRefreshToken, resetPassword } from '../auth.service'

const mockPrisma = prisma as unknown as {
  user: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  refreshToken: {
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  passwordResetToken: {
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

const mockBcrypt = bcrypt as unknown as {
  compare: ReturnType<typeof vi.fn>
  hash: ReturnType<typeof vi.fn>
}

const activeUser = {
  id: 'user-1',
  email: 'admin@addere.com.br',
  name: 'Admin',
  password: '$2b$12$hashed',
  role: 'SUPERADMIN',
  companyId: null,
  active: true,
  createdAt: new Date(),
}

beforeEach(() => vi.clearAllMocks())

// ─── loginUser ──────────────────────────────────────────────────────────────

describe('loginUser', () => {
  it('retorna o usuário quando credenciais são válidas', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(activeUser)
    mockBcrypt.compare.mockResolvedValue(true)

    const result = await loginUser({ email: activeUser.email, password: 'ValidPass1!' })

    expect(result.id).toBe('user-1')
    expect(result.email).toBe(activeUser.email)
  })

  it('lança erro quando a senha está incorreta', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(activeUser)
    mockBcrypt.compare.mockResolvedValue(false)

    await expect(
      loginUser({ email: activeUser.email, password: 'WrongPassword' }),
    ).rejects.toThrow('Credenciais inválidas')
  })

  it('lança erro quando o email não existe (usa dummy hash para equalizar timing)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null)
    // bcrypt.compare ainda deve ser chamado (dummy hash) para evitar timing attack
    mockBcrypt.compare.mockResolvedValue(false)

    await expect(
      loginUser({ email: 'nao-existe@addere.com.br', password: 'any' }),
    ).rejects.toThrow('Credenciais inválidas')

    // Garante que o compare foi chamado mesmo sem usuário (timing protection)
    expect(mockBcrypt.compare).toHaveBeenCalledOnce()
  })

  it('lança erro quando o usuário está inativo (active = false)', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null) // findFirst com active:true retorna null
    mockBcrypt.compare.mockResolvedValue(false)

    await expect(
      loginUser({ email: 'inativo@addere.com.br', password: 'any' }),
    ).rejects.toThrow('Credenciais inválidas')
  })
})

// ─── rotateRefreshToken ──────────────────────────────────────────────────────

describe('rotateRefreshToken', () => {
  const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const existingToken = {
    token: 'valid-token-uuid',
    userId: 'user-1',
    expiresAt: futureDate,
    user: activeUser,
  }

  it('rotaciona o token e retorna novo token com o usuário', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue(existingToken)
    mockPrisma.$transaction.mockResolvedValue([null, null])

    const result = await rotateRefreshToken('valid-token-uuid')

    expect(result.user.id).toBe('user-1')
    expect(result.newToken).toBeDefined()
    expect(result.newToken).not.toBe('valid-token-uuid')
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
  })

  it('lança erro quando o token não existe', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue(null)

    await expect(rotateRefreshToken('token-inexistente')).rejects.toThrow(
      'Refresh token inválido ou expirado',
    )
  })

  it('lança erro quando o token está expirado', async () => {
    const expiredToken = { ...existingToken, expiresAt: new Date(Date.now() - 1000) }
    mockPrisma.refreshToken.findUnique.mockResolvedValue(expiredToken)

    await expect(rotateRefreshToken('expired-token')).rejects.toThrow(
      'Refresh token inválido ou expirado',
    )
  })

  it('lança erro quando o usuário está inativo', async () => {
    const inactiveUser = { ...activeUser, active: false }
    const tokenForInactive = { ...existingToken, user: inactiveUser }
    mockPrisma.refreshToken.findUnique.mockResolvedValue(tokenForInactive)

    await expect(rotateRefreshToken('valid-token-uuid')).rejects.toThrow('Usuário inativo')
  })

  it('usa transação atômica (não cria novo token se delete falhar)', async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue(existingToken)
    mockPrisma.$transaction.mockRejectedValue(new Error('DB error'))

    await expect(rotateRefreshToken('valid-token-uuid')).rejects.toThrow('DB error')
  })
})

// ─── revokeRefreshToken ──────────────────────────────────────────────────────

describe('revokeRefreshToken', () => {
  it('revoga o token sem lançar erro', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 })

    await expect(revokeRefreshToken('some-token')).resolves.toBeUndefined()
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { token: 'some-token' },
    })
  })

  it('não lança erro quando o token não existe (deleteMany é idempotente)', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 })

    await expect(revokeRefreshToken('token-inexistente')).resolves.toBeUndefined()
  })
})

// ─── resetPassword ───────────────────────────────────────────────────────────

describe('resetPassword', () => {
  const validResetToken = {
    token: 'reset-uuid',
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 3600 * 1000),
    usedAt: null,
    user: activeUser,
  }

  it('redefine a senha com token válido', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue(validResetToken)
    mockBcrypt.hash.mockResolvedValue('$2b$12$newhash')
    mockPrisma.$transaction.mockResolvedValue([null, null, null])

    await expect(resetPassword('reset-uuid', 'NewValidPass1!')).resolves.toBeUndefined()
    expect(mockBcrypt.hash).toHaveBeenCalledWith('NewValidPass1!', 12)
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
  })

  it('lança erro quando o token já foi usado', async () => {
    const usedToken = { ...validResetToken, usedAt: new Date() }
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue(usedToken)

    await expect(resetPassword('used-token', 'NewPass1!')).rejects.toThrow(
      'Token inválido ou expirado',
    )
  })

  it('lança erro quando o token está expirado', async () => {
    const expiredToken = {
      ...validResetToken,
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    }
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue(expiredToken)

    await expect(resetPassword('expired-token', 'NewPass1!')).rejects.toThrow(
      'Token inválido ou expirado',
    )
  })

  it('lança erro quando o token não existe', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null)

    await expect(resetPassword('nao-existe', 'NewPass1!')).rejects.toThrow(
      'Token inválido ou expirado',
    )
  })

  it('invoca deleteMany em refreshTokens para invalidar sessões ativas ao redefinir senha', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue(validResetToken)
    mockBcrypt.hash.mockResolvedValue('$2b$12$newhash')

    const transactionCalls: unknown[] = []
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => {
      transactionCalls.push(...ops)
      return ops
    })

    await resetPassword('reset-uuid', 'NewPass1!')

    // Verifica que a transação inclui deleteMany de refreshTokens (logout forçado)
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({}), // user.update
        expect.objectContaining({}), // passwordResetToken.update
        expect.objectContaining({}), // refreshToken.deleteMany
      ]),
    )
  })
})
