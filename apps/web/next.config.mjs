import { withSentryConfig } from '@sentry/nextjs'

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333'

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@addere/types'],

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
              // unsafe-eval removido (permite eval/Function, principal vetor pós-XSS)
              // unsafe-inline mantido enquanto não há suporte a nonces no layout raiz
              "script-src 'self' 'unsafe-inline' https://*.sentry.io https://*.sentry-cdn.com",
              "style-src 'self' 'unsafe-inline'",
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
