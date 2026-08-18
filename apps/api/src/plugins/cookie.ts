import fp from 'fastify-plugin'
import { env } from '../lib/env'
import cookie from '@fastify/cookie'
import { FastifyInstance } from 'fastify'

export default fp(async (app: FastifyInstance) => {
  await app.register(cookie, {
    // segredo para assinar cookies (JWT_REFRESH_SECRET é validado como obrigatório pelo plugin env)
    secret: env.JWT_REFRESH_SECRET,
  })
})
