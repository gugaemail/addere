import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FastifyRequest, FastifyReply } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../test-utils/prisma-mock'
import { resolveTenant } from '../resolve-tenant'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'

function fakeReply() {
  const reply = {
    statusCode: 0,
    sent: false,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code
      return this
    },
    send(payload: unknown) {
      this.sent = true
      this.body = payload
      return this
    },
  }
  return reply as unknown as FastifyReply & { statusCode: number; sent: boolean; body: unknown }
}

const makeRequest = (user: object, source: Record<string, unknown>) =>
  ({ user, query: source, body: source }) as unknown as FastifyRequest

describe('resolveTenant', () => {
  beforeEach(() => resetPrismaMock())

  it('usa a empresa do próprio usuário quando companyId não vem', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A })
    const reply = fakeReply()
    const company = await resolveTenant(
      makeRequest({ role: 'ADMIN', companyId: COMPANY_A }, {}),
      reply,
      'query'
    )
    expect(company).toEqual({ id: COMPANY_A })
  })

  it('SUPERADMIN sem companyId → 400', async () => {
    const reply = fakeReply()
    const company = await resolveTenant(
      makeRequest({ role: 'SUPERADMIN', companyId: null }, {}),
      reply,
      'query'
    )
    expect(company).toBeNull()
    expect(reply.statusCode).toBe(400)
  })

  it('ADMIN da empresa A pedindo a B → 403', async () => {
    const reply = fakeReply()
    const company = await resolveTenant(
      makeRequest({ role: 'ADMIN', companyId: COMPANY_A }, { companyId: COMPANY_B }),
      reply,
      'body'
    )
    expect(company).toBeNull()
    expect(reply.statusCode).toBe(403)
  })

  it('SUPERADMIN acessa qualquer empresa via companyId', async () => {
    prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_B })
    const reply = fakeReply()
    const company = await resolveTenant(
      makeRequest({ role: 'SUPERADMIN', companyId: null }, { companyId: COMPANY_B }),
      reply,
      'body'
    )
    expect(company).toEqual({ id: COMPANY_B })
  })

  it('companyId mal formado → 400', async () => {
    const reply = fakeReply()
    const company = await resolveTenant(
      makeRequest({ role: 'ADMIN', companyId: COMPANY_A }, { companyId: 'não-uuid' }),
      reply,
      'query'
    )
    expect(company).toBeNull()
    expect(reply.statusCode).toBe(400)
  })

  it('empresa inexistente → 404', async () => {
    prismaMock.company.findUnique.mockResolvedValue(null)
    const reply = fakeReply()
    const company = await resolveTenant(
      makeRequest({ role: 'ADMIN', companyId: COMPANY_A }, {}),
      reply,
      'query'
    )
    expect(company).toBeNull()
    expect(reply.statusCode).toBe(404)
  })
})
