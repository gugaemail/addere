import type { NextRequest } from 'next/server'

// Autoriza chamadas às rotas /api/pilot/*:
// - CRON_SECRET (Vercel Cron / chamadas internas), ou
// - Bearer token do painel validado contra a API (exige SUPERADMIN ativo).
// O cookie addere_session é só um indicador de UX — nunca serve como autorização.
export async function isPilotRequestAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const manualSecret = req.headers.get('x-cron-secret')

  if (secret && (authHeader === `Bearer ${secret}` || manualSecret === secret)) {
    return true
  }

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
        headers: { authorization: authHeader },
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return false
      const user = (await res.json()) as { role?: string; active?: boolean }
      return user.role === 'SUPERADMIN' && user.active !== false
    } catch {
      return false
    }
  }

  return false
}
