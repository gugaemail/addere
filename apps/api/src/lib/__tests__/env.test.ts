import { describe, expect, it } from 'vitest'
import { parseEnv, withoutEmptyValues } from '../env'

// Env mínimo válido — espelha o que o Render exige preencher à mão
const BASE = {
  DATABASE_URL: 'postgresql://u:p@host:5432/db',
  DATABASE_URL_DIRECT: 'postgresql://u:p@host:5432/db',
  JWT_SECRET: 'secret',
  JWT_REFRESH_SECRET: 'refresh',
  PROTHEUS_ENCRYPTION_KEY: 'a'.repeat(64),
}

describe('withoutEmptyValues', () => {
  it('remove chaves com string vazia ou só espaços', () => {
    expect(withoutEmptyValues({ A: '', B: '   ', C: 'ok' })).toEqual({ C: 'ok' })
  })

  it('preserva undefined e valores válidos', () => {
    expect(withoutEmptyValues({ A: undefined, B: '0' })).toEqual({ A: undefined, B: '0' })
  })
})

describe('parseEnv', () => {
  it('aceita env var opcional criada sem valor no painel (string vazia)', () => {
    // Antes isso derrubava o boot: '' não é URL válida para o zod
    const env = parseEnv({ ...BASE, SENTRY_DSN: '', WEB_URL: '', ANTHROPIC_API_KEY: '' })

    expect(env.SENTRY_DSN).toBeUndefined()
    expect(env.WEB_URL).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('aplica os defaults quando a variável vem vazia', () => {
    const env = parseEnv({ ...BASE, PORT: '', CORS_ORIGIN: '', INTEL_GEOCODER: '' })

    expect(env.PORT).toBe('3333')
    expect(env.CORS_ORIGIN).toBe('http://localhost:3000')
    expect(env.INTEL_GEOCODER).toBe('nominatim')
  })

  it('continua validando valores preenchidos', () => {
    const env = parseEnv({ ...BASE, SENTRY_DSN: 'https://abc@o1.ingest.sentry.io/2' })
    expect(env.SENTRY_DSN).toBe('https://abc@o1.ingest.sentry.io/2')

    expect(() => parseEnv({ ...BASE, SENTRY_DSN: 'não-é-url' })).toThrow()
  })

  it('reclama de variável obrigatória ausente ou vazia', () => {
    expect(() => parseEnv({ ...BASE, JWT_SECRET: '' })).toThrow(/JWT_SECRET/)
  })
})
