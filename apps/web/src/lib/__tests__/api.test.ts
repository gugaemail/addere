import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock do axios antes de importar api.ts
vi.mock('axios', () => {
  const mockAxios = {
    create: vi.fn(() => mockAxiosInstance),
    post: vi.fn(),
  }
  const mockAxiosInstance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    post: vi.fn(),
    get: vi.fn(),
  }
  return { default: mockAxios }
})

import { setAccessToken, clearAccessToken, getAccessToken } from '../api'

function getCookies(): Record<string, string> {
  return Object.fromEntries(
    document.cookie.split(';').map((c) => {
      const [k, v] = c.trim().split('=')
      return [k, v ?? '']
    }).filter(([k]) => k),
  )
}

function clearAllCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.trim().split('=')[0]
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`
  })
}

beforeEach(() => {
  clearAllCookies()
  // Limpa o token em memória
  clearAccessToken()
})

// ─── setAccessToken ──────────────────────────────────────────────────────────

describe('setAccessToken(token)', () => {
  it('armazena o token na memória (getAccessToken)', () => {
    setAccessToken('my-jwt-token')
    expect(getAccessToken()).toBe('my-jwt-token')
  })

  it('define addere_session=1 no cookie (indicador de sessão para o middleware)', () => {
    setAccessToken('my-jwt-token')
    expect(getCookies()['addere_session']).toBe('1')
  })

  it('define addere_token=<token> no cookie (para verificação de role no Edge middleware)', () => {
    setAccessToken('my-jwt-token')
    expect(getCookies()['addere_token']).toBe('my-jwt-token')
  })

  it('ambos os cookies são definidos juntos (F03: middleware pode verificar role)', () => {
    setAccessToken('abc.def.ghi')
    const cookies = getCookies()
    expect(cookies['addere_session']).toBe('1')
    expect(cookies['addere_token']).toBe('abc.def.ghi')
  })
})

// ─── clearAccessToken ────────────────────────────────────────────────────────

describe('clearAccessToken()', () => {
  it('remove o token da memória', () => {
    setAccessToken('my-jwt-token')
    clearAccessToken()
    expect(getAccessToken()).toBeNull()
  })

  it('expira o cookie addere_session', () => {
    setAccessToken('my-jwt-token')
    clearAccessToken()
    // Cookie expirado aparece como vazio ou ausente no document.cookie
    expect(getCookies()['addere_session']).toBeUndefined()
  })

  it('expira o cookie addere_token (F03: middleware não verifica role de sessão encerrada)', () => {
    setAccessToken('my-jwt-token')
    clearAccessToken()
    expect(getCookies()['addere_token']).toBeUndefined()
  })

  it('é idempotente: clearAccessToken sem token anterior não lança erro', () => {
    expect(() => clearAccessToken()).not.toThrow()
    expect(getAccessToken()).toBeNull()
  })
})

// ─── Ciclo completo: login → uso → logout ────────────────────────────────────

describe('Ciclo completo de sessão', () => {
  it('set → clear → set funciona corretamente', () => {
    setAccessToken('token-1')
    expect(getAccessToken()).toBe('token-1')

    clearAccessToken()
    expect(getAccessToken()).toBeNull()

    setAccessToken('token-2')
    expect(getAccessToken()).toBe('token-2')
    expect(getCookies()['addere_session']).toBe('1')
    expect(getCookies()['addere_token']).toBe('token-2')
  })
})
