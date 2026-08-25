import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { computeDueJobs, tickIntelScheduler } from '../scheduler'

// Horários em UTC; São Paulo = UTC-3 (sem horário de verão desde 2019)
const at = (iso: string) => new Date(iso)

const base = { syncHour: 3, syncEveryHours: 4, lastNightlyAt: null, lastRefreshAt: null }

describe('computeDueJobs — nightly', () => {
  it('vence a partir da hora configurada (03h BRT = 06h UTC)', () => {
    expect(
      computeDueJobs({ ...base, now: at('2026-08-21T05:59:00Z') })
    ).not.toContain('NIGHTLY')
    expect(computeDueJobs({ ...base, now: at('2026-08-21T06:01:00Z') })).toContain('NIGHTLY')
  })

  it('não roda duas vezes no mesmo dia', () => {
    const due = computeDueJobs({
      ...base,
      now: at('2026-08-21T10:00:00Z'),
      lastNightlyAt: at('2026-08-21T06:01:00Z'),
    })
    expect(due).not.toContain('NIGHTLY')
  })

  it('catch-up: boot às 10h sem execução hoje → dispara (D5)', () => {
    const due = computeDueJobs({
      ...base,
      now: at('2026-08-21T13:00:00Z'), // 10h BRT
      lastNightlyAt: at('2026-08-20T06:01:00Z'), // ontem
    })
    expect(due).toContain('NIGHTLY')
  })

  it('respeita a virada de dia em São Paulo, não em UTC', () => {
    // 01:00 UTC do dia 22 = 22h BRT do dia 21 — nightly do dia 21 já rodou
    const due = computeDueJobs({
      ...base,
      now: at('2026-08-22T01:00:00Z'),
      lastNightlyAt: at('2026-08-21T06:05:00Z'),
    })
    expect(due).not.toContain('NIGHTLY')
  })
})

describe('computeDueJobs — refresh', () => {
  it('vence a cada syncEveryHours', () => {
    const now = at('2026-08-21T12:00:00Z')
    expect(
      computeDueJobs({ ...base, now, lastRefreshAt: at('2026-08-21T09:00:00Z') })
    ).not.toContain('REFRESH')
    expect(
      computeDueJobs({ ...base, now, lastRefreshAt: at('2026-08-21T07:59:00Z') })
    ).toContain('REFRESH')
  })

  it('sem execução anterior → vence imediatamente', () => {
    expect(computeDueJobs({ ...base, now: at('2026-08-21T12:00:00Z') })).toContain('REFRESH')
  })
})

describe('tickIntelScheduler — resiliência', () => {
  afterEach(() => resetPrismaMock())

  // O tick roda solto (`void`) no boot e no setInterval: se ele rejeitar, o Node
  // encerra o processo e a API inteira cai por causa de um job de segundo plano.
  // Foi o que aconteceu na staging com `companies.intelligenceConfig` faltando.
  it('engole falha do banco em vez de derrubar o processo', async () => {
    prismaMock.company.findMany.mockRejectedValueOnce(
      new Error('The column `companies.intelligenceConfig` does not exist in the current database.')
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(tickIntelScheduler()).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith(
      '[intel-scheduler] falha ao listar empresas:',
      expect.stringContaining('intelligenceConfig')
    )

    log.mockRestore()
  })

  it('sem empresas com a Inteligência ligada, não faz nada', async () => {
    await expect(tickIntelScheduler()).resolves.toBeUndefined()
    expect(prismaMock.intelJobRun.findFirst).not.toHaveBeenCalled()
  })
})
