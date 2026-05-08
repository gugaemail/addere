import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@addere/db'
import { sendWeeklyReport } from '@/lib/email/sendWeeklyReport'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Não autorizado' }, { status: 401 })
  }

  const activePilots = await prisma.pilot.findMany({
    where: { status: 'ACTIVE' },
    include: {
      company: {
        include: {
          users: {
            where: { role: 'ADMIN', active: true },
            select: { email: true },
          },
        },
      },
    },
  })

  const results: Array<{ pilotId: string; clientName: string; status: string }> = []

  for (const pilot of activePilots) {
    const recipients = pilot.company.users.map((u) => u.email)
    if (recipients.length === 0) {
      results.push({ pilotId: pilot.id, clientName: pilot.clientName, status: 'sem_destinatários' })
      continue
    }

    try {
      await sendWeeklyReport(pilot.id, recipients)
      results.push({ pilotId: pilot.id, clientName: pilot.clientName, status: 'enviado' })
    } catch (err) {
      console.error(`[cron/weekly-report] Falha ao enviar para piloto ${pilot.id}:`, err)
      results.push({ pilotId: pilot.id, clientName: pilot.clientName, status: 'erro' })
    }
  }

  return NextResponse.json({ processed: results.length, results })
}
