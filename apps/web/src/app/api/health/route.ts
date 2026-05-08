async function checkDatabase(): Promise<'ok' | 'error'> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`, {
      next: { revalidate: 0 },
    })
    const data = (await res.json()) as { db?: string }
    return data.db === 'connected' ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

export async function GET() {
  const database = await checkDatabase()

  const checks = {
    status: database === 'ok' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    environment: process.env.APP_ENV,
    database,
  }

  const allHealthy = checks.status === 'ok'

  return Response.json(checks, {
    status: allHealthy ? 200 : 503,
  })
}
