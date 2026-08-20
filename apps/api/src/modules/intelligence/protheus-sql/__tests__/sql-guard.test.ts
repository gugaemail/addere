import { describe, it, expect } from 'vitest'
import { validateSql, stripStringLiterals } from '../sql-guard'
import { QUERY_CONTRACTS } from '../contracts'

const SALES = QUERY_CONTRACTS.SALES
const CUSTOMERS = QUERY_CONTRACTS.CUSTOMERS
const STOCK = QUERY_CONTRACTS.STOCK

const okSales = `SELECT D2_DOC AS pedido, D2_EMISSAO AS data, D2_CLIENTE AS cliente_cod
FROM SD2010 WHERE D_E_L_E_T_=' ' AND D2_FILIAL IN ({{FILIAL}})
AND D2_EMISSAO BETWEEN {{DATA_INI}} AND {{DATA_FIM}}`

const codes = (sql: string, contract = SALES, scope: 'ALL' | 'PER_SELLER' = 'ALL') =>
  validateSql(sql, contract, scope).map((v) => v.code)

describe('sql-guard', () => {
  it('aprova o SQL de referência de vendas', () => {
    expect(codes(okSales)).toEqual([])
  })

  it('rejeita consulta vazia', () => {
    expect(codes('')).toContain('empty')
  })

  it('rejeita ponto e vírgula', () => {
    expect(codes(okSales + ';')).toContain('semicolon')
  })

  it('rejeita comentário de linha', () => {
    expect(codes(okSales + ' -- oi')).toContain('line_comment')
  })

  it('rejeita comentário de bloco', () => {
    expect(codes('/* x */ ' + okSales)).toContain('block_comment')
  })

  it('rejeita statement que não começa com SELECT/WITH', () => {
    expect(codes('DELETE FROM SD2010')).toContain('not_select')
  })

  it.each([
    'INSERT',
    'UPDATE',
    'DELETE',
    'MERGE',
    'CREATE',
    'ALTER',
    'DROP',
    'TRUNCATE',
    'GRANT',
    'REVOKE',
    'EXEC',
    'EXECUTE',
    'WAITFOR',
    'BULK',
  ])('rejeita keyword proibida %s', (kw) => {
    expect(codes(`${okSales} ${kw} x`).join(',')).toContain('forbidden')
  })

  it('rejeita SELECT ... INTO', () => {
    expect(codes(okSales.replace('FROM', 'INTO tmp FROM'))).toContain('forbidden_into')
  })

  it('rejeita sp_executesql e procedures xp_/sp_', () => {
    expect(codes(`${okSales} AND sp_executesql('x')=1`).join(',')).toContain('forbidden')
    expect(codes(`${okSales} AND xp_cmdshell('dir')=1`)).toContain('forbidden_system_proc')
    expect(codes(`${okSales} AND sp_who()=1`)).toContain('forbidden_system_proc')
  })

  it('rejeita OPENROWSET/OPENQUERY/OPENDATASOURCE', () => {
    for (const fn of ['OPENROWSET', 'OPENQUERY', 'OPENDATASOURCE']) {
      expect(codes(`${okSales} AND ${fn}(1)=1`).join(',')).toContain('forbidden')
    }
  })

  it('rejeita schemas de sistema', () => {
    expect(codes(okSales.replace('SD2010', 'sys.objects'))).toContain('forbidden_system_schema')
    expect(codes(okSales.replace('SD2010', 'INFORMATION_SCHEMA.TABLES'))).toContain(
      'forbidden_system_schema'
    )
  })

  it('rejeita FOR XML/JSON', () => {
    expect(codes(`${okSales} FOR XML AUTO`)).toContain('forbidden_for_clause')
    expect(codes(`${okSales} FOR JSON PATH`)).toContain('forbidden_for_clause')
  })

  it('não confunde a coluna D_E_L_E_T_ com DELETE', () => {
    expect(codes(okSales)).not.toContain('forbidden_delete')
  })

  it('ignora keywords dentro de literais de string', () => {
    const sql = okSales.replace("' '", "'NAO DELETE ISSO'")
    expect(codes(sql)).not.toContain('forbidden_delete')
  })

  it('stripStringLiterals preserva estrutura e remove conteúdo', () => {
    expect(stripStringLiterals("SELECT 'a''b' AS x")).toBe("SELECT '' AS x")
  })

  // ─── CTE (decisão D6) ───
  it('aceita CTE com SELECT final', () => {
    const cte = `WITH vendas AS (${okSales}) SELECT * FROM vendas`
    expect(codes(cte)).toEqual([])
  })

  it('aceita duas CTEs encadeadas', () => {
    const cte = `WITH a AS (${okSales}), b AS (SELECT * FROM a) SELECT * FROM b`
    expect(codes(cte)).toEqual([])
  })

  it('rejeita CTE com DML no corpo', () => {
    const cte = `WITH a AS (${okSales}) UPDATE SD2010 SET D2_DOC='1'`
    expect(codes(cte).join(',')).toContain('forbidden_update')
  })

  // ─── Placeholders × contrato/escopo ───
  it('rejeita placeholder desconhecido', () => {
    expect(codes(okSales + ' AND x = {{FOO}}')).toContain('unknown_placeholder')
  })

  it('rejeita placeholder obrigatório ausente', () => {
    expect(codes('SELECT 1 AS pedido FROM SD2010')).toContain('missing_placeholder')
  })

  it('rejeita {{VENDEDOR}} em escopo ALL', () => {
    expect(codes(okSales + ' AND F2_VEND1 = {{VENDEDOR}}', SALES, 'ALL')).toContain(
      'vendor_in_all_scope'
    )
  })

  it('exige {{VENDEDOR}} em escopo PER_SELLER', () => {
    expect(codes(okSales, SALES, 'PER_SELLER')).toContain('missing_vendor_in_per_seller')
  })

  it('rejeita placeholder não permitido no contrato (PRODUTO em CUSTOMERS)', () => {
    const sql = `SELECT A1_COD AS cliente_cod FROM SA1010 WHERE A1_FILIAL IN ({{FILIAL}}) AND B = {{PRODUTO}}`
    expect(codes(sql, CUSTOMERS)).toContain('placeholder_not_allowed')
  })

  it('valida os SQLs de referência de todos os contratos', () => {
    for (const contract of Object.values(QUERY_CONTRACTS)) {
      for (const ref of contract.referenceSql) {
        expect(validateSql(ref.sql, contract, 'ALL')).toEqual([])
      }
    }
  })

  it('STOCK exige {{PRODUTO}}', () => {
    expect(codes('SELECT B2_COD AS produto_cod, B2_QATU AS saldo FROM SB2010', STOCK)).toContain(
      'missing_placeholder'
    )
  })
})
