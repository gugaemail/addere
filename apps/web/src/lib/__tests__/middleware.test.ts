import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
// Mesmo path-to-regexp que o Next usa internamente para compilar `config.matcher`
// (ver next/dist/lib/try-to-parse-path.js) — garante que o teste reflita o build real.
// @ts-expect-error módulo interno do Next sem declaração de tipos
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import { middleware, config } from '../../middleware'

const SESSION_COOKIE = 'addere_session'

// Regexes compiladas a partir do matcher exportado (uma por padrão)
const matcherRegexps: RegExp[] = (config.matcher as string[]).map((source) => pathToRegexp(source))
const matchesMiddleware = (pathname: string) => matcherRegexps.some((re) => re.test(pathname))

function makeRequest(pathname: string, opts: { session?: boolean } = {}) {
  const request = new NextRequest(new URL(`http://localhost${pathname}`))
  if (opts.session) request.cookies.set(SESSION_COOKIE, '1')
  return request
}

describe('middleware config.matcher', () => {
  it('não casa rotas /api/* (cron e pilot têm autenticação própria)', () => {
    expect(matchesMiddleware('/api/cron/weekly-report')).toBe(false)
    expect(matchesMiddleware('/api/pilot/abc/export')).toBe(false)
    expect(matchesMiddleware('/api/health')).toBe(false)
  })

  it('não casa assets internos do Next', () => {
    expect(matchesMiddleware('/_next/static/chunks/main.js')).toBe(false)
    expect(matchesMiddleware('/_next/image?url=x')).toBe(false)
    expect(matchesMiddleware('/favicon.ico')).toBe(false)
  })

  it('casa páginas da aplicação', () => {
    expect(matchesMiddleware('/')).toBe(true)
    expect(matchesMiddleware('/login')).toBe(true)
    expect(matchesMiddleware('/dashboard')).toBe(true)
    expect(matchesMiddleware('/empresas/123')).toBe(true)
  })
})

describe('middleware(request)', () => {
  it('redireciona rota protegida sem sessão para /login', () => {
    const res = middleware(makeRequest('/dashboard'))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/login')
  })

  it('deixa passar rota protegida com cookie de sessão', () => {
    const res = middleware(makeRequest('/dashboard', { session: true }))
    expect(res.status).toBe(200)
    expect(res.headers.get('location')).toBeNull()
  })

  it('deixa passar rotas públicas sem sessão', () => {
    for (const path of ['/login', '/resetar-senha', '/resetar-senha?token=abc']) {
      const res = middleware(makeRequest(path))
      expect(res.status).toBe(200)
      expect(res.headers.get('location')).toBeNull()
    }
  })

  it('redireciona rota pública com sessão ativa para /dashboard', () => {
    const res = middleware(makeRequest('/login', { session: true }))
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard')
  })
})
