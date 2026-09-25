import { describe, it, expect } from 'vitest'
import { mapSalesRows, mapOpenTitleRows } from '../contract-sync.service'

describe('mapSalesRows', () => {
  it('mapeia linha completa com chave composta', () => {
    const { records, skipped } = mapSalesRows('t1', [
      {
        pedido: 'PED001',
        item: '01',
        data: '20260815',
        cliente_cod: '000123',
        cliente_loja: '01',
        vendedor_cod: '000001',
        produto_cod: 'CFD30',
        quantidade: 12.5,
        valor: 1500.75,
        produto_desc: 'PVC ENCOLHIVEL',
        grupo_produto: 'FILMES',
      },
    ])
    expect(skipped).toHaveLength(0)
    expect(records[0]).toMatchObject({
      companyId: 't1',
      orderRef: 'PED001',
      itemSeq: '01',
      productCode: 'CFD30',
      customerCode: '000123',
      vendorCode: '000001',
      quantity: 12.5,
      amount: 1500.75,
    })
    expect(records[0].date.toISOString().slice(0, 10)).toBe('2026-08-15')
  })

  it('aliases em maiúsculas (Protheus devolve como escrito no SQL)', () => {
    const { records } = mapSalesRows('t1', [
      {
        PEDIDO: 'P2',
        DATA: '20260101',
        CLIENTE_COD: 'C1',
        PRODUTO_COD: 'X',
        QUANTIDADE: 1,
        VALOR: 10,
      },
    ])
    expect(records).toHaveLength(1)
    expect(records[0].itemSeq).toBe('00') // default do contrato SC5/SC6 sem item
  })

  it('linha sem chave vai para skipped sem derrubar o lote', () => {
    const { records, skipped } = mapSalesRows('t1', [
      { pedido: '', data: '20260101', cliente_cod: 'C1', produto_cod: 'X', quantidade: 1, valor: 1 },
      { pedido: 'OK1', data: '20260101', cliente_cod: 'C1', produto_cod: 'X', quantidade: 1, valor: 1 },
    ])
    expect(records).toHaveLength(1)
    expect(skipped).toHaveLength(1)
  })

  it('vendedor vazio vira null (aparece na Saúde como pendência)', () => {
    const { records } = mapSalesRows('t1', [
      { pedido: 'P1', data: '20260101', cliente_cod: 'C1', produto_cod: 'X', quantidade: 1, valor: 1, vendedor_cod: '  ' },
    ])
    expect(records[0].vendorCode).toBeNull()
  })
})

describe('mapOpenTitleRows', () => {
  it('mapeia título com dias de atraso', () => {
    const { records } = mapOpenTitleRows('t1', [
      {
        titulo: 'NF001/01',
        cliente_cod: '000123',
        cliente_loja: '02',
        vencimento: '20260801',
        valor_saldo: 900.5,
        dias_atraso: 20,
      },
    ])
    expect(records[0]).toMatchObject({
      titleRef: 'NF001/01',
      customerCode: '000123',
      loja: '02',
      balance: 900.5,
      daysOverdue: 20,
    })
  })

  it('dias_atraso ausente vira null; vencimento inválido vai para skipped', () => {
    const { records, skipped } = mapOpenTitleRows('t1', [
      { titulo: 'A', cliente_cod: 'C', vencimento: '20260801', valor_saldo: 1 },
      { titulo: 'B', cliente_cod: 'C', vencimento: 'xx', valor_saldo: 1 },
    ])
    expect(records[0].daysOverdue).toBeNull()
    expect(skipped).toEqual(['B'])
  })
})
