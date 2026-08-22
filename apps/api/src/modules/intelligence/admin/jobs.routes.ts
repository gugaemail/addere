// Rotas admin de disparo/estado dos jobs (E3) — prefixo /intel/admin/jobs
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import type { IntelJob } from '@addere/types'
import { requirePermission, requireAnyPermission } from '../../../middleware/authenticate'
import { resolveTenant } from '../../../middleware/resolve-tenant'
import { userRateLimit } from '../../../lib/rate-limit'
import { startJobRun } from '../jobs/run-job'

const runSchema = z.object({
  companyId: z.string().uuid().optional(),
  job: z.enum(['nightly', 'refresh']),
})

const JOB_BY_INPUT: Record<'nightly' | 'refresh', IntelJob> = {
  nightly: 'NIGHTLY',
  refresh: 'REFRESH',
}

export default async function jobsRoutes(app: FastifyInstance) {
  const adminOnly = requirePermission('intel.admin')
  const adminOrManager = requireAnyPermission('intel.admin', 'intel.manager')

  // POST /run — dispara nightly/refresh manualmente; 202 + runId, 409 se lock ativo
  app.post(
    '/run',
    { preHandler: [adminOnly, userRateLimit(3, '1 minute')] },
    async (request, reply) => {
      const body = runSchema.parse(request.body)
      const company = await resolveTenant(request, reply, 'body')
      if (!company) return

      const result = await startJobRun(company.id, JOB_BY_INPUT[body.job])
      if (!result.started) {
        return reply
          .status(409)
          .send({ message: 'Este job já está em execução', runId: result.activeRunId })
      }
      return reply.status(202).send({ runId: result.runId })
    }
  )

  // GET /status — última execução por job + execuções recentes
  app.get('/status', { preHandler: [adminOrManager] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return

    const recent = await prisma.intelJobRun.findMany({
      where: { companyId: company.id },
      orderBy: { startedAt: 'desc' },
      take: 30,
    })

    const latestByJob = new Map<string, (typeof recent)[number]>()
    for (const run of recent) {
      if (!latestByJob.has(run.job)) latestByJob.set(run.job, run)
    }

    const toDto = (run: (typeof recent)[number]) => ({
      id: run.id,
      job: run.job,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      error: run.error,
    })

    return reply.send({
      latest: [...latestByJob.values()].map(toDto),
      recent: recent.slice(0, 10).map(toDto),
    })
  })
}
