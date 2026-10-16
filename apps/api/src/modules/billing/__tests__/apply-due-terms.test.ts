// Inteligência pelo contrato (plano 014, decisão de desenho 3): a função única
// que o aceite e o ticker horário chamam. Empresa sem contrato ACTIVE fica
// como está (decisão 1); aditivo com data no futuro só muda quando a data chega.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { effectiveInstantOfDay } from '@addere/types'

vi.mock('@addere/db', async () => (await import('../../../test-utils/prisma-mock')).mockDb())
vi.mock('../../../lib/sentry', () => ({ captureError: vi.fn(), initSentry: vi.fn() }))

import { prismaMock, resetPrismaMock } from '../../../test-utils/prisma-mock'
import { captureError } from '../../../lib/sentry'
import { syncIntelligenceWithTerms, tickApplyDueTerms } from '../jobs/apply-due-terms'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'

const standard = {
  status: 'EFFECTIVE',
  effectiveFrom: new Date('2026-09-01T12:00:00Z'),
  version: 1,
  licenseType: 'STANDARD',
}
const upgrade = {
  status: 'EFFECTIVE',
  effectiveFrom: effectiveInstantOfDay('2026-12-01'),
  version: 2,
  licenseType: 'INTELLIGENCE',
}

beforeEach(() => {
  resetPrismaMock()
  vi.mocked(captureError).mockReset()
})

describe('syncIntelligenceWithTerms', () => {
  it('sem contrato ACTIVE não faz nada (o SUPERADMIN continua ligando à mão)', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue({
      status: 'PENDING_ACCEPTANCE',
      terms: [standard],
    })
    expect(await syncIntelligenceWithTerms(prismaMock, COMPANY_A, new Date())).toBe(false)
    prismaMock.companyContract.findUnique.mockResolvedValue(null)
    expect(await syncIntelligenceWithTerms(prismaMock, COMPANY_A, new Date())).toBe(false)
    expect(prismaMock.company.update).not.toHaveBeenCalled()
  })

  it('contrato Padrão desliga a Inteligência ligada para o teste da implantação', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue({ status: 'ACTIVE', terms: [standard] })
    prismaMock.company.findUnique.mockResolvedValue({ intelligenceEnabled: true })
    expect(
      await syncIntelligenceWithTerms(prismaMock, COMPANY_A, new Date('2026-10-20T12:00:00Z'))
    ).toBe(true)
    expect(prismaMock.company.update).toHaveBeenCalledWith({
      where: { id: COMPANY_A },
      data: { intelligenceEnabled: false },
    })
    expect(prismaMock.billingEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'INTELLIGENCE_APPLIED',
        companyId: COMPANY_A,
        actorId: null,
        payload: { fields: ['intelligenceEnabled'], termsVersion: 1 },
      },
    })
  })

  it('valor igual ao esperado: nenhuma escrita', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue({ status: 'ACTIVE', terms: [standard] })
    prismaMock.company.findUnique.mockResolvedValue({ intelligenceEnabled: false })
    expect(
      await syncIntelligenceWithTerms(prismaMock, COMPANY_A, new Date('2026-10-20T12:00:00Z'))
    ).toBe(false)
    expect(prismaMock.company.update).not.toHaveBeenCalled()
    expect(prismaMock.billingEvent.create).not.toHaveBeenCalled()
  })

  it('aditivo aceito para 01/12: antes da data nada muda; depois, liga e grava o evento', async () => {
    prismaMock.companyContract.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      terms: [standard, upgrade],
    })
    prismaMock.company.findUnique.mockResolvedValue({ intelligenceEnabled: false })

    // 00:00 de 01/12 em São Paulo: o aditivo vale às 00:01
    expect(
      await syncIntelligenceWithTerms(prismaMock, COMPANY_A, new Date('2026-12-01T03:00:00Z'))
    ).toBe(false)
    expect(prismaMock.company.update).not.toHaveBeenCalled()

    expect(
      await syncIntelligenceWithTerms(prismaMock, COMPANY_A, new Date('2026-12-01T03:05:00Z'))
    ).toBe(true)
    expect(prismaMock.company.update).toHaveBeenCalledWith({
      where: { id: COMPANY_A },
      data: { intelligenceEnabled: true },
    })
    expect(prismaMock.billingEvent.create.mock.calls[0][0].data.payload).toEqual({
      fields: ['intelligenceEnabled'],
      termsVersion: 2,
    })
  })
})

describe('tickApplyDueTerms', () => {
  it('passa por cada contrato ACTIVE e isola o erro de uma empresa', async () => {
    prismaMock.companyContract.findMany.mockResolvedValue([
      { companyId: COMPANY_A },
      { companyId: COMPANY_B },
    ])
    prismaMock.companyContract.findUnique
      .mockRejectedValueOnce(new Error('falha na empresa A'))
      .mockResolvedValueOnce({ status: 'ACTIVE', terms: [standard, upgrade] })
    prismaMock.company.findUnique.mockResolvedValue({ intelligenceEnabled: false })

    const changed = await tickApplyDueTerms(new Date('2026-12-02T12:00:00Z'))
    expect(changed).toBe(1)
    expect(prismaMock.companyContract.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      select: { companyId: true },
    })
    expect(captureError).toHaveBeenCalledTimes(1)
    expect(prismaMock.company.update).toHaveBeenCalledWith({
      where: { id: COMPANY_B },
      data: { intelligenceEnabled: true },
    })
  })
})
