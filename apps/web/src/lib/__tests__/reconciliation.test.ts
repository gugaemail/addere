import { describe, it, expect } from 'vitest'
import type { ReconciliationAudit } from '@addere/types'
import { auditFlags, auditSummaryLine, sumAmounts, ymdLabel } from '../reconciliation'

const audit = (over: Partial<ReconciliationAudit> = {}): ReconciliationAudit => ({
  source: 'protheus',
  endpointHost: 'erp.exemplo.com.br:8088',
  executedSql: 'SELECT 1',
  window: { dataIni: '20260101', dataFim: '20260131' },
  branches: ['0101'],
  rows: 236,
  pages: 3,
  pageSize: 100,
  truncated: false,
  duplicateRows: 0,
  duplicateKeys: 0,
  invalidValues: 0,
  distinctOrders: 109,
  byDay: [
    { date: '20260105', rows: 10, amount: '15241.35' },
    { date: '20260107', rows: 20, amount: '56109.27' },
  ],
  branchColumn: null,
  byBranch: [],
  summary: '',
  ...over,
})

describe('ymdLabel', () => {
  it('formata YYYYMMDD e deixa o resto como veio', () => {
    expect(ymdLabel('20260105')).toBe('05/01/2026')
    expect(ymdLabel('sem data')).toBe('sem data')
  })
})

describe('auditSummaryLine', () => {
  it('resume linhas, páginas, pedidos, filiais e período', () => {
    expect(auditSummaryLine(audit())).toBe(
      '236 linhas em 3 páginas de até 100 · 109 pedidos · filial 0101 · 01/01/2026 a 31/01/2026'
    )
  })

  it('singular, várias filiais e sem tamanho de página (dados sintéticos)', () => {
    expect(
      auditSummaryLine(audit({ rows: 1, pages: 1, pageSize: null, distinctOrders: 1, branches: ['0101', '0102'] }))
    ).toBe('1 linha em 1 página · 1 pedido · filiais 0101, 0102 · 01/01/2026 a 31/01/2026')
  })
})

describe('auditFlags', () => {
  it('resultado limpo não gera sinal', () => {
    expect(auditFlags(audit())).toEqual([])
  })

  it('ordena por gravidade: sintético, cortado, repetido, depois avisos', () => {
    const flags = auditFlags(
      audit({
        source: 'mock',
        truncated: true,
        duplicateRows: 2,
        duplicateKeys: 5,
        invalidValues: 1,
        branches: ['0101', '0102'],
      })
    )
    expect(flags.map((f) => f.tone)).toEqual(['danger', 'danger', 'danger', 'warning', 'warning', 'warning'])
    expect(flags[0].text).toMatch(/sintéticos/)
    expect(flags[3].text).toBe('3 pedido+item+produto repetido(s)')
  })
})

describe('sumAmounts', () => {
  it('soma os valores em texto com arredondamento de centavos', () => {
    expect(sumAmounts(audit().byDay)).toBe(71350.62)
  })
})
