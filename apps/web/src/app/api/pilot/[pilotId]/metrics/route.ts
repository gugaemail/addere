import { NextRequest, NextResponse } from 'next/server'
import { getFullDashboardMetrics } from '@/lib/metrics/pilot'
import { requireSuperAdmin } from '@/lib/require-superadmin'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pilotId: string }> },
) {
  const auth = await requireSuperAdmin(req)
  if ('error' in auth) return auth.error

  const { pilotId } = await params

  try {
    const metrics = await getFullDashboardMetrics(pilotId)
    return NextResponse.json(metrics, {
      headers: { 'Cache-Control': 's-maxage=300, stale-while-revalidate=60' },
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ message: 'Piloto não encontrado' }, { status: 404 })
    }
    console.error('[pilot/metrics]', err)
    return NextResponse.json({ message: 'Erro interno' }, { status: 500 })
  }
}
