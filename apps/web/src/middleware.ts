import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Cookie indicador de sessão ativa (sem valor sensível — apenas presença importa)
const SESSION_COOKIE = 'addere_session'
const PUBLIC_PATHS = ['/login', '/resetar-senha']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value

  if (!isPublic && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isPublic && hasSession) {
    // '/' decide a home pelo papel (E9): SUPERADMIN → /dashboard; demais → /inteligencia
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  // /api/* fica fora: essas rotas têm autenticação própria (CRON_SECRET/Bearer);
  // o redirect para /login quebrava o Vercel Cron e o health-check
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
