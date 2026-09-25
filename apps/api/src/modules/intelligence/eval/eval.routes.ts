// Rotas do eval do agente (E6) — prefixo /intel/admin/eval
import { FastifyInstance } from 'fastify'
import { requirePermission } from '../../../middleware/authenticate'
import { resolveTenant } from '../../../middleware/resolve-tenant'
import { userRateLimit } from '../../../lib/rate-limit'
import { freezeEvalCases, runEval } from './eval.service'

export default async function evalRoutes(app: FastifyInstance) {
  const adminOnly = requirePermission('intel.admin')

  // Congela casos a partir dos sinais atuais (snapshot pseudonimizado)
  app.post(
    '/freeze',
    { preHandler: [adminOnly, userRateLimit(2, '1 minute')] },
    async (request, reply) => {
      const company = await resolveTenant(request, reply, 'body')
      if (!company) return
      const created = await freezeEvalCases(company)
      return reply.send({ created })
    }
  )

  // Roda a regressão (antes de mudar prompt/modelo — doc §5.3)
  app.post(
    '/run',
    { preHandler: [adminOnly, userRateLimit(1, '1 minute')] },
    async (request, reply) => {
      const company = await resolveTenant(request, reply, 'body')
      if (!company) return
      return reply.send(await runEval(company))
    }
  )
}
