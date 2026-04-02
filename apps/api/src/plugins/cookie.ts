import fp from 'fastify-plugin'
import cookie from '@fastify/cookie'
import { FastifyInstance } from 'fastify'

export default fp(async (app: FastifyInstance) => {
  await app.register(cookie, {
    // segredo para assinar cookies (usa o mesmo segredo do refresh token)
    secret: process.env.JWT_REFRESH_SECRET ?? 'cookie-secret',
  })
})
