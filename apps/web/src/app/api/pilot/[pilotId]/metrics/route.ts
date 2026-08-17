import { NextRequest, NextResponse } from 'next/server'
import { isPilotRequestAuthorized } from '@/lib/pilot-auth'
import { getFullDashboardMetrics } from '@/lib/metrics/pilot'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pilotId: string }> },
) {
  if (!(await isPilotRequestAuthorized(_req))) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  const { pilotId } = await params

  try {
    const metrics = await getFullDashboardMetrics(pilotId)
    return NextResponse.json(metrics, {
      headers: { 'Cache-Control': 'private, max-age=60' },
    })
  } catch (err) {
    if ((err as { code?: string }).code === 'P2025') {
      return NextResponse.json({ message: 'Piloto não encontrado' }, { status: 404 })
    }
    console.error('[pilot/metrics]', err)
    return NextResponse.json({ message: 'Erro interno' }, { status: 500 })
  }
}
