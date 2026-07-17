import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import { FastifyInstance } from 'fastify'
import { env } from '../lib/env'

const BASE_ORIGINS = [
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
      ? [...BASE_ORIGINS, env.CORS_ORIGIN]
      : [...BASE_ORIGINS, env.CORS_ORIGIN, ...DEV_ORIGINS]

  await app.register(cors, {
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  })
})
