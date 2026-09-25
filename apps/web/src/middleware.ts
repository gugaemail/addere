import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { safeNextPath } from '@/lib/home-redirect'

// Cookie indicador de sessão ativa (sem valor sensível — apenas presença importa)
const SESSION_COOKIE = 'addere_session'
const PUBLIC_PATHS = ['/login', '/resetar-senha']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value

  if (!isPublic && !hasSession) {
    // Guarda o destino: sem isso um link direto para /inteligencia/saude
    // sempre terminava na home do papel depois do login.
    const login = new URL('/login', request.url)
    const next = safeNextPath(`${pathname}${request.nextUrl.search}`)
    if (next) login.searchParams.set('next', next)
    return NextResponse.redirect(login)
  }

  if (isPublic && hasSession) {
    // '/' decide a home pelo papel (E9): SUPERADMIN → /dashboard; demais → /inteligencia
    const next = safeNextPath(request.nextUrl.searchParams.get('next'))
    return NextResponse.redirect(new URL(next ?? '/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  // /api/* fica fora: essas rotas têm autenticação própria (CRON_SECRET/Bearer);
  // o redirect para /login quebrava o Vercel Cron e o health-check
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
