import fp from 'fastify-plugin'
import env from '@fastify/env'
import { FastifyInstance } from 'fastify'

// Expõe app.config com tipagem para todos os plugins e rotas
declare module 'fastify' {
  interface FastifyInstance {
    config: {
      DATABASE_URL: string
      JWT_SECRET: string
      JWT_REFRESH_SECRET: string
      PROTHEUS_ENCRYPTION_KEY: string
      NODE_ENV: string
      PORT: string
      CORS_ORIGIN: string
    }
  }
}

const schema = {
  type: 'object',
  required: ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'PROTHEUS_ENCRYPTION_KEY'],
  properties: {
    DATABASE_URL:             { type: 'string' },
    JWT_SECRET:               { type: 'string' },
    JWT_REFRESH_SECRET:       { type: 'string' },
    PROTHEUS_ENCRYPTION_KEY:  { type: 'string', minLength: 64, maxLength: 64 },
    NODE_ENV:                 { type: 'string', default: 'development' },
    PORT:                     { type: 'string', default: '3333' },
    CORS_ORIGIN:              { type: 'string', default: 'http://localhost:3000' },
  },
}

export default fp(async (app: FastifyInstance) => {
  await app.register(env, { schema, dotenv: true })
})
