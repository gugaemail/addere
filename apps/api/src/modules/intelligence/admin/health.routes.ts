// Rotas da tela Saúde (E4, W4) — prefixo /intel/admin/health
import { FastifyInstance } from 'fastify'
import { requirePermission, requireAnyPermission } from '../../../middleware/authenticate'
import { resolveTenant } from '../../../middleware/resolve-tenant'
import { buildHealthReport, fixesToCsv } from './health.service'

export default async function healthRoutes(app: FastifyInstance) {
  const adminOnly = requirePermission('intel.admin')
  const adminOrManager = requireAnyPermission('intel.admin', 'intel.manager')

  app.get('/', { preHandler: [adminOrManager] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    return reply.send(await buildHealthReport(company))
  })

  // Lista "corrigir no Protheus" em CSV (planilha para o consultor)
  app.get('/export.csv', { preHandler: [adminOnly] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    const report = await buildHealthReport(company)
    return reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="corrigir-no-protheus.csv"')
      .send(fixesToCsv(report.fixes))
  })
}
