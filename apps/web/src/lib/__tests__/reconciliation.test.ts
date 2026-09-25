import { describe, it, expect } from 'vitest'
import type { ReconciliationAudit, ReconciliationSpec } from '@addere/types'
import {
  auditFlags,
  auditSummaryLine,
  dateGroupTitle,
  formatMetric,
  parseOfficialNumber,
  reconciliationCopy,
  sumAmounts,
  ymdLabel,
} from '../reconciliation'

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
  kind: 'SUM_MONTH',
  unit: 'currency',
  column: 'valor',
  keyColumns: ['pedido', 'item', 'produto_cod'],
  duplicateRows: 0,
  duplicateKeys: 0,
  invalidValues: 0,
  distinctOrders: 109,
  dateColumn: 'data',
  dateGranularity: 'day',
  byDay: [
    { date: '20260105', rows: 10, amount: '15241.35' },
    { date: '20260107', rows: 20, amount: '56109.27' },
  ],
  branchColumn: null,
  byBranch: [],
  summary: '',
  ...over,
})

const spec = (kind: ReconciliationSpec['kind']): ReconciliationSpec => ({
  kind,
  column: null,
  unit: null,
  label: '',
  hint: '',
  dateColumn: null,
  dateGranularity: null,
  keyColumns: [],
})

describe('ymdLabel', () => {
  it('formata dia e mês e deixa o resto como veio', () => {
    expect(ymdLabel('20260105')).toBe('05/01/2026')
    expect(ymdLabel('202609')).toBe('09/2026')
    expect(ymdLabel('sem data')).toBe('sem data')
  })
})

describe('formatMetric', () => {
  it('moeda em R$ e quantidade como inteiro', () => {
    expect(formatMetric('1608493.84', 'currency')).toBe('R$ 1.608.493,84'.replace(' ', String.fromCharCode(160)))
    expect(formatMetric(1240, 'count')).toBe('1.240')
    expect(formatMetric(null, 'count')).toBe('—')
  })
})

describe('parseOfficialNumber', () => {
  it('moeda aceita formato brasileiro e ponto decimal', () => {
    expect(parseOfficialNumber('1.608.493,84', 'currency')).toBe(1608493.84)
    expect(parseOfficialNumber('63707,07', 'currency')).toBe(63707.07)
    expect(parseOfficialNumber('R$ 10.50', 'currency')).toBe(10.5)
    expect(parseOfficialNumber('', 'currency')).toBeNull()
  })

  it('quantidade aceita milhar com ponto e recusa fração', () => {
    expect(parseOfficialNumber('1.240', 'count')).toBe(1240)
    expect(parseOfficialNumber('139', 'count')).toBe(139)
    expect(parseOfficialNumber('12,5', 'count')).toBeNull()
  })
})

describe('reconciliationCopy', () => {
  it('só vendas pede mês; estoque não se aplica', () => {
    expect(reconciliationCopy(spec('SUM_MONTH'))).toMatchObject({ needsMonth: true, applies: true })
    expect(reconciliationCopy(spec('SUM_SNAPSHOT'))).toMatchObject({ needsMonth: false, applies: true })
    expect(reconciliationCopy(spec('COUNT_SNAPSHOT'))).toMatchObject({ needsMonth: false, applies: true })
    expect(reconciliationCopy(spec('NONE'))).toMatchObject({
      applies: false,
      pendingText: 'não se aplica',
      publishRequirement: 'Exige só a prévia ok.',
    })
  })
})

describe('auditSummaryLine', () => {
  it('resume linhas, páginas, pedidos, filiais e período', () => {
    expect(auditSummaryLine(audit())).toBe(
      '236 linhas em 3 páginas de até 100 · 109 pedidos · filial 0101 · 01/01/2026 a 31/01/2026'
    )
  })

  it('posição de hoje quando não há janela (títulos, clientes, produtos)', () => {
    expect(
      auditSummaryLine(audit({ rows: 1, pages: 1, pageSize: null, distinctOrders: null, branches: ['0101', '0102'], window: null }))
    ).toBe('1 linha em 1 página · filiais 0101, 0102 · posição de hoje')
  })
})

describe('dateGroupTitle', () => {
  it('dia para vendas, mês de vencimento para títulos, nada sem coluna de data', () => {
    expect(dateGroupTitle(audit())).toBe('Por dia')
    expect(dateGroupTitle(audit({ dateColumn: 'vencimento', dateGranularity: 'month' }))).toBe('Por mês de vencimento')
    expect(dateGroupTitle(audit({ dateColumn: null, dateGranularity: null }))).toBeNull()
  })
})

describe('auditFlags', () => {
  it('resultado limpo não gera sinal', () => {
    expect(auditFlags(audit())).toEqual([])
  })

  it('ordena por gravidade e usa a chave do contrato', () => {
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
    expect(flags[3].text).toBe('5 pedido+item+produto_cod repetido(s)')
  })
})

describe('sumAmounts', () => {
  it('soma os valores em texto com arredondamento de centavos', () => {
    expect(sumAmounts(audit().byDay)).toBe(71350.62)
  })
})
