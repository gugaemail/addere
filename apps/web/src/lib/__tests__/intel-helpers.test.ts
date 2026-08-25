import { describe, expect, it } from 'vitest'
import {
  backfillProgress,
  brl,
  formatDiffPct,
  needsActiveCompany,
  parseCities,
  periodLabel,
  weightsSum,
  weightsValid,
} from '../intel-helpers'

describe('weightsSum/weightsValid', () => {
  it('soma só os três pesos e valida 100', () => {
    const ok = { weight_value: 40, weight_urgency: 35, weight_risk: 25, late_factor: 1.3 }
    expect(weightsSum(ok)).toBe(100)
    expect(weightsValid(ok)).toBe(true)
    expect(weightsValid({ weight_value: 50, weight_urgency: 30, weight_risk: 25 })).toBe(false)
  })

  it('ignora valores não numéricos', () => {
    expect(weightsSum({ weight_value: '40', weight_urgency: 35, weight_risk: 25 })).toBe(60)
  })
})

describe('formatDiffPct', () => {
  it('sinal e vírgula decimal', () => {
    expect(formatDiffPct(1.3)).toBe('+1,30%')
    expect(formatDiffPct(-0.8)).toBe('-0,80%')
    expect(formatDiffPct(0)).toBe('0,00%')
    expect(formatDiffPct(null)).toBe('—')
  })
})

describe('backfillProgress', () => {
  it('lê o metadata do job SYNC de backfill', () => {
    expect(backfillProgress({ kind: 'backfill', contract: 'SALES', done: 4, total: 13 })).toEqual({
      contract: 'SALES',
      done: 4,
      total: 13,
      pct: 31,
    })
  })

  it('rejeita metadata de outro tipo ou malformado', () => {
    expect(backfillProgress(null)).toBeNull()
    expect(backfillProgress({ kind: 'outro' })).toBeNull()
    expect(backfillProgress({ kind: 'backfill', done: 'x', total: 13 })).toBeNull()
    expect(backfillProgress({ kind: 'backfill', done: 1, total: 0 })).toBeNull()
  })

  it('clampa done dentro de [0, total]', () => {
    expect(backfillProgress({ kind: 'backfill', contract: 'SALES', done: 99, total: 13 })?.pct).toBe(100)
  })
})

describe('periodLabel/brl/parseCities', () => {
  it('YYYYMM → MM/YYYY', () => {
    expect(periodLabel('202607')).toBe('07/2026')
    expect(periodLabel('abc')).toBe('—')
    expect(periodLabel(null)).toBe('—')
  })

  it('brl formata strings Decimal da API', () => {
    expect(brl('1234.5')).toMatch(/1\.234,50/)
    expect(brl(null)).toBe('—')
    expect(brl('abc')).toBe('—')
  })

  it('parseCities separa por vírgula e limpa vazios', () => {
    expect(parseCities(' Campinas , Valinhos ,, ')).toEqual(['Campinas', 'Valinhos'])
    expect(parseCities('')).toEqual([])
  })
})

describe('needsActiveCompany', () => {
  it('SUPERADMIN sem empresa escolhida precisa escolher', () => {
    expect(needsActiveCompany(true, null)).toBe(true)
  })

  it('SUPERADMIN com empresa escolhida segue direto', () => {
    expect(needsActiveCompany(true, 'company-1')).toBe(false)
  })

  it('quem não é SUPERADMIN nunca precisa — o tenant vem do próprio token', () => {
    expect(needsActiveCompany(false, null)).toBe(false)
  })
})
