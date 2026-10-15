// POST /auth/forgot-password: e-mail não cadastrado continua respondendo
// sucesso (não revela quem existe), mas a falha de envio chega a quem pediu,
// com o caminho do suporte.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

vi.mock('../auth.service', () => ({
  loginUser: vi.fn(),
  createRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
  revokeRefreshToken: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
}))

vi.mock('../../permissions/permissions.service', () => ({
  getEffectivePermissions: vi.fn(async () => []),
}))

import { resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'
import { badGateway } from '../../../lib/errors'
import { forgotPassword } from '../auth.service'
import { RESET_EMAIL_FAILED_MESSAGE } from '../auth.schema'

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
  vi.mocked(forgotPassword).mockReset()
})

const ask = () =>
  app.inject({
    method: 'POST',
    url: '/auth/forgot-password',
    payload: { email: 'ana@cliente.test' },
  })

describe('POST /auth/forgot-password', () => {
  it('envio ok (ou e-mail não cadastrado): 200 com a mensagem genérica', async () => {
    vi.mocked(forgotPassword).mockResolvedValue(undefined)

    const res = await ask()

    expect(res.statusCode).toBe(200)
    expect(res.json().message).toContain('Se o e-mail estiver cadastrado')
  })

  it('falha de envio: 502 com o caminho do suporte', async () => {
    vi.mocked(forgotPassword).mockRejectedValue(badGateway(RESET_EMAIL_FAILED_MESSAGE))

    const res = await ask()

    expect(res.statusCode).toBe(502)
    expect(res.json().message).toBe(RESET_EMAIL_FAILED_MESSAGE)
  })

  it('erro inesperado: 500, também com o caminho do suporte', async () => {
    vi.mocked(forgotPassword).mockRejectedValue(new Error('banco fora do ar'))

    const res = await ask()

    expect(res.statusCode).toBe(500)
    expect(res.json().message).toBe(RESET_EMAIL_FAILED_MESSAGE)
  })
})
