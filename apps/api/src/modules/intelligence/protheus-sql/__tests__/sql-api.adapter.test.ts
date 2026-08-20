import { describe, it, expect } from 'vitest'
import { mapColumnarPage, MockSqlAdapter, resolveSqlApiConfig } from '../sql-api.adapter'

const REF = new Date('2026-08-20T12:00:00Z')
const company = {
  id: 'tenant-1',
  apiSql: null,
  apiToken: null,
  usrProtheus: null,
  passProtheus: null,
}

describe('mapColumnarPage', () => {
  it('mapeia resposta colunar (colunas como strings)', () => {
    const rows = mapColumnarPage(
      {
        colunas: ['a', 'b'],
        linhas: [
          [1, 'x'],
          [2, null],
        ],
      },
      { columnsField: 'colunas', rowsField: 'linhas' }
    )
    expect(rows).toEqual([
      { a: 1, b: 'x' },
      { a: 2, b: null },
    ])
  })

  it('mapeia colunas como objetos {nome}', () => {
    const rows = mapColumnarPage(
      { colunas: [{ nome: 'a' }], linhas: [[9]] },
      { columnsField: 'colunas', rowsField: 'linhas' }
    )
    expect(rows).toEqual([{ a: 9 }])
  })

  it('fallback: linhas já como objetos', () => {
    const rows = mapColumnarPage(
      { linhas: [{ a: 1 }] },
      { columnsField: 'colunas', rowsField: 'linhas' }
    )
    expect(rows).toEqual([{ a: 1 }])
  })

  it('resposta sem linhas → vazio', () => {
    expect(mapColumnarPage({}, { columnsField: 'colunas', rowsField: 'linhas' })).toEqual([])
  })
})

describe('resolveSqlApiConfig', () => {
  it('usa defaults e aceita override por syncConfig.sqlApi', () => {
    expect(resolveSqlApiConfig(null).sqlField).toBe('sql')
    expect(resolveSqlApiConfig({ sqlApi: { sqlField: 'cQuery' } }).sqlField).toBe('cQuery')
  })
})

describe('MockSqlAdapter', () => {
  it('é determinístico por companyId', async () => {
    const a = await new MockSqlAdapter(REF).run(company, 'SELECT 1', { queryName: 'CUSTOMERS' })
    const b = await new MockSqlAdapter(REF).run(company, 'SELECT 1', { queryName: 'CUSTOMERS' })
    expect(a.rows).toEqual(b.rows)
    expect(a.rows).toHaveLength(40)
  })

  it('empresas diferentes geram dados diferentes', async () => {
    const a = await new MockSqlAdapter(REF).run(company, 'S', { queryName: 'SALES' })
    const b = await new MockSqlAdapter(REF).run({ ...company, id: 'tenant-2' }, 'S', {
      queryName: 'SALES',
    })
    expect(a.rows).not.toEqual(b.rows)
  })

  it('gera 13 meses de vendas com colunas do contrato', async () => {
    const r = await new MockSqlAdapter(REF).run(company, 'S', { queryName: 'SALES' })
    expect(r.rows.length).toBeGreaterThan(200)
    const row = r.rows[0]
    for (const col of [
      'pedido',
      'item',
      'data',
      'cliente_cod',
      'produto_cod',
      'quantidade',
      'valor',
    ]) {
      expect(row).toHaveProperty(col)
    }
  })

  it('filtra vendas pela janela BETWEEN do SQL', async () => {
    const all = await new MockSqlAdapter(REF).run(company, 'S', { queryName: 'SALES' })
    const windowed = await new MockSqlAdapter(REF).run(
      company,
      "WHERE D2_EMISSAO BETWEEN '20260801' AND '20260820'",
      { queryName: 'SALES' }
    )
    expect(windowed.rows.length).toBeLessThan(all.rows.length)
    for (const row of windowed.rows) {
      expect(String(row.data) >= '20260801' && String(row.data) <= '20260820').toBe(true)
    }
  })

  it('aplica maxRows com truncated', async () => {
    const r = await new MockSqlAdapter(REF).run(company, 'S', { queryName: 'SALES', maxRows: 10 })
    expect(r.rows).toHaveLength(10)
    expect(r.truncated).toBe(true)
  })

  it('exige queryName', async () => {
    await expect(new MockSqlAdapter(REF).run(company, 'S')).rejects.toThrow(/queryName/)
  })

  it('inclui clientes bloqueados e títulos vencidos coerentes', async () => {
    const customers = await new MockSqlAdapter(REF).run(company, 'S', { queryName: 'CUSTOMERS' })
    const titles = await new MockSqlAdapter(REF).run(company, 'S', { queryName: 'OPEN_TITLES' })
    const blocked = customers.rows.filter((c) => c.bloqueado === '1')
    expect(blocked.length).toBeGreaterThan(0)
    for (const b of blocked) {
      const title = titles.rows.find((t) => t.cliente_cod === b.cliente_cod)
      expect(title).toBeDefined()
      expect(Number(title!.dias_atraso)).toBeGreaterThan(0)
    }
  })
})
