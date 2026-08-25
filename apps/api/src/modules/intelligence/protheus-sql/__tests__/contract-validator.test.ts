import { describe, it, expect } from 'vitest'
import { validateResultAgainstContract } from '../contract-validator'
import { QUERY_CONTRACTS } from '../contracts'

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
