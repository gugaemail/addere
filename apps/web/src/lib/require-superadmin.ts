import { jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

const secret = new TextEncoder().encode(process.env.JWT_SECRET)

export async function requireSuperAdmin(
  req: NextRequest,
): Promise<{ error: NextResponse } | { role: string }> {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

  if (!token) {
    return {
      error: NextResponse.json({ message: 'Não autorizado' }, { status: 401 }),
    }
  }

  try {
    const { payload } = await jwtVerify(token, secret)
    const role = payload.role as string | undefined

    if (role !== 'SUPERADMIN') {
      return {
        error: NextResponse.json({ message: 'Acesso restrito' }, { status: 403 }),
      }
    }

    return { role }
  } catch {
    return {
      error: NextResponse.json({ message: 'Token inválido ou expirado' }, { status: 401 }),
    }
  }
}
