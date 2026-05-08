import Fastify, { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import helmet from '@fastify/helmet'
import { prisma } from '@addere/db'
import envPlugin from './plugins/env'
import cookiePlugin from './plugins/cookie'
import corsPlugin from './plugins/cors'
import jwtPlugin from './plugins/jwt'
import authRoutes from './modules/auth/auth.routes'
import customersRoutes from './modules/customers/customers.routes'
import productsRoutes from './modules/products/products.routes'
import ordersRoutes from './modules/orders/orders.routes'
import companiesRoutes from './modules/companies/companies.routes'
import branchesRoutes from './modules/branches/branches.routes'
import syncRoutes from './modules/sync/sync.routes'
import { initSchedulers } from './modules/sync/scheduler'
import transportadorasRoutes from './modules/transportadoras/transportadoras.routes'
import condpagsRoutes from './modules/condpags/condpags.routes'
import { pilotRoutes } from './modules/pilot/pilot.routes'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  })

  // Plugins — ordem importa: env primeiro pois os outros dependem das variáveis
  await app.register(envPlugin)
  await app.register(helmet, { global: true })
  await app.register(cookiePlugin)
  await app.register(corsPlugin)
  await app.register(jwtPlugin)

  // Rate limiting: desabilitado globalmente, ativado por rota onde necessário
  await app.register(rateLimit, { global: false })

  // GET /health — verifica conectividade real com o banco de dados
  app.get('/health', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      return reply.send({ status: 'ok', db: 'connected' })
    } catch {
      return reply.status(503).send({ status: 'error', db: 'unreachable' })
    }
  })

  // Rotas
  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(customersRoutes, { prefix: '/customers' })
  await app.register(productsRoutes, { prefix: '/products' })
  await app.register(ordersRoutes, { prefix: '/orders' })
  await app.register(companiesRoutes, { prefix: '/companies' })
  await app.register(branchesRoutes, { prefix: '/branches' })
  await app.register(syncRoutes, { prefix: '/sync' })
  await app.register(transportadorasRoutes, { prefix: '/transportadoras' })
  await app.register(condpagsRoutes, { prefix: '/condpags' })
  await app.register(pilotRoutes)

  // Inicia schedulers de auto-sync após o servidor estar pronto
  app.addHook('onReady', async () => {
    await initSchedulers()
  })

  return app
}
