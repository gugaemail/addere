import fp from 'fastify-plugin'
import cookie from '@fastify/cookie'
import { FastifyInstance } from 'fastify'

export default fp(async (app: FastifyInstance) => {
  await app.register(cookie, {
    // segredo para assinar cookies (JWT_REFRESH_SECRET é validado como obrigatório pelo plugin env)
    secret: process.env.JWT_REFRESH_SECRET!,
  })
})
