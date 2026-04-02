import Fastify, { FastifyInstance } from 'fastify'
import envPlugin from './plugins/env'
import cookiePlugin from './plugins/cookie'
import corsPlugin from './plugins/cors'
import jwtPlugin from './plugins/jwt'
import authRoutes from './modules/auth/auth.routes'

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  })

  // Plugins — ordem importa: env primeiro pois os outros dependem das variáveis
  await app.register(envPlugin)
  await app.register(cookiePlugin)
  await app.register(corsPlugin)
  await app.register(jwtPlugin)

  // Rotas
  await app.register(authRoutes, { prefix: '/auth' })

  return app
}
