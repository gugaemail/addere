import { FastifyRequest, FastifyReply } from 'fastify'

// Rate limit por usuário autenticado (fallback: IP), como preHandler.
//
// Não usa o config por rota do @fastify/rate-limit de propósito: aquele plugin
// roda no hook onRequest, ANTES do jwtVerify (que acontece no preHandler
// authenticate) — um keyGenerator por request.user.sub sempre cairia no IP.
// Como preHandler, este limiter compõe DEPOIS do authenticate e enxerga o sub.
//
// Janela fixa em memória por processo (mesma semântica do plugin sem Redis).

interface WindowEntry {
  count: number
  resetAt: number
}

const WINDOW_PATTERN = /^(\d+)\s*(second|minute|hour)s?$/

export function parseTimeWindow(window: string): number {
  const match = WINDOW_PATTERN.exec(window.trim())
  if (!match) throw new Error(`timeWindow inválido: "${window}"`)
  const value = Number(match[1])
  const unit = match[2]
  const ms = unit === 'second' ? 1_000 : unit === 'minute' ? 60_000 : 3_600_000
  return value * ms
}

/**
 * Cria um preHandler de rate limit: `userRateLimit(6, '1 minute')`.
 * Compor após `authenticate` para limitar por usuário; sem auth, limita por IP.
 */
export function userRateLimit(max: number, timeWindow: string) {
  const windowMs = parseTimeWindow(timeWindow)
  const buckets = new Map<string, WindowEntry>()

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const key = request.user?.sub ?? request.ip
    const now = Date.now()

    const entry = buckets.get(key)
    if (!entry || entry.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return
    }

    entry.count += 1
    if (entry.count > max) {
      const retryAfterS = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
      reply
        .status(429)
        .header('retry-after', String(retryAfterS))
        .send({ message: 'Muitas requisições. Aguarde um instante e tente novamente.' })
    }

    // Limpeza oportunista para o Map não crescer sem limite
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k)
    }
  }
}
