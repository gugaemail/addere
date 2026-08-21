// Módulo de rotas da camada de Inteligência (E3) — registrado em /intel no app.ts.
// Admin: /intel/admin/* (W3/W5). Rotas do app do vendedor chegam na E7 (/intel/app/*).
import { FastifyInstance } from 'fastify'
import queriesRoutes from './admin/queries.routes'
import parametersRoutes from './admin/parameters.routes'
import configRoutes from './admin/config.routes'
import jobsRoutes from './admin/jobs.routes'

export default async function intelligenceRoutes(app: FastifyInstance) {
  await app.register(queriesRoutes, { prefix: '/admin/queries' })
  await app.register(parametersRoutes, { prefix: '/admin/parameters' })
  await app.register(configRoutes, { prefix: '/admin/config' })
  await app.register(jobsRoutes, { prefix: '/admin/jobs' })
}
