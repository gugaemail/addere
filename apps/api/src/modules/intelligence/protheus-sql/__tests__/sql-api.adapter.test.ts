import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mapColumnarPage,
  MockSqlAdapter,
  ProtheusSqlAdapter,
  resolveSqlApiConfig,
} from '../sql-api.adapter'
import { protheusPost } from '../../../sync/protheus.client'

vi.mock('../../../sync/protheus.client', () => ({ protheusPost: vi.fn() }))
vi.mock('../../../sync/protheus-logger', () => ({ logProtheusCall: vi.fn() }))
vi.mock('../../../sync/utils', () => ({
  getCredentials: vi.fn(() => ({
    apiToken: 'https://erp/token',
    usrProtheus: 'user',
    passProtheus: 'pass',
    syncConfig: null,
  })),
}))

const protheusPostMock = vi.mocked(protheusPost)

const REF = new Date('2026-08-20T12:00:00Z')
const company = {
  id: 'tenant-1',
  apiSql: null as string | null,
  apiToken: null,
  usrProtheus: null,
  passProtheus: null,
}
const realCompany = {
  ...company,
  apiSql: 'https://erp/api/sql',
  syncConfig: { sqlApi: { pageSize: 2 } },
}

// Página no formato real confirmado pelo consultor (20/08/2026)
const page = (n: number, items: Record<string, string | number>[], hasNext: boolean) => ({
  success: true,
  page: n,
  pageSize: 2,
  count: items.length,
  hasNext,
  columns: [
    { name: 'D2_COD', type: 'C' },
    { name: '202601', type: 'N' },
  ],
  items,
})

describe('mapColumnarPage', () => {
  const cfg = { columnsField: 'columns', rowsField: 'items' }

  it('mapeia o formato real: columns [{name,type}] + items como objetos', () => {
    const rows = mapColumnarPage(
      page(1, [{ D2_COD: 'CFD30', '202601': 25147.22 }], true) as unknown as Record<
        string,
        unknown
      >,
      cfg
    )
    expect(rows).toEqual([{ D2_COD: 'CFD30', '202601': 25147.22 }])
  })

  it('mapeia resposta colunar (colunas como strings, linhas como arrays)', () => {
    const rows = mapColumnarPage(
      {
        columns: ['a', 'b'],
        items: [
          [1, 'x'],
          [2, null],
        ],
      },
      cfg
    )
    expect(rows).toEqual([
      { a: 1, b: 'x' },
      { a: 2, b: null },
    ])
  })

  it('mapeia colunas como objetos {name} e {nome}', () => {
    expect(mapColumnarPage({ columns: [{ name: 'a' }], items: [[9]] }, cfg)).toEqual([{ a: 9 }])
    expect(mapColumnarPage({ columns: [{ nome: 'a' }], items: [[9]] }, cfg)).toEqual([{ a: 9 }])
  })

  it('resposta sem items → vazio', () => {
    expect(mapColumnarPage({}, cfg)).toEqual([])
  })
})

describe('resolveSqlApiConfig', () => {
  it('usa os defaults do contrato real e aceita override por syncConfig.sqlApi', () => {
    const def = resolveSqlApiConfig(null)
    expect(def.sqlField).toBe('query')
    expect(def.columnsField).toBe('columns')
    expect(def.rowsField).toBe('items')
    expect(def.pageField).toBe('page')
    expect(def.pageSizeField).toBe('pageSize')
    expect(def.hasNextField).toBe('hasNext')
    expect(resolveSqlApiConfig({ sqlApi: { sqlField: 'cQuery' } }).sqlField).toBe('cQuery')
  })
})

describe('ProtheusSqlAdapter', () => {
  beforeEach(() => {
    protheusPostMock.mockReset()
  })

  it('envia {query, page, pageSize} e pagina enquanto hasNext=true', async () => {
    protheusPostMock
      .mockResolvedValueOnce(
        page(
          1,
          [
            { D2_COD: 'CFD30', '202601': 20 },
            { D2_COD: 'CFD31', '202601': 0 },
          ],
          true
        )
      )
      .mockResolvedValueOnce(page(2, [{ D2_COD: 'CFD32', '202601': 63 }], false))

    const r = await new ProtheusSqlAdapter().run(realCompany, 'SELECT 1', { queryName: 'SALES' })

    expect(r.rows).toHaveLength(3)
    expect(r.pages).toBe(2)
    expect(r.truncated).toBe(false)
    expect(protheusPostMock).toHaveBeenCalledTimes(2)
    expect(protheusPostMock.mock.calls[0][2]).toEqual({ query: 'SELECT 1', page: 1, pageSize: 2 })
    expect(protheusPostMock.mock.calls[1][2]).toEqual({ query: 'SELECT 1', page: 2, pageSize: 2 })
  })

  it('para na primeira página quando hasNext=false', async () => {
    protheusPostMock.mockResolvedValueOnce(page(1, [{ D2_COD: 'A', '202601': 1 }], false))
    const r = await new ProtheusSqlAdapter().run(realCompany, 'SELECT 1')
    expect(r.pages).toBe(1)
    expect(protheusPostMock).toHaveBeenCalledTimes(1)
  })

  it('sem hasNext na resposta, para quando a página vem incompleta', async () => {
    const legacy = { items: [{ a: 1 }] } // 1 linha < pageSize 2, sem hasNext
    protheusPostMock.mockResolvedValueOnce(legacy)
    const r = await new ProtheusSqlAdapter().run(realCompany, 'SELECT 1')
    expect(r.rows).toEqual([{ a: 1 }])
    expect(r.pages).toBe(1)
  })

  it('aplica maxRows cortando a paginação com truncated', async () => {
    protheusPostMock.mockResolvedValue(
      page(
        1,
        [
          { D2_COD: 'A', '202601': 1 },
          { D2_COD: 'B', '202601': 2 },
        ],
        true
      )
    )
    const r = await new ProtheusSqlAdapter().run(realCompany, 'SELECT 1', { maxRows: 3 })
    expect(r.rows).toHaveLength(3)
    expect(r.truncated).toBe(true)
  })

  it('lança erro quando success=false', async () => {
    protheusPostMock.mockResolvedValueOnce({ success: false, message: 'SQL inválido' })
    await expect(new ProtheusSqlAdapter().run(realCompany, 'SELECT 1')).rejects.toThrow(
      /success=false: SQL inválido/
    )
  })

  it('propaga errorId e message do payload de erro real (WSQ002)', async () => {
    protheusPostMock.mockResolvedValueOnce({
      success: false,
      errorId: 'WSQ002',
      message: 'Somente comandos SELECT (ou WITH ... SELECT) sao permitidos',
    })
    await expect(new ProtheusSqlAdapter().run(realCompany, 'SELECT 1')).rejects.toThrow(
      /success=false \[WSQ002\]: Somente comandos SELECT \(ou WITH \.\.\. SELECT\) sao permitidos/
    )
  })

  it('exige apiSql configurada', async () => {
    await expect(new ProtheusSqlAdapter().run(company, 'SELECT 1')).rejects.toThrow(/apiSql/)
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
