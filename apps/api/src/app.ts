import Fastify, { FastifyInstance } from 'fastify'
import envPlugin from './plugins/env'
import cookiePlugin from './plugins/cookie'
import corsPlugin from './plugins/cors'
import jwtPlugin from './plugins/jwt'
import authRoutes from './modules/auth/auth.routes'
import customersRoutes from './modules/customers/customers.routes'
import productsRoutes from './modules/products/products.routes'
import ordersRoutes from './modules/orders/orders.routes'

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
  await app.register(customersRoutes, { prefix: '/customers' })
  await app.register(productsRoutes, { prefix: '/products' })
  await app.register(ordersRoutes, { prefix: '/orders' })

  return app
}
