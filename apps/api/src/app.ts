import { checkEnv } from './scripts/check-env'
checkEnv()

import Fastify, { FastifyInstance } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import staticPlugin from '@fastify/static'
import path from 'node:path'
import fs from 'node:fs'
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
import helpRoutes from './modules/help/help.routes'
import usersRoutes from './modules/users/users.routes'
import permissionsRoutes, { userPermissionsRoutes } from './modules/permissions/permissions.routes'
import userTypesRoutes from './modules/user-types/user-types.routes'

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

  // Upload de arquivos (screenshots da Central de Ajuda) — max 5MB, 1 arquivo por request
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  })

  // Serve pasta uploads/ como arquivos estáticos
  const uploadRoot = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads')
  fs.mkdirSync(uploadRoot, { recursive: true })
  await app.register(staticPlugin, { root: uploadRoot, prefix: '/uploads/' })

  // GET /health — sem autenticação; usado por load balancers e monitoramento
  app.get('/health', async (_request, reply) => {
    const { prisma } = await import('@addere/db')
    try {
      await prisma.$queryRaw`SELECT 1`
      return reply.send({
        status: 'ok',
        db: 'ok',
        version: process.env.npm_package_version,
        timestamp: new Date().toISOString(),
      })
    } catch {
      return reply.status(503).send({
        status: 'error',
        db: 'unreachable',
        timestamp: new Date().toISOString(),
      })
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
  await app.register(helpRoutes, { prefix: '/help' })
  await app.register(usersRoutes, { prefix: '/users' })
  await app.register(userPermissionsRoutes, { prefix: '/users' })
  await app.register(permissionsRoutes)
  await app.register(userTypesRoutes, { prefix: '/user-types' })

  // Inicia schedulers de auto-sync após o servidor estar pronto
  app.addHook('onReady', async () => {
    await initSchedulers()
  })

  return app
}
