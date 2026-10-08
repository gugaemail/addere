import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())

const syncContractMock = vi.fn()
vi.mock('../../sync/contract-sync.service', () => ({
  publishedContracts: vi.fn(async () => ['SALES']),
  syncContract: (...args: unknown[]) => syncContractMock(...args),
}))
const captureGoalsMock = vi.fn()
vi.mock('../../sync/goals.service', () => ({
  captureGoals: (...args: unknown[]) => captureGoalsMock(...args),
}))
vi.mock('../run-job', () => ({ updateRunMetadata: vi.fn(async () => undefined) }))

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { refreshHandler } from '../refresh'

beforeEach(() => {
  resetPrismaMock()
  syncContractMock.mockReset().mockResolvedValue({ mode: 'incremental', rows: 1, synced: 1 })
  captureGoalsMock.mockReset().mockResolvedValue({ captured: 1, errors: [] })
})

describe('refreshHandler — meta do mês', () => {
  it('captura só o mês atual: meta nova aparece na tela Hoje sem esperar a noite', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      id: 'c1',
      intelligenceEnabled: true,
      apiMetaVend: 'https://protheus/meta',
    })

    await refreshHandler('c1', 'run1')

    expect(captureGoalsMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }), {
      currentOnly: true,
    })
  })

  it('sem apiMetaVend não chama a captura', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      id: 'c1',
      intelligenceEnabled: true,
      apiMetaVend: null,
    })

    await refreshHandler('c1', 'run1')

    expect(captureGoalsMock).not.toHaveBeenCalled()
  })

  it('todas as chamadas de meta falharam: o refresh falha alto', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      id: 'c1',
      intelligenceEnabled: true,
      apiMetaVend: 'https://protheus/meta',
    })
    captureGoalsMock.mockResolvedValue({ captured: 0, errors: ['020/202610: 404'] })

    await expect(refreshHandler('c1', 'run1')).rejects.toThrow(/metas: 020\/202610: 404/)
  })
})
