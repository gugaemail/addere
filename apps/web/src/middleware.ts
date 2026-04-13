import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Cookie indicador de sessão ativa (sem valor sensível — apenas presença importa)
const SESSION_COOKIE = 'addere_session'
const PUBLIC_PATHS = ['/login']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value

  if (!isPublic && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isPublic && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
