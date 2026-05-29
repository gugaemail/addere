import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import { FastifyInstance } from 'fastify'

const PRODUCTION_ORIGINS = [
  'https://addere.com.br',
  'https://www.addere.com.br',
]

const DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]

export default fp(async (app: FastifyInstance) => {
  const origins =
    process.env.NODE_ENV === 'production'
      ? PRODUCTION_ORIGINS
      : [...PRODUCTION_ORIGINS, ...DEV_ORIGINS]

  await app.register(cors, {
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
})
