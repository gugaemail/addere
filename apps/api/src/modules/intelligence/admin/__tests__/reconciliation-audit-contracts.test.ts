// Reconciliação por contrato: títulos somam o saldo de hoje, clientes e
// produtos contam linhas, estoque não reconcilia.
import { describe, it, expect } from 'vitest'
import { auditReconciliation, type AuditInput } from '../reconciliation-audit'
import { QUERY_CONTRACTS } from '../../protheus-sql/contracts'

const base = (over: Partial<AuditInput>): AuditInput => ({
  name: 'SALES',
  spec: QUERY_CONTRACTS.SALES.reconciliation,
  rows: [],
  executedSql: 'SELECT 1',
  window: null,
  branches: ['0101'],
  pages: 1,
  pageSize: 100,
  truncated: false,
  source: 'protheus',
  endpointHost: 'erp.exemplo.com.br:8088',
  ...over,
})

describe('especificação dos contratos', () => {
  it('cada contrato declara como é reconciliado', () => {
    expect(QUERY_CONTRACTS.SALES.reconciliation).toMatchObject({ kind: 'SUM_MONTH', column: 'valor', unit: 'currency' })
    expect(QUERY_CONTRACTS.OPEN_TITLES.reconciliation).toMatchObject({
      kind: 'SUM_SNAPSHOT',
      column: 'valor_saldo',
      unit: 'currency',
      dateColumn: 'vencimento',
      dateGranularity: 'month',
    })
    expect(QUERY_CONTRACTS.CUSTOMERS.reconciliation).toMatchObject({ kind: 'COUNT_SNAPSHOT', unit: 'count' })
    expect(QUERY_CONTRACTS.PRODUCTS.reconciliation).toMatchObject({ kind: 'COUNT_SNAPSHOT', unit: 'count' })
    expect(QUERY_CONTRACTS.STOCK.reconciliation.kind).toBe('NONE')
  })

  it('a coluna somada existe entre as colunas do contrato', () => {
    for (const contract of Object.values(QUERY_CONTRACTS)) {
      const { column, dateColumn, keyColumns } = contract.reconciliation
      const names = contract.columns.map((c) => c.name)
      if (column) expect(names, contract.name).toContain(column)
      if (dateColumn) expect(names, contract.name).toContain(dateColumn)
      for (const key of keyColumns) expect(names, `${contract.name}.${key}`).toContain(key)
    }
  })
})

describe('títulos em aberto (soma do saldo na posição de hoje)', () => {
  const titulo = (titulo: string, vencimento: string, valor_saldo: number | string, extra: Record<string, unknown> = {}) => ({
    titulo,
    cliente_cod: '000217',
    cliente_loja: '01',
    vencimento,
    valor_saldo,
    ...extra,
  })

  it('soma valor_saldo e agrupa por mês de vencimento', () => {
    const { calcAmount, audit, concreteCauses } = auditReconciliation(
      base({
        name: 'OPEN_TITLES',
        spec: QUERY_CONTRACTS.OPEN_TITLES.reconciliation,
        rows: [
          titulo('000190431', '20260815', 1000),
          titulo('000190431', '20260915', '2.500,50'), // parcela 2, formato BR
          titulo('000190500', '20260920', 500),
        ],
      })
    )
    expect(calcAmount).toBe(4000.5)
    expect(audit).toMatchObject({ kind: 'SUM_SNAPSHOT', unit: 'currency', column: 'valor_saldo', window: null, distinctOrders: null })
    expect(audit.byDay).toEqual([
      { date: '202608', rows: 1, amount: '1000.00' },
      { date: '202609', rows: 2, amount: '3000.50' },
    ])
    // parcelas do mesmo título com vencimentos diferentes não são "chave repetida"
    expect(audit.duplicateKeys).toBe(0)
    expect(concreteCauses).toEqual([])
  })

  it('mesmo título, cliente e vencimento com saldos diferentes aponta JOIN multiplicando', () => {
    const { audit, concreteCauses } = auditReconciliation(
      base({
        name: 'OPEN_TITLES',
        spec: QUERY_CONTRACTS.OPEN_TITLES.reconciliation,
        rows: [titulo('T1', '20260915', 100, { e1_tipo: 'NF' }), titulo('T1', '20260915', 100, { e1_tipo: 'AB-' })],
      })
    )
    expect(audit.duplicateKeys).toBe(1)
    expect(concreteCauses[0]).toMatch(/titulo \+ cliente_cod \+ cliente_loja \+ vencimento/)
  })
})

describe('clientes e produtos (contagem)', () => {
  it('conta as linhas, sem valor, e acusa cliente+loja repetido', () => {
    const { calcAmount, audit, concreteCauses } = auditReconciliation(
      base({
        name: 'CUSTOMERS',
        spec: QUERY_CONTRACTS.CUSTOMERS.reconciliation,
        rows: [
          { cliente_cod: '000217', cliente_loja: '01', cliente_nome: 'A', vendedor_cod: '020' },
          { cliente_cod: '000217', cliente_loja: '02', cliente_nome: 'A filial', vendedor_cod: '020' },
          { cliente_cod: '000217', cliente_loja: '01', cliente_nome: 'A', vendedor_cod: '123' },
        ],
      })
    )
    expect(calcAmount).toBe(3)
    expect(audit).toMatchObject({ kind: 'COUNT_SNAPSHOT', unit: 'count', column: null, invalidValues: 0, byDay: [] })
    expect(audit.summary).toBe('3 linha(s) em 1 página(s)')
    expect(audit.duplicateKeys).toBe(1)
    expect(concreteCauses[0]).toMatch(/cliente_cod \+ cliente_loja/)
  })

  it('produtos contam linhas e o total por filial não traz valor', () => {
    const { calcAmount, audit } = auditReconciliation(
      base({
        name: 'PRODUCTS',
        spec: QUERY_CONTRACTS.PRODUCTS.reconciliation,
        branches: ['0101', '0102'],
        rows: [
          { produto_cod: 'P1', produto_desc: 'A', grupo: 'G', ativo: 'S', b1_filial: '01' },
          { produto_cod: 'P2', produto_desc: 'B', grupo: 'G', ativo: 'S', b1_filial: '02' },
        ],
      })
    )
    expect(calcAmount).toBe(2)
    expect(audit.byBranch).toEqual([
      { branch: '01', rows: 1, amount: '' },
      { branch: '02', rows: 1, amount: '' },
    ])
  })
})
