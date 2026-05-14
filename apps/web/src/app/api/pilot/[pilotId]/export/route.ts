import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@addere/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ pilotId: string }> },
) {
  const { pilotId } = await params
  const since = req.nextUrl.searchParams.get('since')
    ? new Date(req.nextUrl.searchParams.get('since')!)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const events = await prisma.pilotEvent.findMany({
    where: { pilotId, eventType: 'ORDER_COMPLETED', occurredAt: { gte: since } },
    include: { rep: { select: { name: true } } },
    orderBy: { occurredAt: 'asc' },
  })

  const rows = [
    ['data', 'representante', 'duracao_ms', 'valor_total', 'itens', 'foi_offline'],
    ...events.map((e: { occurredAt: Date; rep: { name: string }; metadata: unknown }) => {
      const m = e.metadata as Record<string, unknown>
      return [
        e.occurredAt.toISOString(),
        e.rep.name,
        String(m.durationMs ?? ''),
        String(m.totalValue ?? ''),
        String(m.itemCount ?? ''),
        m.wasOffline ? 'sim' : 'não',
      ]
    }),
  ]

  const csv = (rows as string[][]).map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="piloto-${pilotId}-${since.toISOString().slice(0, 10)}.csv"`,
    },
  })
}
