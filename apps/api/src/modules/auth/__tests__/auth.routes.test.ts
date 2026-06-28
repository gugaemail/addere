import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import fastifyRateLimit from '@fastify/rate-limit'
import authRoutes from '../auth.routes'

// Mocks de serviço
vi.mock('../auth.service', () => ({
  loginUser: vi.fn(),
  createRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}))

vi.mock('../../permissions/permissions.service', () => ({
  getEffectivePermissions: vi.fn().mockResolvedValue(new Set(['users.view'])),
}))

vi.mock('@addere/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}))

import {
  loginUser,
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../auth.service'

const mockLogin = loginUser as ReturnType<typeof vi.fn>
const mockCreateRefresh = createRefreshToken as ReturnType<typeof vi.fn>
const mockRotate = rotateRefreshToken as ReturnType<typeof vi.fn>
const mockRevoke = revokeRefreshToken as ReturnType<typeof vi.fn>

const JWT_SECRET = 'test-secret-for-unit-tests'

async function buildApp() {
  const app = Fastify({ logger: false })

  await app.register(fastifyCookie, { secret: 'cookie-signing-secret' })
  await app.register(fastifyRateLimit, { global: false })
  await app.register(fastifyJwt, { secret: JWT_SECRET, sign: { expiresIn: '8h' } })

  await app.register(authRoutes, { prefix: '/auth' })

  await app.ready()
  return app
}

function signToken(payload: object, secret = JWT_SECRET) {
  // Gera token manualmente para testes usando o app
  return null // será obtido via login no teste
}

let app: Awaited<ReturnType<typeof buildApp>>

beforeAll(async () => {
  app = await buildApp()
})

beforeEach(() => vi.clearAllMocks())

afterAll(async () => {
  await app.close()
})

const validUser = {
  id: 'user-1',
  email: 'admin@addere.com.br',
  name: 'Admin',
  role: 'SUPERADMIN',
  companyId: null,
  createdAt: new Date().toISOString(),
}

// ─── POST /auth/login ────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  it('retorna 200 com accessToken e user quando credenciais são válidas', async () => {
    mockLogin.mockResolvedValue(validUser)
    mockCreateRefresh.mockResolvedValue('refresh-token-uuid')

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@addere.com.br', password: 'ValidPass1!' },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.accessToken).toBeDefined()
    expect(body.user.id).toBe('user-1')
    expect(body.user.email).toBe('admin@addere.com.br')
    // Senha nunca deve aparecer na resposta
    expect(body.user.password).toBeUndefined()
  })

  it('retorna 401 quando as credenciais são inválidas', async () => {
    mockLogin.mockRejectedValue(new Error('Credenciais inválidas'))

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      // Senha com ≥8 chars passa a validação Zod; o erro vem da camada de serviço
      payload: { email: 'admin@addere.com.br', password: 'SenhaErrada1' },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().message).toBe('Credenciais inválidas')
  })

  it('retorna 400 quando o body está malformado (email inválido)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'not-an-email', password: 'pass' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('retorna 400 quando os campos estão ausentes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {},
    })

    expect(res.statusCode).toBe(400)
  })
})

// ─── POST /auth/refresh ──────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  it('retorna 200 e rotaciona o token quando o body token é válido (fluxo mobile)', async () => {
    mockRotate.mockResolvedValue({
      user: validUser,
      newToken: 'new-refresh-uuid',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'old-refresh-uuid' },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().accessToken).toBeDefined()
    expect(res.json().refreshToken).toBe('new-refresh-uuid')
  })

  it('retorna 403 quando o token vem do cookie mas X-Requested-With está ausente (CSRF)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refreshToken: 'some-token' },
      // Sem X-Requested-With — simula form submission cross-site
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().message).toContain('CSRF')
  })

  it('retorna 200 quando o token vem do cookie COM X-Requested-With correto (fluxo web)', async () => {
    mockRotate.mockResolvedValue({
      user: validUser,
      newToken: 'new-refresh-uuid',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { refreshToken: 'valid-token' },
      headers: { 'x-requested-with': 'XMLHttpRequest' },
    })

    expect(res.statusCode).toBe(200)
  })

  it('retorna 401 quando o refresh token está expirado', async () => {
    mockRotate.mockRejectedValue(new Error('Refresh token inválido ou expirado'))

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'expired-token' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('retorna 401 quando nenhum token é fornecido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: {},
    })

    expect(res.statusCode).toBe(401)
  })
})

// ─── GET /auth/me ────────────────────────────────────────────────────────────

describe('GET /auth/me', () => {
  it('retorna 401 sem token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
    })

    expect(res.statusCode).toBe(401)
  })

  it('retorna 401 com token malformado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: 'Bearer token-invalido-nao-e-jwt' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('retorna 401 com token assinado com secret errado', async () => {
    const wrongApp = Fastify({ logger: false })
    await wrongApp.register(fastifyJwt, { secret: 'outro-secret', sign: { expiresIn: '8h' } })
    const fakeToken = wrongApp.jwt.sign({ sub: 'user-1', role: 'SUPERADMIN' })
    await wrongApp.close()

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { Authorization: `Bearer ${fakeToken}` },
    })

    expect(res.statusCode).toBe(401)
  })
})

// ─── POST /auth/logout ───────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('retorna 200 e revoga o token do cookie', async () => {
    mockRevoke.mockResolvedValue(undefined)

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      cookies: { refreshToken: 'some-token' },
    })

    expect(res.statusCode).toBe(200)
    expect(mockRevoke).toHaveBeenCalledWith('some-token')
  })

  it('retorna 200 mesmo sem token (logout idempotente)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
    })

    expect(res.statusCode).toBe(200)
    expect(mockRevoke).not.toHaveBeenCalled()
  })
})
