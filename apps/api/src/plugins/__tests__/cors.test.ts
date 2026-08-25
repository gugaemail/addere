// O painel manda X-Requested-With no POST /auth/refresh (guarda de CSRF do
// fluxo de cookie). Se o CORS não liberar esse header, o navegador barra o
// preflight e o refresh silencioso morre — o admin é deslogado quando o access
// token expira. Em produção passou despercebido porque a main é anterior ao
// PR que introduziu o header no web.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../test-utils/prisma-mock')).mockDb())

import corsPlugin from '../cors'

let app: FastifyInstance

beforeAll(async () => {
  app = Fastify()
  await app.register(corsPlugin)
  app.post('/auth/refresh', async () => ({ ok: true }))
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

const preflight = (headers: string) =>
  app.inject({
    method: 'OPTIONS',
    url: '/auth/refresh',
    headers: {
      origin: 'https://addere.com.br',
      'access-control-request-method': 'POST',
      'access-control-request-headers': headers,
    },
  })

describe('CORS', () => {
  it('libera X-Requested-With no preflight do refresh', async () => {
    const res = await preflight('content-type,x-requested-with')

    expect(res.statusCode).toBe(204)
    expect(res.headers['access-control-allow-headers']).toMatch(/X-Requested-With/i)
  })

  it('mantém Content-Type e Authorization', async () => {
    const allowed = (await preflight('content-type')).headers['access-control-allow-headers']

    expect(allowed).toMatch(/Content-Type/i)
    expect(allowed).toMatch(/Authorization/i)
  })

  it('responde com credentials para o fluxo de cookie', async () => {
    const res = await preflight('content-type,x-requested-with')
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })
})
