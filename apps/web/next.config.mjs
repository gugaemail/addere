import { withSentryConfig } from '@sentry/nextjs'

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'
const isDev = process.env.NODE_ENV === 'development'

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@addere/types'],

  // APP_ENV não tem o prefixo NEXT_PUBLIC_, então no bundle do navegador ele
  // chegava como undefined: o Sentry do cliente subia sem `environment` e com
  // tracesSampleRate 1.0 em produção. Inline explícito no build.
  env: { APP_ENV: process.env.APP_ENV ?? 'development' },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Em desenvolvimento o Next carrega os módulos via eval (HMR e
              // source maps): sem 'unsafe-eval' o painel nem hidrata localmente.
              // Em produção a lista continua fechada.
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://*.sentry.io`,
              "style-src 'self' 'unsafe-inline'",
              // O Sentry Replay comprime a gravação num Web Worker criado de um
              // blob: — sem worker-src o navegador cai no fallback de script-src
              // e bloqueia (console.error em toda página, replay sem compressão).
              "worker-src 'self' blob:",
              "img-src 'self' data: https:",
              `connect-src 'self' ${apiUrl} https://*.sentry.io`,
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default withSentryConfig(nextConfig, {
  silent: true,
  org: 'addere',
  project: 'addere-web',
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  hideSourceMaps: true,
  disableLogger: true,
})
