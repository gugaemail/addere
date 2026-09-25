import { describe, it, expect } from 'vitest'
import {
  computeFreshness,
  computeHealthyPct,
  fixesToCsv,
  nextNightlyAt,
  parseRunSteps,
} from '../health.service'

describe('computeHealthyPct', () => {
  it('média simples arredondada', () => {
    expect(computeHealthyPct([100, 100, 100])).toBe(100)
    expect(computeHealthyPct([90, 80, 100])).toBe(90)
    expect(computeHealthyPct([])).toBe(100)
  })
})

describe('nextNightlyAt', () => {
  it('antes da hora → hoje às syncHour BRT', () => {
    // 04:00 UTC = 01:00 BRT — antes das 03h
    const next = nextNightlyAt(new Date('2026-08-21T04:00:00Z'), 3)
    expect(next.toISOString()).toBe('2026-08-21T06:00:00.000Z')
  })

  it('depois da hora → amanhã', () => {
    // 12:00 UTC = 09:00 BRT — já passou das 03h
    const next = nextNightlyAt(new Date('2026-08-21T12:00:00Z'), 3)
    expect(next.toISOString()).toBe('2026-08-22T06:00:00.000Z')
  })
})

describe('fixesToCsv', () => {
  it('cabeçalho + linhas com ; escapado', () => {
    const csv = fixesToCsv([
      { type: 'cliente_sem_cidade', code: '000123', detail: 'ACME; filial SP' },
    ])
    expect(csv.split('\n')).toEqual([
      'tipo;codigo;detalhe',
      'cliente_sem_cidade;000123;ACME, filial SP',
    ])
  })
})

describe('parseRunSteps', () => {
  it('lê os passos do noturno', () => {
    expect(
      parseRunSteps({ steps: [{ step: 'geo', ok: true }, { step: 'goals', ok: false, error: 'boom' }] })
    ).toEqual([
      { step: 'geo', ok: true, error: undefined },
      { step: 'goals', ok: false, error: 'boom' },
    ])
  })

  it('devolve vazio para metadata de outro formato', () => {
    // O backfill grava { kind:'backfill', done, total } no mesmo campo
    expect(parseRunSteps({ kind: 'backfill', done: 3, total: 10 })).toEqual([])
    expect(parseRunSteps(null)).toEqual([])
    expect(parseRunSteps(undefined)).toEqual([])
    expect(parseRunSteps({ steps: 'nao e array' })).toEqual([])
    expect(parseRunSteps({ steps: [null, 42, { semStep: true }] })).toEqual([])
  })
})

describe('computeFreshness', () => {
  const at = (iso: string) => new Date(iso)

  it('deriva GEO, SYNC e GOALS dos passos do noturno', () => {
    const fresh = computeFreshness([
      {
        job: 'NIGHTLY',
        status: 'OK',
        startedAt: at('2026-09-25T11:44:44Z'),
        metadata: {
          steps: [
            { step: 'sync:sales', ok: true },
            { step: 'geo', ok: true },
            { step: 'goals', ok: true },
          ],
        },
      },
    ])
    const byJob = Object.fromEntries(fresh.map((f) => [f.job, f]))
    expect(byJob.GEO).toEqual({
      job: 'GEO',
      lastRunAt: '2026-09-25T11:44:44.000Z',
      lastStatus: 'OK',
    })
    expect(byJob.SYNC.lastRunAt).toBe('2026-09-25T11:44:44.000Z')
    expect(byJob.GOALS.lastRunAt).toBe('2026-09-25T11:44:44.000Z')
    // PURGE não teve passo nem run próprio
    expect(byJob.PURGE).toEqual({ job: 'PURGE', lastRunAt: null, lastStatus: null })
  })

  it('passo que falhou marca o job como ERROR, e não o noturno inteiro', () => {
    const fresh = computeFreshness([
      {
        job: 'NIGHTLY',
        status: 'ERROR',
        startedAt: at('2026-09-25T03:35:03Z'),
        metadata: { steps: [{ step: 'geo', ok: false, error: '429' }, { step: 'goals', ok: true }] },
      },
    ])
    const byJob = Object.fromEntries(fresh.map((f) => [f.job, f]))
    expect(byJob.GEO.lastStatus).toBe('ERROR')
    expect(byJob.GOALS.lastStatus).toBe('OK')
  })

  it('um contrato falhando derruba o SYNC inteiro', () => {
    const fresh = computeFreshness([
      {
        job: 'NIGHTLY',
        status: 'ERROR',
        startedAt: at('2026-09-25T03:00:00Z'),
        metadata: { steps: [{ step: 'sync:sales', ok: true }, { step: 'sync:stock', ok: false }] },
      },
    ])
    expect(fresh.find((f) => f.job === 'SYNC')?.lastStatus).toBe('ERROR')
  })

  it('run próprio mais novo vence o passo mais velho', () => {
    const fresh = computeFreshness([
      { job: 'PURGE', status: 'OK', startedAt: at('2026-09-25T10:00:00Z') },
      {
        job: 'NIGHTLY',
        status: 'ERROR',
        startedAt: at('2026-09-24T03:00:00Z'),
        metadata: { steps: [{ step: 'purge', ok: false }] },
      },
    ])
    const purge = fresh.find((f) => f.job === 'PURGE')
    expect(purge?.lastRunAt).toBe('2026-09-25T10:00:00.000Z')
    expect(purge?.lastStatus).toBe('OK')
  })

  it('no mesmo run o status próprio vence o derivado', () => {
    const fresh = computeFreshness([
      {
        job: 'PURGE',
        status: 'OK',
        startedAt: at('2026-09-25T03:00:00Z'),
        metadata: { steps: [{ step: 'purge', ok: false }] },
      },
    ])
    expect(fresh.find((f) => f.job === 'PURGE')?.lastStatus).toBe('OK')
  })

  it('sem execução nenhuma, tudo nulo', () => {
    expect(computeFreshness([]).every((f) => f.lastRunAt === null)).toBe(true)
  })
})
