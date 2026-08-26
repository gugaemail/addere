import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.APP_ENV,
  // Em desenvolvimento o DSN é placeholder: cada evento virava erro de CORS no console
  enabled: process.env.APP_ENV !== 'development',
  tracesSampleRate: process.env.APP_ENV === 'production' ? 0.1 : 1.0,
})
