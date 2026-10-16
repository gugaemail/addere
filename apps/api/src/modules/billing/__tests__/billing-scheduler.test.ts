// Agendador do faturamento (plano 016, passo 7): só liga com a env, nunca
// lança, erro transitório de banco não vai ao Sentry e os passos rodam numa
// ordem fixa. Os passos são os de verdade, sobre o mock do Prisma.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const { captureMock } = vi.hoisted(() => ({ captureMock: vi.fn() }))

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())
vi.mock('../../../lib/sentry', () => ({ captureError: captureMock, initSentry: vi.fn() }))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import {
  BILLING_STEP_NAMES,
  initBillingScheduler,
  shouldStartBillingScheduler,
  tickBillingScheduler,
} from '../jobs/billing-scheduler'

const NOW = new Date('2026-11-01T12:00:00Z')

beforeEach(() => {
  resetPrismaMock()
  captureMock.mockReset()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shouldStartBillingScheduler', () => {
  it("em teste: desligado mesmo com 'true'", () => {
    expect(shouldStartBillingScheduler({ NODE_ENV: 'test', BILLING_JOBS_ENABLED: 'true' })).toBe(
      false
    )
  })

  it("produção com 'false': desligado; com 'true': ligado", () => {
    expect(
      shouldStartBillingScheduler({ NODE_ENV: 'production', BILLING_JOBS_ENABLED: 'false' })
    ).toBe(false)
    expect(
      shouldStartBillingScheduler({ NODE_ENV: 'production', BILLING_JOBS_ENABLED: 'true' })
    ).toBe(true)
  })

  it('desenvolvimento segue a env (o .env local aponta para banco real)', () => {
    expect(
      shouldStartBillingScheduler({ NODE_ENV: 'development', BILLING_JOBS_ENABLED: 'false' })
    ).toBe(false)
  })
})

describe('initBillingScheduler', () => {
  it('em teste não chama setInterval nem roda o tick', () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    initBillingScheduler()
    expect(spy).not.toHaveBeenCalled()
    expect(prismaMock.companyContract.findMany).not.toHaveBeenCalled()
  })
})

describe('tickBillingScheduler', () => {
  it('nunca lança: o gerador falha, o erro vai ao Sentry e os lembretes rodam mesmo assim', async () => {
    prismaMock.companyContract.findMany.mockRejectedValueOnce(new Error('drift de schema'))
    const summary = await tickBillingScheduler(NOW)
    expect(summary.errors).toEqual(['invoices'])
    expect(summary.invoices).toBeNull()
    expect(captureMock).toHaveBeenCalledWith(expect.any(Error), {
      module: 'billing-scheduler',
      step: 'invoices',
    })
    expect(summary.contractsEnded).toBe(0)
    expect(summary.dueReminders).toEqual({ sent: 0, duplicate: 0, skipped: 0, failed: 0 })
    expect(summary.documentReminders).toEqual({ sent: 0, duplicate: 0, skipped: 0, failed: 0 })
    expect(prismaMock.invoice.findMany).toHaveBeenCalled()
    expect(prismaMock.contractDocument.findMany).toHaveBeenCalled()
  })

  it('erro transitório de banco (P1001): resolve e não vai ao Sentry', async () => {
    const down = Object.assign(new Error("Can't reach database server"), { code: 'P1001' })
    prismaMock.companyContract.findMany.mockRejectedValue(down)
    prismaMock.billingSettings.findUnique.mockRejectedValue(down)
    prismaMock.contractDocument.findMany.mockRejectedValue(down)
    const summary = await tickBillingScheduler(NOW)
    expect(summary.errors).toEqual([
      'invoices',
      'contractsEnded',
      'dueReminders',
      'documentReminders',
    ])
    expect(captureMock).not.toHaveBeenCalled()
  })

  it('os quatro passos rodam na ordem de STEPS', async () => {
    expect(BILLING_STEP_NAMES).toEqual([
      'invoices',
      'contractsEnded',
      'dueReminders',
      'documentReminders',
    ])
    const order: string[] = []
    prismaMock.companyContract.findMany.mockImplementation(async (args: { where: object }) => {
      order.push('firstBilledCompetence' in args.where ? 'invoices' : 'contractsEnded')
      return []
    })
    prismaMock.invoice.findMany.mockImplementation(async () => {
      order.push('dueReminders')
      return []
    })
    prismaMock.contractDocument.findMany.mockImplementation(async () => {
      order.push('documentReminders')
      return []
    })
    const summary = await tickBillingScheduler(NOW)
    expect(order).toEqual(['invoices', 'contractsEnded', 'dueReminders', 'documentReminders'])
    expect(summary.errors).toEqual([])
    expect(summary.invoices).toMatchObject({ competence: '2026-10', created: 0 })
  })
})
