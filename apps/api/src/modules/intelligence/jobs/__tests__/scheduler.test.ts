import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())
const captureErrorMock = vi.fn()
vi.mock('../../../../lib/sentry', () => ({
  captureError: (...args: unknown[]) => captureErrorMock(...args),
}))

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import {
  computeDueJobs,
  DB_ALERT_AFTER_TICKS,
  isTransientDbError,
  resetDbFailureStreak,
  tickIntelScheduler,
} from '../scheduler'

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

describe('tickIntelScheduler — queda de conexão com o banco (ADDERE-API-8)', () => {
  const unreachable = () =>
    Object.assign(new Error("Can't reach database server at `ep-x-pooler.neon.tech:5432`"), { code: 'P1001' })
  let log: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetDbFailureStreak()
    captureErrorMock.mockReset()
    log = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    resetPrismaMock()
    log.mockRestore()
  })

  it('reconhece os códigos de conexão do Prisma, e só eles', () => {
    expect(isTransientDbError(unreachable())).toBe(true)
    expect(isTransientDbError({ errorCode: 'P1001' })).toBe(true) // erro de inicialização
    expect(isTransientDbError({ code: 'P2022' })).toBe(false) // coluna faltando
    expect(isTransientDbError(new Error('boom'))).toBe(false)
  })

  it('piscada isolada não avisa o Sentry; queda que dura o limite de ticks avisa uma vez', async () => {
    prismaMock.company.findMany.mockRejectedValue(unreachable())
    for (let i = 1; i < DB_ALERT_AFTER_TICKS; i++) await tickIntelScheduler()
    expect(captureErrorMock).not.toHaveBeenCalled()

    await tickIntelScheduler()
    expect(captureErrorMock).toHaveBeenCalledTimes(1)
    expect(captureErrorMock.mock.calls[0][1]).toMatchObject({ dbFailureStreak: DB_ALERT_AFTER_TICKS })

    await tickIntelScheduler() // queda continua: não repete o alarme a cada minuto
    expect(captureErrorMock).toHaveBeenCalledTimes(1)
  })

  it('tick bom no meio zera a sequência', async () => {
    prismaMock.company.findMany.mockRejectedValueOnce(unreachable())
    prismaMock.company.findMany.mockRejectedValueOnce(unreachable())
    await tickIntelScheduler()
    await tickIntelScheduler()
    await tickIntelScheduler() // findMany volta a responder (padrão do mock: [])
    prismaMock.company.findMany.mockRejectedValue(unreachable())
    await tickIntelScheduler()
    await tickIntelScheduler()
    expect(captureErrorMock).not.toHaveBeenCalled()
  })

  it('falha na consulta por empresa (o caso do ADDERE-API-8) conta uma vez por tick', async () => {
    prismaMock.company.findMany.mockResolvedValue([
      { id: 'c1', intelligenceConfig: null },
      { id: 'c2', intelligenceConfig: null },
    ])
    prismaMock.intelJobRun.findFirst.mockRejectedValue(unreachable())
    for (let i = 1; i < DB_ALERT_AFTER_TICKS; i++) await tickIntelScheduler()
    expect(captureErrorMock).not.toHaveBeenCalled()
    await tickIntelScheduler()
    expect(captureErrorMock).toHaveBeenCalledTimes(1)
  })

  it('erro que não é de conexão continua avisando na hora', async () => {
    prismaMock.company.findMany.mockRejectedValueOnce(
      Object.assign(new Error('The column `companies.intelligenceConfig` does not exist'), { code: 'P2022' })
    )
    await tickIntelScheduler()
    expect(captureErrorMock).toHaveBeenCalledTimes(1)
  })
})
