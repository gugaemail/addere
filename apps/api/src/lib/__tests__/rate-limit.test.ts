import { describe, it, expect, vi, afterEach } from 'vitest'
import type { FastifyRequest, FastifyReply } from 'fastify'
import { parseTimeWindow, userRateLimit } from '../rate-limit'

function fakeReply() {
  const reply = {
    statusCode: 0,
    sent: false,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    header() {
      return this
    },
    send(payload: unknown) {
      this.sent = true
      this.body = payload
      return this
    },
  }
  return reply as unknown as FastifyReply & { statusCode: number; sent: boolean }
}

const req = (sub: string | undefined, ip = '1.2.3.4') =>
  ({ user: sub ? { sub } : undefined, ip }) as unknown as FastifyRequest

describe('parseTimeWindow', () => {
  it('converte janelas válidas para ms', () => {
    expect(parseTimeWindow('1 second')).toBe(1_000)
    expect(parseTimeWindow('30 seconds')).toBe(30_000)
    expect(parseTimeWindow('1 minute')).toBe(60_000)
    expect(parseTimeWindow('2 hours')).toBe(7_200_000)
  })

  it('rejeita janela inválida', () => {
    expect(() => parseTimeWindow('logo ali')).toThrow(/inválido/)
  })
})

describe('userRateLimit', () => {
  afterEach(() => vi.useRealTimers())

  it('limita por usuário e responde 429 acima do teto', async () => {
    const limiter = userRateLimit(2, '1 minute')
    const r1 = fakeReply()
    await limiter(req('user-a'), r1)
    await limiter(req('user-a'), r1)
    expect(r1.sent).toBe(false)

    const r2 = fakeReply()
    await limiter(req('user-a'), r2)
    expect(r2.statusCode).toBe(429)

    // Outro usuário não é afetado
    const r3 = fakeReply()
    await limiter(req('user-b'), r3)
    expect(r3.sent).toBe(false)
  })

  it('cai para o IP sem usuário autenticado', async () => {
    const limiter = userRateLimit(1, '1 minute')
    const ok = fakeReply()
    await limiter(req(undefined, '9.9.9.9'), ok)
    expect(ok.sent).toBe(false)
    const blocked = fakeReply()
    await limiter(req(undefined, '9.9.9.9'), blocked)
    expect(blocked.statusCode).toBe(429)
  })

  it('reseta a janela após o tempo', async () => {
    vi.useFakeTimers()
    const limiter = userRateLimit(1, '1 minute')
    await limiter(req('user-c'), fakeReply())
    const blocked = fakeReply()
    await limiter(req('user-c'), blocked)
    expect(blocked.statusCode).toBe(429)

    vi.advanceTimersByTime(61_000)
    const after = fakeReply()
    await limiter(req('user-c'), after)
    expect(after.sent).toBe(false)
  })
})
