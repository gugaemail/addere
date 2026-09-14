import { describe, it, expect } from 'vitest'
import {
  initialEditorSql,
  isBrokenSql,
  matchingReference,
  normalizeReferenceSql,
  referenceButtonLabel,
} from '../query-reference'

const SALES_REFS = [
  { label: 'SD2/SF2 (faturamento)', sql: 'SELECT D2_DOC AS pedido FROM SD2010' },
  { label: 'SC5/SC6 (pedidos)', sql: 'SELECT C5_NUM AS pedido FROM SC5010' },
]

describe('normalizeReferenceSql', () => {
  it('mantém a lista da API com rótulo e SQL', () => {
    expect(normalizeReferenceSql(SALES_REFS)).toEqual(SALES_REFS)
  })

  it('texto solto vira uma opção só; vazio ou formato estranho vira lista vazia', () => {
    expect(normalizeReferenceSql('SELECT 1')).toEqual([{ label: 'Referência', sql: 'SELECT 1' }])
    expect(normalizeReferenceSql('   ')).toEqual([])
    expect(normalizeReferenceSql(null)).toEqual([])
    expect(normalizeReferenceSql({ sql: 'SELECT 1' })).toEqual([])
  })

  it('descarta itens sem SQL e dá rótulo padrão a quem não tem', () => {
    expect(normalizeReferenceSql([{ label: 'A' }, { sql: 'SELECT 2' }, 42])).toEqual([
      { label: 'Referência', sql: 'SELECT 2' },
    ])
  })
})

describe('isBrokenSql', () => {
  it('reconhece a lista crua gravada pelo defeito antigo', () => {
    expect(isBrokenSql('[object Object],[object Object]')).toBe(true)
    expect(isBrokenSql('  [object Object]')).toBe(true)
    expect(isBrokenSql('SELECT 1')).toBe(false)
    expect(isBrokenSql(null)).toBe(false)
  })
})

describe('initialEditorSql', () => {
  it('rascunho salvo válido tem prioridade', () => {
    expect(initialEditorSql('SELECT meu_sql', SALES_REFS)).toBe('SELECT meu_sql')
  })

  it('sem rascunho, ou com rascunho corrompido, abre a primeira referência', () => {
    expect(initialEditorSql(null, SALES_REFS)).toBe(SALES_REFS[0].sql)
    expect(initialEditorSql('[object Object],[object Object]', SALES_REFS)).toBe(SALES_REFS[0].sql)
  })

  it('sem referência nem rascunho, abre vazio (nunca "[object Object]")', () => {
    expect(initialEditorSql(undefined, [])).toBe('')
  })
})

describe('matchingReference', () => {
  it('diz qual referência está no editor, ignorando espaços nas pontas', () => {
    expect(matchingReference(`  ${SALES_REFS[1].sql}\n`, SALES_REFS)).toBe(1)
    expect(matchingReference('SELECT editado', SALES_REFS)).toBe(-1)
  })
})

describe('referenceButtonLabel', () => {
  it('uma opção usa o texto genérico; várias usam o rótulo', () => {
    expect(referenceButtonLabel(SALES_REFS[0], 1)).toBe('Usar SQL de referência')
    expect(referenceButtonLabel(SALES_REFS[1], 2)).toBe('Usar SC5/SC6 (pedidos)')
  })
})
