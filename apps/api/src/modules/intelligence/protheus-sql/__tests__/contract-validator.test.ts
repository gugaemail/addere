import { describe, it, expect } from 'vitest'
import { validateResultAgainstContract } from '../contract-validator'
import { QUERY_CONTRACTS } from '../contracts'
import { mapColumnarPage } from '../sql-api.adapter'

const SALES = QUERY_CONTRACTS.SALES

const okRow = {
  pedido: 'PED1',
  item: '01',
  data: '20260801',
  cliente_cod: 'C0001',
  cliente_loja: '01',
  vendedor_cod: '000001',
  produto_cod: 'P001',
  quantidade: 2,
  valor: '150,50',
}

describe('contract-validator', () => {
  it('aprova resultado válido de vendas', () => {
    const r = validateResultAgainstContract(SALES, [okRow, { ...okRow, item: '02' }])
    expect(r.ok).toBe(true)
    expect(r.stats.distinctOrders).toBe(1)
    expect(r.stats.duplicateKeys).toBe(0)
  })

  it('reprova quando falta coluna obrigatória', () => {
    const { valor: _valor, ...semValor } = okRow
    const r = validateResultAgainstContract(SALES, [semValor])
    const check = r.checks.find((c) => c.key === 'required_columns')
    expect(check?.ok).toBe(false)
    expect(check?.detail).toContain('valor')
  })

  it('reprova prévia sem linhas', () => {
    const r = validateResultAgainstContract(SALES, [])
    expect(r.checks.find((c) => c.key === 'required_columns')?.ok).toBe(false)
  })

  it('aceita vírgula decimal em número e valida data YYYYMMDD', () => {
    const r = validateResultAgainstContract(SALES, [okRow])
    expect(r.checks.find((c) => c.key === 'column_types')?.ok).toBe(true)
  })

  it('reprova número e data inválidos', () => {
    const r = validateResultAgainstContract(SALES, [{ ...okRow, valor: 'abc', data: '01/08/2026' }])
    const check = r.checks.find((c) => c.key === 'column_types')
    expect(check?.ok).toBe(false)
    expect(check?.detail).toMatch(/valor/)
    expect(check?.detail).toMatch(/data/)
  })

  it('detecta chave duplicada (mesmo pedido+item+produto)', () => {
    const r = validateResultAgainstContract(SALES, [okRow, { ...okRow }])
    const check = r.checks.find((c) => c.key === 'duplicate_keys')
    expect(check?.ok).toBe(false)
    expect(check?.detail).toContain('item')
  })

  it('fan-out alto reprova (JOIN multiplicando)', () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({ ...okRow, item: String(i) }))
    const r = validateResultAgainstContract(SALES, rows)
    expect(r.checks.find((c) => c.key === 'fan_out')?.ok).toBe(false)
  })

  it('colunas opcionais vazias não reprovam tipos', () => {
    const r = validateResultAgainstContract(SALES, [{ ...okRow, grupo_produto: '' }])
    expect(r.checks.find((c) => c.key === 'column_types')?.ok).toBe(true)
  })
})

// Regressão (14/09/2026): com a resposta real do WSQUERY em MAIÚSCULAS, as
// checagens de vendas liam colunas vazias — "88 linhas duplicadas" e
// "1 pedido/1 cliente" falsos. O adapter normaliza; aqui, ponta a ponta.
describe('prévia de vendas com a resposta real do WSQUERY', () => {
  it('não acusa duplicidade nem fan-out quando o endpoint manda colunas em maiúsculas', () => {
    const base = { DATA: '20260908', CLIENTE_LOJA: '01', QUANTIDADE: 1, VALOR: 10 }
    const rows = mapColumnarPage(
      {
        items: [
          { ...base, PEDIDO: '0000200811', ITEM: '01', CLIENTE_COD: '003086', VENDEDOR_COD: '137', PRODUTO_COD: 'E009G280C300' },
          { ...base, PEDIDO: '0000200811', ITEM: '02', CLIENTE_COD: '003086', VENDEDOR_COD: '137', PRODUTO_COD: 'CFFR41' },
          { ...base, PEDIDO: '0000200821', ITEM: '01', CLIENTE_COD: '003022', VENDEDOR_COD: '113', PRODUTO_COD: 'CFFE44' },
          { ...base, PEDIDO: '0000200821', ITEM: '02', CLIENTE_COD: '003022', VENDEDOR_COD: '113', PRODUTO_COD: 'CFFE44' },
        ],
      },
      { columnsField: 'columns', rowsField: 'items' }
    )
    const result = validateResultAgainstContract(SALES, rows)
    expect(result.stats).toMatchObject({ rows: 4, distinctOrders: 2, distinctCustomers: 2, duplicateKeys: 0 })
    expect(result.checks.find((c) => c.key === 'duplicate_keys')?.ok).toBe(true)
    expect(result.checks.find((c) => c.key === 'fan_out')?.ok).toBe(true)
    expect(result.ok).toBe(true)
  })
})
