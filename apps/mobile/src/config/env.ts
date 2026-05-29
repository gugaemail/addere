import { z } from 'zod'

const envSchema = z.object({
  apiUrl: z.string().url(),
  protheuUrl: z.string().url().optional(),
  sentryDsn: z.string().min(1).optional(),
  appEnv: z.enum(['development', 'staging', 'production']).default('development'),
  appVersion: z.string().regex(/^\d+\.\d+\.\d+$/).default('1.0.0'),
})

export const env = envSchema.parse({
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  protheuUrl: process.env.EXPO_PUBLIC_PROTHEUS_URL,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  appEnv: process.env.EXPO_PUBLIC_APP_ENV,
  appVersion: process.env.EXPO_PUBLIC_APP_VERSION,
})
