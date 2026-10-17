// Empresa suspensa (plano 017): o app reconhece o 403 COMPANY_BLOCKED e o
// interceptor o trata ANTES do ramo do 401 — sem refresh e sem logout.
// O axios real não carrega no jest-expo (ver api.test.ts): o mock guarda os
// handlers dos interceptors para o teste chamar o de erro direto.
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    create: (config: Record<string, unknown>) => ({
      defaults: config,
      interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
    }),
    get: jest.fn(),
    post: jest.fn(),
  },
}))
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
)
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}))
jest.mock('../../config/env', () => ({ env: { apiUrl: 'http://api.test' } }))
jest.mock('../../services/sentryContext', () => ({
  setSentryUser: jest.fn(),
  clearSentryUser: jest.fn(),
}))

import { isCompanyBlockedError } from '@addere/types'
import { api } from '../api'
import { useAuthStore } from '../../store/auth.store'

const BLOCKED = {
  config: { url: '/customers', headers: {} },
  response: { status: 403, data: { code: 'COMPANY_BLOCKED', reason: 'OVERDUE' } },
}

describe('isCompanyBlockedError', () => {
  it('403 com o código COMPANY_BLOCKED → true', () => {
    expect(isCompanyBlockedError(BLOCKED)).toBe(true)
  })

  it('403 sem o código, 401 e erro sem resposta → false', () => {
    expect(isCompanyBlockedError({ response: { status: 403, data: { message: 'x' } } })).toBe(false)
    expect(
      isCompanyBlockedError({ response: { status: 401, data: { code: 'COMPANY_BLOCKED' } } })
    ).toBe(false)
    expect(isCompanyBlockedError(new Error('Network Error'))).toBe(false)
    expect(isCompanyBlockedError(null)).toBe(false)
    expect(isCompanyBlockedError(undefined)).toBe(false)
  })
})

describe('interceptor de resposta', () => {
  const onError = () =>
    (api.interceptors.response.use as jest.Mock).mock.calls[0][1] as (e: unknown) => Promise<never>

  it('403 COMPANY_BLOCKED: marca a empresa suspensa, rejeita e não tenta refresh nem logout', async () => {
    const refreshSession = jest.fn()
    const clearAuth = jest.fn()
    useAuthStore.setState({
      user: { id: 'u1' } as never,
      accessToken: 'token',
      companyBlocked: false,
      refreshSession,
      clearAuth,
    })

    await expect(onError()(BLOCKED)).rejects.toBe(BLOCKED)

    expect(useAuthStore.getState().companyBlocked).toBe(true)
    expect(refreshSession).not.toHaveBeenCalled()
    expect(clearAuth).not.toHaveBeenCalled()
    expect(useAuthStore.getState().accessToken).toBe('token')
  })

  it('outro 403 segue o caminho de antes: rejeita sem marcar nada', async () => {
    useAuthStore.setState({ user: { id: 'u1' } as never, companyBlocked: false })
    const forbidden = {
      config: { url: '/users', headers: {} },
      response: { status: 403, data: { message: 'Permissão insuficiente' } },
    }
    await expect(onError()(forbidden)).rejects.toBe(forbidden)
    expect(useAuthStore.getState().companyBlocked).toBe(false)
  })
})
