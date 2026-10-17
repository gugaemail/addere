// Login, refresh e logout nunca são bloqueados (plano 017, decisão 2): os dois
// clientes tratam qualquer erro do refresh como sessão morta, e um 403 aqui
// deslogaria em loop. Nenhuma das três rotas passa pelo authenticate nem
// consulta a empresa.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

const USER = {
  id: 'user-1',
  name: 'Vendedor Exemplo',
  email: 'vendedor@addere.test',
  role: 'SALESPERSON',
  companyId: 'company-1',
  createdAt: new Date('2026-01-01T12:00:00Z'),
}

vi.mock('../auth.service', () => ({
  loginUser: vi.fn(async () => USER),
  createRefreshToken: vi.fn(async () => 'novo-refresh-token'),
  rotateRefreshToken: vi.fn(async () => ({ user: USER, newToken: 'novo-refresh-token' })),
  revokeRefreshToken: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}))

vi.mock('../../permissions/permissions.service', () => ({
  getEffectivePermissions: vi.fn(async () => new Set<string>()),
}))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  // Se alguma das três rotas consultasse o usuário, encontraria a empresa bloqueada
  prismaMock.user.findUnique.mockResolvedValue({
    active: true,
    company: {
      active: true,
      accessBlockedAt: new Date('2026-10-25T12:00:00Z'),
      accessBlockReason: 'OVERDUE',
    },
  })
})

describe('empresa bloqueada: login, refresh e logout continuam funcionando', () => {
  it('POST /auth/login → 200, sem consultar a empresa', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'vendedor@addere.test', password: 'senha-de-teste' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ accessToken: expect.any(String) })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('POST /auth/refresh (token no corpo) → 200, sem consultar a empresa', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'refresh-valido' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ accessToken: expect.any(String) })
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('POST /auth/logout → 200, sem consultar a empresa', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: 'refreshToken=refresh-valido' },
    })
    expect(res.statusCode).toBe(200)
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })
})
