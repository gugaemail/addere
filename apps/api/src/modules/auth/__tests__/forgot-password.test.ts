// Redefinição de senha: a falha de envio do Resend não pode passar calada.
// O resend 4.x devolve { data, error } e não lança quando a API recusa o envio;
// antes, o app dizia "E-mail enviado!" e o e-mail nunca chegava.
import { describe, it, expect, beforeEach, vi } from 'vitest'

const { sendMock, envMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  envMock: {
    RESEND_API_KEY: 're_test' as string | undefined,
    NODE_ENV: 'production',
    WEB_URL: 'https://painel.test',
  },
}))

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  },
}))
vi.mock('../../../lib/env', () => ({ env: envMock }))
vi.mock('../../../lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { AppError } from '../../../lib/errors'
import { forgotPassword } from '../auth.service'
import { RESET_EMAIL_FAILED_MESSAGE } from '../auth.schema'

const USER = { id: 'user-1', email: 'ana@cliente.test', name: 'Ana' }

async function failureOf(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e
  )
  expect(err).toBeInstanceOf(AppError)
  return err as AppError
}

beforeEach(() => {
  resetPrismaMock()
  sendMock.mockReset()
  envMock.RESEND_API_KEY = 're_test'
  envMock.NODE_ENV = 'production'
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('forgotPassword', () => {
  it('e-mail não cadastrado: responde sucesso sem enviar nada', async () => {
    await expect(forgotPassword('ninguem@cliente.test')).resolves.toBeUndefined()
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('envio aceito: resolve e mantém o token', async () => {
    prismaMock.user.findFirst.mockResolvedValue(USER)
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null })

    await expect(forgotPassword(USER.email)).resolves.toBeUndefined()
    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(prismaMock.passwordResetToken.delete).not.toHaveBeenCalled()
  })

  it('Resend recusa o envio ({ error }): 502 com o caminho do suporte e o token apagado', async () => {
    prismaMock.user.findFirst.mockResolvedValue(USER)
    sendMock.mockResolvedValue({
      data: null,
      error: { name: 'validation_error', message: 'domain not verified' },
    })

    const err = await failureOf(forgotPassword(USER.email))
    expect(err.statusCode).toBe(502)
    expect(err.message).toBe(RESET_EMAIL_FAILED_MESSAGE)
    expect(err.message).toContain('suporte@addere.com.br')
    expect(prismaMock.passwordResetToken.delete).toHaveBeenCalledTimes(1)
  })

  it('Resend lança (rede): mesma resposta', async () => {
    prismaMock.user.findFirst.mockResolvedValue(USER)
    sendMock.mockRejectedValue(new Error('fetch failed'))

    const err = await failureOf(forgotPassword(USER.email))
    expect(err.statusCode).toBe(502)
    expect(err.message).toBe(RESET_EMAIL_FAILED_MESSAGE)
  })

  it('sem RESEND_API_KEY em produção: é falha de envio', async () => {
    prismaMock.user.findFirst.mockResolvedValue(USER)
    envMock.RESEND_API_KEY = undefined

    const err = await failureOf(forgotPassword(USER.email))
    expect(err.statusCode).toBe(502)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('sem RESEND_API_KEY fora de produção: só avisa no log', async () => {
    prismaMock.user.findFirst.mockResolvedValue(USER)
    envMock.RESEND_API_KEY = undefined
    envMock.NODE_ENV = 'development'

    await expect(forgotPassword(USER.email)).resolves.toBeUndefined()
    expect(sendMock).not.toHaveBeenCalled()
  })
})
