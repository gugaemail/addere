import fp from 'fastify-plugin'
import cors from '@fastify/cors'
import { FastifyInstance } from 'fastify'
import { env } from '../lib/env'

const PRODUCTION_ORIGINS = [
  'https://addere.com.br',
  'https://www.addere.com.br',
  'https://addere-web.vercel.app',
]

const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500']

export default fp(async (app: FastifyInstance) => {
  // CORS_ORIGIN permite adicionar domínios sem deploy de código (separar por vírgula)
  const envOrigins = env.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  const base =
    env.NODE_ENV === 'production' ? PRODUCTION_ORIGINS : [...PRODUCTION_ORIGINS, ...DEV_ORIGINS]
  const origins = [...new Set([...base, ...envOrigins])]

  await app.register(cors, {
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
})
