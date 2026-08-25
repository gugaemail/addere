import { describe, expect, it } from 'vitest'
import {
  backfillProgress,
  brl,
  formatDiffPct,
  needsActiveCompany,
  parseCities,
  periodLabel,
  pctLabel,
  ppLabel,
  dayLabel,
  rangeLabel,
  todayInSaoPaulo,
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
    expect(
      backfillProgress({ kind: 'backfill', contract: 'SALES', done: 99, total: 13 })?.pct
    ).toBe(100)
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

describe('pctLabel/ppLabel', () => {
  it('null vira travessão — não 0%', () => {
    // "sem plano" e "0% de aderência" são acusações diferentes na tela do gerente
    expect(pctLabel(null)).toBe('—')
    expect(pctLabel(undefined)).toBe('—')
    expect(pctLabel(0)).toBe('0%')
  })

  it('percentual com vírgula decimal', () => {
    expect(pctLabel(37.5)).toBe('37,5%')
    expect(pctLabel(100)).toBe('100%')
  })

  it('pontos percentuais levam sinal', () => {
    expect(ppLabel(12.5)).toBe('+12,5 p.p.')
    expect(ppLabel(-8)).toBe('-8 p.p.')
    expect(ppLabel(null)).toBe('—')
  })
})

describe('dayLabel/rangeLabel', () => {
  it('dia isolado sai com ano', () => {
    expect(rangeLabel({ fromYmd: '20260825', toYmd: '20260825' })).toBe('25/08/2026')
  })

  it('intervalo no mesmo ano omite o ano do início', () => {
    expect(rangeLabel({ fromYmd: '20260824', toYmd: '20260830' })).toBe('24/08 a 30/08/2026')
  })

  it('intervalo que cruza o ano mostra os dois anos', () => {
    expect(rangeLabel({ fromYmd: '20261228', toYmd: '20270103' })).toBe('28/12/2026 a 03/01/2027')
  })

  it('formato inesperado não quebra a tela', () => {
    expect(dayLabel('2026-08-25')).toBe('—')
  })
})

describe('todayInSaoPaulo', () => {
  it('usa o dia civil de São Paulo, não o UTC', () => {
    // 26/08 00:30 UTC ainda é 25/08 em São Paulo (UTC−3)
    expect(todayInSaoPaulo(new Date('2026-08-26T00:30:00Z'))).toBe('2026-08-25')
    expect(todayInSaoPaulo(new Date('2026-08-25T12:00:00Z'))).toBe('2026-08-25')
  })
})
