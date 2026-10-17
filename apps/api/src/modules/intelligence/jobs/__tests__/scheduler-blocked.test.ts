// A Inteligência pausa para empresa bloqueada (plano 017, decisão 7): sem
// NIGHTLY nem REFRESH (sem custo de IA), mas com o PURGE uma vez por dia — o
// expurgo LGPD mora dentro do NIGHTLY. Liberada, o catch-up sai sozinho.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())
vi.mock('../../../../lib/sentry', () => ({ captureError: vi.fn() }))
vi.mock('../run-job', () => ({ startJobRun: vi.fn() }))

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { selectJobsForTick, tickIntelScheduler } from '../scheduler'
import { startJobRun } from '../run-job'

const startMock = vi.mocked(startJobRun)

// 10h em São Paulo, depois do noturno das 3h (o padrão do intelligenceConfig)
const NOW = new Date('2026-10-26T13:00:00Z')
const YESTERDAY_NIGHTLY = new Date('2026-10-25T06:05:00Z')

function lastRuns(runs: Partial<Record<'NIGHTLY' | 'REFRESH' | 'PURGE', Date>>) {
  prismaMock.intelJobRun.findFirst.mockImplementation(async (args: { where: { job: string } }) => {
    const at = runs[args.where.job as keyof typeof runs]
    return at ? { startedAt: at } : null
  })
}

beforeEach(() => {
  resetPrismaMock()
  startMock.mockReset()
})

describe('selectJobsForTick', () => {
  it('liberada devolve os jobs vencidos', () => {
    expect(selectJobsForTick(['NIGHTLY', 'REFRESH'], false)).toEqual(['NIGHTLY', 'REFRESH'])
    expect(selectJobsForTick(['REFRESH'], false)).toEqual(['REFRESH'])
  })

  it('bloqueada com NIGHTLY vencido → só PURGE', () => {
    expect(selectJobsForTick(['NIGHTLY', 'REFRESH'], true)).toEqual(['PURGE'])
    expect(selectJobsForTick(['NIGHTLY'], true)).toEqual(['PURGE'])
  })

  it('bloqueada só com REFRESH → nada', () => {
    expect(selectJobsForTick(['REFRESH'], true)).toEqual([])
    expect(selectJobsForTick([], true)).toEqual([])
  })
})

describe('tickIntelScheduler com empresa bloqueada', () => {
  it('lê accessBlockedAt na mesma consulta das empresas', async () => {
    await tickIntelScheduler(NOW)
    expect(prismaMock.company.findMany.mock.calls[0][0]).toEqual({
      where: { active: true, intelligenceEnabled: true },
      select: { id: true, intelligenceConfig: true, accessBlockedAt: true },
    })
  })

  it('bloqueada e noturno vencido → startJobRun só com PURGE', async () => {
    prismaMock.company.findMany.mockResolvedValue([
      { id: 'c1', intelligenceConfig: null, accessBlockedAt: new Date('2026-10-25T12:00:00Z') },
    ])
    lastRuns({ NIGHTLY: YESTERDAY_NIGHTLY, REFRESH: new Date('2026-10-25T20:00:00Z') })
    await tickIntelScheduler(NOW)
    expect(startMock).toHaveBeenCalledTimes(1)
    expect(startMock).toHaveBeenCalledWith('c1', 'PURGE')
  })

  it('bloqueada com PURGE já rodado hoje → nenhum startJobRun', async () => {
    prismaMock.company.findMany.mockResolvedValue([
      { id: 'c1', intelligenceConfig: null, accessBlockedAt: new Date('2026-10-25T12:00:00Z') },
    ])
    lastRuns({
      NIGHTLY: YESTERDAY_NIGHTLY,
      REFRESH: new Date('2026-10-25T20:00:00Z'),
      PURGE: new Date('2026-10-26T06:01:00Z'),
    })
    await tickIntelScheduler(NOW)
    // E de novo um minuto depois: o PURGE não sai a cada tick
    await tickIntelScheduler(new Date(NOW.getTime() + 60_000))
    expect(startMock).not.toHaveBeenCalled()
  })

  it('liberada com o último NIGHTLY de dias atrás → NIGHTLY e REFRESH (o catch-up)', async () => {
    prismaMock.company.findMany.mockResolvedValue([
      { id: 'c1', intelligenceConfig: null, accessBlockedAt: null },
    ])
    lastRuns({
      NIGHTLY: new Date('2026-10-20T06:05:00Z'),
      REFRESH: new Date('2026-10-20T20:00:00Z'),
      // PURGEs da época do bloqueio não seguram o noturno da empresa liberada
      PURGE: new Date('2026-10-26T06:01:00Z'),
    })
    await tickIntelScheduler(NOW)
    expect(startMock.mock.calls).toEqual([
      ['c1', 'NIGHTLY'],
      ['c1', 'REFRESH'],
    ])
  })

  it('empresa sem o campo (mock antigo) segue como liberada', async () => {
    prismaMock.company.findMany.mockResolvedValue([{ id: 'c1', intelligenceConfig: null }])
    lastRuns({})
    await tickIntelScheduler(NOW)
    expect(startMock.mock.calls).toEqual([
      ['c1', 'NIGHTLY'],
      ['c1', 'REFRESH'],
    ])
  })
})
