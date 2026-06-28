import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const SESSION_COOKIE = 'addere_session'
const TOKEN_COOKIE = 'addere_token'
const PUBLIC_PATHS = ['/login', '/resetar-senha']

// Rotas que exigem role ADMIN ou SUPERADMIN
const ADMIN_PATHS = ['/users', '/tipos-usuario', '/piloto', '/empresas', '/dashboard']

const jwtSecret = new TextEncoder().encode(process.env.JWT_SECRET)

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p))
  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value

  if (!isPublic && !hasSession) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (isPublic && hasSession) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Verificação de role para rotas admin
  const isAdminPath = ADMIN_PATHS.some((p) => pathname.startsWith(p))
  if (isAdminPath && hasSession) {
    const token = request.cookies.get(TOKEN_COOKIE)?.value
    if (token) {
      try {
        const { payload } = await jwtVerify(token, jwtSecret)
        const role = payload.role as string | undefined
        if (role && !['ADMIN', 'SUPERADMIN'].includes(role)) {
          return NextResponse.redirect(new URL('/login', request.url))
        }
      } catch {
        // Token expirado — o cliente fará refresh via interceptor; não bloquear
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
