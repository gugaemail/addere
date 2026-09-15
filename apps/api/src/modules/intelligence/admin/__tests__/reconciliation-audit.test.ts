import { describe, it, expect } from 'vitest'
import {
  auditReconciliation,
  endpointHostOf,
  parseAmount,
  rowsToCsv,
  type AuditInput,
} from '../reconciliation-audit'

const row = (pedido: string, item: string, data: string, valor: unknown, extra: Record<string, unknown> = {}) => ({
  pedido,
  item,
  data,
  cliente_cod: '003086',
  cliente_loja: '01',
  produto_cod: `P${item}`,
  valor: valor as number,
  ...extra,
})

const input = (over: Partial<AuditInput> = {}): AuditInput => ({
  name: 'SALES',
  rows: [row('A1', '01', '20260105', 100), row('A1', '02', '20260105', 50.5), row('B2', '01', '20260107', 1000)],
  executedSql: "SELECT ... WHERE D2_FILIAL IN ('0101') AND D2_EMISSAO BETWEEN '20260101' AND '20260131'",
  window: { dataIni: '20260101', dataFim: '20260131' },
  branches: ['0101'],
  pages: 1,
  pageSize: 100,
  truncated: false,
  source: 'protheus',
  endpointHost: 'erp.exemplo.com.br:8088',
  ...over,
})

describe('parseAmount', () => {
  it('aceita número, ponto decimal, formato brasileiro e vírgula decimal', () => {
    expect(parseAmount(1046.4)).toBe(1046.4)
    expect(parseAmount('3872.2649999999999')).toBeCloseTo(3872.265, 3)
    expect(parseAmount('1.234,56')).toBe(1234.56)
    expect(parseAmount('816,48')).toBe(816.48)
    expect(parseAmount('R$ 10,00')).toBe(10)
  })

  it('vazio ou texto vira null', () => {
    expect(parseAmount(null)).toBeNull()
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
  })
})

describe('endpointHostOf', () => {
  it('devolve só o host, nunca caminho, usuário ou query string', () => {
    expect(endpointHostOf('http://user:senha@chfilmsjp.ddns.com.br:8088/rest/WSQUERY?x=1')).toBe(
      'chfilmsjp.ddns.com.br:8088'
    )
    expect(endpointHostOf(null)).toBeNull()
    expect(endpointHostOf('não é url')).toBeNull()
  })
})

describe('auditReconciliation', () => {
  it('soma, conta linhas e pedidos e agrupa por dia', () => {
    const { calcAmount, audit, concreteCauses } = auditReconciliation(input())
    expect(calcAmount).toBe(1150.5)
    expect(audit).toMatchObject({
      rows: 3,
      pages: 1,
      pageSize: 100,
      distinctOrders: 2,
      duplicateRows: 0,
      duplicateKeys: 0,
      invalidValues: 0,
      branches: ['0101'],
      branchColumn: null,
      byBranch: [],
      endpointHost: 'erp.exemplo.com.br:8088',
    })
    expect(audit.byDay).toEqual([
      { date: '20260105', rows: 2, amount: '150.50' },
      { date: '20260107', rows: 1, amount: '1000.00' },
    ])
    expect(concreteCauses).toEqual([])
  })

  it('detecta página repetida pelo endpoint (linhas idênticas) e aponta como causa', () => {
    const rows = input().rows
    const { calcAmount, audit, concreteCauses } = auditReconciliation(
      input({ rows: [...rows, ...rows], pages: 2 })
    )
    expect(calcAmount).toBe(2301)
    expect(audit.duplicateRows).toBe(3)
    expect(concreteCauses[0]).toMatch(/3 linha\(s\) idêntica\(s\).*2 página\(s\) de até 100/)
    // repetição idêntica não é contada de novo como JOIN multiplicando
    expect(concreteCauses.some((c) => c.includes('JOIN'))).toBe(false)
  })

  it('mesmo pedido+item+produto com valores diferentes aponta JOIN multiplicando', () => {
    const rows = [row('A1', '01', '20260105', 100), row('A1', '01', '20260105', 100, { tes: '501' }), row('A1', '01', '20260105', 100, { tes: '502' })]
    const { audit, concreteCauses } = auditReconciliation(input({ rows }))
    expect(audit.duplicateKeys).toBe(2)
    expect(concreteCauses.some((c) => c.includes('JOIN multiplicando'))).toBe(true)
  })

  it('várias filiais: soma por filial quando a consulta traz a coluna; senão orienta incluir', () => {
    const withColumn = auditReconciliation(
      input({
        branches: ['0101', '0102'],
        rows: [
          row('A1', '01', '20260105', 100, { f2_filial: '0101' }),
          row('C3', '01', '20260106', 300, { f2_filial: '0102' }),
        ],
      })
    )
    expect(withColumn.audit.branchColumn).toBe('f2_filial')
    expect(withColumn.audit.byBranch).toEqual([
      { branch: '0101', rows: 1, amount: '100.00' },
      { branch: '0102', rows: 1, amount: '300.00' },
    ])
    expect(withColumn.concreteCauses[0]).toMatch(/2 filiais \(0101, 0102\).*soma por filial/)

    const without = auditReconciliation(input({ branches: ['0101', '0102'] }))
    expect(without.concreteCauses[0]).toMatch(/inclua a coluna da filial/)
  })

  it('dados sintéticos, resultado cortado e valores inválidos viram causas explícitas', () => {
    const { audit, concreteCauses } = auditReconciliation(
      input({
        source: 'mock',
        truncated: true,
        endpointHost: null,
        rows: [row('A1', '01', '20260105', 'abc'), row('A1', '02', '20260105', 10)],
      })
    )
    expect(audit.invalidValues).toBe(1)
    expect(concreteCauses[0]).toMatch(/dados sintéticos/)
    expect(concreteCauses.some((c) => c.includes('cortado'))).toBe(true)
    expect(concreteCauses.some((c) => c.includes('não numérico'))).toBe(true)
  })
})

describe('rowsToCsv', () => {
  it('usa ";", vírgula decimal, aspas quando precisa e BOM para o Excel', () => {
    const csv = rowsToCsv([
      { pedido: 'A1', produto_desc: 'PVC; ESTICAVEL "28"', valor: 1046.4 },
      { pedido: 'B2', produto_desc: null, valor: 10, extra: 'x' },
    ])
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines[0]).toBe('pedido;produto_desc;valor;extra')
    expect(lines[1]).toBe('A1;"PVC; ESTICAVEL ""28""";1046,4;')
    expect(lines[2]).toBe('B2;;10;x')
  })
})
