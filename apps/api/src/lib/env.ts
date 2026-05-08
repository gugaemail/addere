import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_DIRECT: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_REFRESH_SECRET: z.string().min(1),
  PROTHEUS_ENCRYPTION_KEY: z.string().length(64),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3333'),
  CORS_ORIGIN: z.string().url().default('http://localhost:3000'),
})

// Valida no boot — lança erro claro antes de qualquer plugin Fastify carregar
export const env = envSchema.parse(process.env)
