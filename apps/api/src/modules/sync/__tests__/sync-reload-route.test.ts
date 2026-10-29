// Recarga do catálogo (POST /sync/products/reload): desativa os produtos que
// não vieram na carga completa — só o SUPERADMIN. O ADMIN da empresa e o
// vendedor ficam de fora.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())

const syncProducts = vi.fn()
vi.mock('../products.sync', () => ({ syncProducts: (...args: unknown[]) => syncProducts(...args) }))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { buildApp } from '../../../app'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'

let app: FastifyInstance
let tokens: Record<string, string>

beforeAll(async () => {
  app = await buildApp()
  await app.ready()
  tokens = {
    super: app.jwt.sign({ sub: 'super-1', email: 's@a.com', role: 'SUPERADMIN' }),
    adminA: app.jwt.sign({ sub: 'admin-a', email: 'a@a.com', role: 'ADMIN', companyId: COMPANY_A }),
    salesA: app.jwt.sign({
      sub: 'sales-a',
      email: 'v@a.com',
      role: 'SALESPERSON',
      companyId: COMPANY_A,
    }),
  }
})

afterAll(async () => {
  await app.close()
})

beforeEach(() => {
  resetPrismaMock()
  syncProducts.mockReset()
  prismaMock.user.findUnique.mockResolvedValue({ active: true })
  prismaMock.company.findUnique.mockResolvedValue({ id: COMPANY_A })
})

const reload = (who: keyof typeof tokens) =>
  app.inject({
    method: 'POST',
    url: '/sync/products/reload',
    headers: { authorization: `Bearer ${tokens[who]}` },
    payload: { companyId: COMPANY_A },
  })

describe('POST /sync/products/reload', () => {
  it('SUPERADMIN recarrega com prune e recebe quantos foram desativados', async () => {
    syncProducts.mockResolvedValue({ synced: 180, total: 180, errors: [], deactivated: 83 })

    const res = await reload('super')

    expect(res.statusCode).toBe(200)
    expect(syncProducts).toHaveBeenCalledWith(COMPANY_A, 'reloadProducts', { prune: true })
    expect(res.json()).toMatchObject({ synced: 180, deactivated: 83 })
  })

  it('ADMIN da empresa não recarrega', async () => {
    const res = await reload('adminA')

    expect(res.statusCode).toBe(403)
    expect(syncProducts).not.toHaveBeenCalled()
  })

  it('vendedor não recarrega', async () => {
    const res = await reload('salesA')

    expect(res.statusCode).toBe(403)
    expect(syncProducts).not.toHaveBeenCalled()
  })
})
