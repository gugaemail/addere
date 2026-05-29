import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import { FastifyInstance } from 'fastify'

const PRODUCTION_ORIGINS = [
  'https://addere.com.br',
  'https://www.addere.com.br',
]

export default fp(async (app: FastifyInstance) => {
  await app.register(cors, {
    origin: PRODUCTION_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
})
