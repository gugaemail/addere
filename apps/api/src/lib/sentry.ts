// Observabilidade da API (E4): Sentry opcional via SENTRY_DSN.
// Sem DSN, tudo vira no-op — dev/test não dependem do pacote configurado.
import * as Sentry from '@sentry/node'
import { env } from './env'

let initialized = false

export function initSentry(): void {
  if (!env.SENTRY_DSN || initialized) return
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: 0, // só erros — jobs e LLM precisam de alerta, não de APM
  })
  initialized = true
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return
  Sentry.captureException(err, context ? { extra: context } : undefined)
}
