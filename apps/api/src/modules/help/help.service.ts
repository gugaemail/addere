import { prisma } from '@addere/db'

export async function createHelpReport(
  userId: string,
  data: {
    type: string
    description: string
    appVersion?: string
    device?: string
  },
  screenshotUrl?: string,
  ticketId?: string
) {
  return prisma.helpReport.create({
    data: {
      userId,
      type: data.type,
      description: data.description,
      appVersion: data.appVersion,
      device: data.device,
      screenshotUrl: screenshotUrl ?? null,
      ...(ticketId ? { ticketId } : {}),
    },
  })
}

export async function listUserReports(userId: string, limit: number, status?: string) {
  const where = {
    userId,
    ...(status ? { status } : {}),
  }

  const [reports, total] = await prisma.$transaction([
    prisma.helpReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        ticketId: true,
        type: true,
        description: true,
        status: true,
        appVersion: true,
        device: true,
        screenshotUrl: true,
        createdAt: true,
      },
    }),
    prisma.helpReport.count({ where }),
  ])

  return {
    reports: reports.map(r => ({
      ticket_id: r.ticketId,
      type: r.type,
      description: r.description.length > 120 ? r.description.slice(0, 120) + '...' : r.description,
      status: r.status,
      app_version: r.appVersion ?? null,
      device: r.device ?? null,
      screenshot_url: r.screenshotUrl ?? null,
      created_at: r.createdAt.toISOString(),
    })),
    total,
  }
}
