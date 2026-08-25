// POST /auth/refresh: a checagem de CSRF vale para o fluxo de cookie (web).
// O app RN guarda o cookie de sessão e o reenvia junto com o refresh token no
// corpo — dar prioridade ao cookie fazia o refresh do app cair em 403 e, na
// hidratação do boot, derrubar a sessão do vendedor a cada abertura.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

vi.mock('../auth.service', () => ({
  loginUser: vi.fn(),
  createRefreshToken: vi.fn(async () => 'novo-refresh-token'),
  rotateRefreshToken: vi.fn(async (token: string) => {
    if (token !== TOKEN_VALIDO) throw new Error('Refresh token inválido ou expirado')
    return {
      user: {
        id: 'user-1',
        email: 'vendedor@addere.test',
        role: 'SALESPERSON',
        companyId: 'company-1',
      },
      newToken: 'novo-refresh-token',
    }
  }),
  revokeRefreshToken: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}))

vi.mock('../../permissions/permissions.service', () => ({
  getEffectivePermissions: vi.fn(async () => []),
}))

import { resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'

const TOKEN_VALIDO = 'refresh-valido'
const COOKIE = `refreshToken=${TOKEN_VALIDO}`

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
})

const refresh = (opts: { cookie?: boolean; body?: object; xhr?: boolean }) =>
  app.inject({
    method: 'POST',
    url: '/auth/refresh',
    headers: {
      ...(opts.cookie ? { cookie: COOKIE } : {}),
      ...(opts.xhr ? { 'x-requested-with': 'XMLHttpRequest' } : {}),
    },
    payload: opts.body ?? {},
  })

describe('POST /auth/refresh — CSRF', () => {
  it('aceita o token do corpo mesmo com o cookie presente e sem o header (app RN)', async () => {
    const res = await refresh({ cookie: true, body: { refreshToken: TOKEN_VALIDO } })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ accessToken: expect.any(String) })
  })

  it('aceita o token do corpo sem cookie e sem o header', async () => {
    const res = await refresh({ body: { refreshToken: TOKEN_VALIDO } })
    expect(res.statusCode).toBe(200)
  })

  it('recusa o fluxo de cookie sem o header customizado', async () => {
    const res = await refresh({ cookie: true })

    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ message: 'CSRF check falhou' })
  })

  it('aceita o fluxo de cookie com o header customizado (web)', async () => {
    const res = await refresh({ cookie: true, xhr: true })
    expect(res.statusCode).toBe(200)
  })

  it('devolve 401 quando não há token em lugar nenhum', async () => {
    const res = await refresh({})

    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ message: 'Refresh token ausente' })
  })

  it('devolve 401 quando o refresh token não vale mais', async () => {
    const res = await refresh({ body: { refreshToken: 'expirado' } })
    expect(res.statusCode).toBe(401)
  })
})
