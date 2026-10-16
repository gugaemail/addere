// IP real atrás do proxy (plano 014, decisão de desenho 2): o Fastify confia só
// no salto do proxy do Render (TRUST_PROXY_HOPS=1, o padrão). A entrada que o
// cliente escreve à esquerda do X-Forwarded-For é ignorada, e cada cliente
// passa a ter o próprio balde no rate limit do login.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../test-utils/prisma-mock')).mockDb())

import { resetPrismaMock } from '../../test-utils/prisma-mock'
import { buildApp } from '../../app'

let app: FastifyInstance

beforeAll(async () => {
  app = await buildApp()
  // Rota só do teste, registrada antes do ready()
  app.get('/__test/ip', async (request) => ({ ip: request.ip }))
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
})

async function ipFor(headers: Record<string, string> = {}): Promise<string> {
  const res = await app.inject({ method: 'GET', url: '/__test/ip', headers })
  expect(res.statusCode).toBe(200)
  return res.json().ip
}

describe('request.ip com trustProxy por saltos', () => {
  it('sem X-Forwarded-For → o IP do socket', async () => {
    expect(await ipFor()).toBe('127.0.0.1')
  })

  it('com o proxy na frente → o IP que o proxy acrescentou', async () => {
    expect(await ipFor({ 'x-forwarded-for': '203.0.113.9' })).toBe('203.0.113.9')
  })

  it('a entrada que o cliente forjou à esquerda é ignorada', async () => {
    expect(await ipFor({ 'x-forwarded-for': '198.51.100.20, 203.0.113.9' })).toBe('203.0.113.9')
  })
})

describe('rate limit do login por cliente', () => {
  const login = (ip: string) =>
    app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'x-forwarded-for': ip },
      payload: {},
    })

  it('o 11º login do mesmo IP é barrado; outro IP não divide o balde', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await login('203.0.113.50')
      expect([400, 401]).toContain(res.statusCode)
    }
    const blocked = await login('203.0.113.50')
    // 429 com a mensagem da rota (antes saía 500 "Erro interno")
    expect(blocked.statusCode).toBe(429)
    expect(blocked.json().message).toMatch(/^Muitas tentativas/)
    expect((await login('203.0.113.51')).statusCode).not.toBe(429)
  })
})
