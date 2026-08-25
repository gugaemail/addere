// Módulo de rotas da camada de Inteligência (E3) — registrado em /intel no app.ts.
// Admin: /intel/admin/* (W3/W5). App do vendedor: /intel/app/* (E7).
// Gerente: /intel/manager/* (E8, W1).
import { FastifyInstance } from 'fastify'
import queriesRoutes from './admin/queries.routes'
import parametersRoutes from './admin/parameters.routes'
import configRoutes from './admin/config.routes'
import jobsRoutes from './admin/jobs.routes'
import healthRoutes from './admin/health.routes'
import evalRoutes from './eval/eval.routes'
import planRoutes from './app/plan.routes'
import appCustomersRoutes from './app/customers.routes'
import messagesRoutes from './app/messages.routes'
import visitsRoutes from './app/visits.routes'
import feedbackRoutes from './app/feedback.routes'
import managerRoutes from './manager/manager.routes'

export default async function intelligenceRoutes(app: FastifyInstance) {
  await app.register(queriesRoutes, { prefix: '/admin/queries' })
  await app.register(parametersRoutes, { prefix: '/admin/parameters' })
  await app.register(configRoutes, { prefix: '/admin/config' })
  await app.register(jobsRoutes, { prefix: '/admin/jobs' })
  await app.register(healthRoutes, { prefix: '/admin/health' })
  await app.register(evalRoutes, { prefix: '/admin/eval' })
  // Rotas do app do vendedor (E7) — posse por {companyId, vendorCode}
  await app.register(planRoutes, { prefix: '/app' })
  await app.register(appCustomersRoutes, { prefix: '/app' })
  await app.register(messagesRoutes, { prefix: '/app' })
  await app.register(visitsRoutes, { prefix: '/app' })
  await app.register(feedbackRoutes, { prefix: '/app' })
  // Rotas do gerente (E8) — recorte pela hierarquia D3b
  await app.register(managerRoutes, { prefix: '/manager' })
}
