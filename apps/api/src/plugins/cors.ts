import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import { FastifyInstance } from 'fastify'

export default fp(async (app: FastifyInstance) => {
  await app.register(cors, {
    origin: app.config?.CORS_ORIGIN ?? process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true, // necessário para enviar cookies cross-origin
  })
})
