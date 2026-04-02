import fp from 'fastify-plugin'
import jwt from '@fastify/jwt'
import { FastifyInstance } from 'fastify'
import type { JwtPayload } from '@addere/types'

// Augmentação de tipo para que request.user seja tipado como JwtPayload
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

export default fp(async (app: FastifyInstance) => {
  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? '',
    sign: { expiresIn: '8h' },
  })
})
