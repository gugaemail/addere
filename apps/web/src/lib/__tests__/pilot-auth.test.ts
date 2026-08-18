import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isPilotRequestAuthorized } from '../pilot-auth'

function req(headers: Record<string, string>) {
  return { headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } } as never
}

describe('isPilotRequestAuthorized', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 's3cr3t'
    process.env.NEXT_PUBLIC_API_URL = 'http://api.test'
  })
  afterEach(() => vi.restoreAllMocks())

  it('autoriza pelo CRON_SECRET (Bearer ou x-cron-secret)', async () => {
    expect(await isPilotRequestAuthorized(req({ authorization: 'Bearer s3cr3t' }))).toBe(true)
    expect(await isPilotRequestAuthorized(req({ 'x-cron-secret': 's3cr3t' }))).toBe(true)
  })

  it('nega sem credencial — cookie de sessão não é autorização', async () => {
    expect(await isPilotRequestAuthorized(req({}))).toBe(false)
    expect(await isPilotRequestAuthorized(req({ cookie: 'addere_session=1' }))).toBe(false)
  })

  it('valida Bearer de usuário na API e exige SUPERADMIN ativo', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ role: 'SUPERADMIN', active: true }))
    )
    expect(await isPilotRequestAuthorized(req({ authorization: 'Bearer jwt' }))).toBe(true)

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ role: 'ADMIN', active: true })))
    expect(await isPilotRequestAuthorized(req({ authorization: 'Bearer jwt' }))).toBe(false)

    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }))
    expect(await isPilotRequestAuthorized(req({ authorization: 'Bearer jwt' }))).toBe(false)
  })
})
