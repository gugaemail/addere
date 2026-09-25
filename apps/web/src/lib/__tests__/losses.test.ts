import { describe, expect, it } from 'vitest'
import type { LossComponentDto, LossesReportDto } from '@addere/types'
import {
  componentsByKind,
  customerKey,
  diffTone,
  LOSS_KIND_META,
  LOSS_KINDS,
  lossesSummaryText,
  planItemFromLoss,
  signedBrl,
  toAmount,
} from '../losses'

const period: LossesReportDto['period'] = { fromYmd: '20260901', toYmd: '20260913', baselineMonths: 3 }

describe('toAmount/signedBrl/diffTone', () => {
  it('toAmount lê strings Decimal e zera o inválido', () => {
    expect(toAmount('1234.5')).toBe(1234.5)
    expect(toAmount('-10')).toBe(-10)
    expect(toAmount(null)).toBe(0)
    expect(toAmount('abc')).toBe(0)
  })

  it('signedBrl põe o sinal na frente e não assina o zero', () => {
    expect(signedBrl('-1234.5')).toMatch(/^-R\$\s1\.234,50$/)
    expect(signedBrl('1234.5')).toMatch(/^\+R\$\s1\.234,50$/)
    expect(signedBrl('0')).toMatch(/^R\$\s0,00$/)
    expect(signedBrl(null)).toBe('—')
    expect(signedBrl('x')).toBe('—')
  })

  it('diffTone: perda vermelha, ganho verde, empate neutro', () => {
    expect(diffTone('-1')).toBe('danger')
    expect(diffTone('1')).toBe('success')
    expect(diffTone('0')).toBe('neutral')
    expect(diffTone(null)).toBe('neutral')
  })
})

describe('componentsByKind', () => {
  it('devolve os 4 tipos na ordem fixa, zerando os ausentes', () => {
    const partial: LossComponentDto[] = [
      { kind: 'GAINED', amount: '500', count: 2 },
      { kind: 'STOPPED', amount: '-1200', count: 3 },
    ]
    const rows = componentsByKind(partial)
    expect(rows.map((r) => r.kind)).toEqual(LOSS_KINDS)
    expect(rows[0]).toEqual({ kind: 'STOPPED', amount: '-1200', count: 3 })
    expect(rows[1]).toEqual({ kind: 'REDUCED', amount: '0', count: 0 })
    expect(rows[3]).toEqual({ kind: 'GAINED', amount: '500', count: 2 })
  })

  it('cada tipo tem rótulo e tom: ganhos verdes, perdas vermelho/âmbar', () => {
    expect(LOSS_KIND_META.GAINED.tone).toBe('success')
    expect(LOSS_KIND_META.STOPPED.tone).toBe('danger')
    expect(LOSS_KIND_META.REDUCED.tone).toBe('warning')
    expect(LOSS_KIND_META.PRODUCT_DROP.tone).toBe('warning')
    expect(LOSS_KIND_META.STOPPED.phrase(1)).toBe('1 cliente parou de comprar')
    expect(LOSS_KIND_META.STOPPED.phrase(4)).toBe('4 clientes pararam de comprar')
    expect(LOSS_KIND_META.PRODUCT_DROP.phrase(1)).toBe('1 produto em queda')
  })
})

describe('lossesSummaryText', () => {
  it('monta a frase com totais e componentes (perda)', () => {
    const text = lossesSummaryText(
      {
        period,
        totals: { baselineAmount: '100000', currentAmount: '80000', diffAmount: '-20000', diffPct: -20 },
        components: [
          { kind: 'STOPPED', amount: '-12000', count: 4 },
          { kind: 'REDUCED', amount: '-10000', count: 1 },
          { kind: 'PRODUCT_DROP', amount: '0', count: 0 },
          { kind: 'GAINED', amount: '2000', count: 2 },
        ],
      },
      'Equipe inteira'
    )
    expect(text).toContain('Equipe inteira, 01/09 a 13/09/2026: receita de R$')
    expect(text).toContain('80.000,00')
    expect(text).toMatch(/-R\$\s20\.000,00 \(-20,00%\) abaixo da base de 3 meses/)
    expect(text).toContain('4 clientes pararam de comprar (-R$')
    expect(text).toContain('1 cliente comprou menos')
    expect(text).not.toContain('produto em queda') // zerado não entra
    expect(text).toContain('2 clientes ganhos ou recuperados (+R$')
    expect(text.endsWith('.')).toBe(true)
  })

  it('ganho fica "acima da base" e empate "igual à base"', () => {
    const up = lossesSummaryText({
      period,
      totals: { baselineAmount: '100', currentAmount: '150', diffAmount: '50', diffPct: 50 },
      components: [],
    })
    expect(up).toContain('acima da base de 3 meses')
    const same = lossesSummaryText({
      period,
      totals: { baselineAmount: '100', currentAmount: '100', diffAmount: '0', diffPct: 0 },
      components: [],
    })
    expect(same).toContain('igual à base de 3 meses')
    expect(same.endsWith(').')).toBe(true)
  })

  it('sem base comparável diz isso em vez de inventar variação', () => {
    const text = lossesSummaryText(
      {
        period: { ...period, baselineMonths: 6 },
        totals: { baselineAmount: '0', currentAmount: '900', diffAmount: '900', diffPct: null },
        components: [],
      },
      'Maria'
    )
    expect(text).toContain('Maria, 01/09 a 13/09/2026')
    expect(text).toContain('sem base comparável nos 6 meses anteriores')
    expect(text).not.toContain('%')
  })
})

describe('planItemFromLoss/customerKey', () => {
  it('monta o corpo do plan-items com o prefixo do motivo', () => {
    expect(
      planItemFromLoss({ vendorCode: 'V1', customerCode: '000123', loja: '01', reason: 'sumiu há 40 dias' })
    ).toEqual({
      vendorCode: 'V1',
      customerCode: '000123',
      loja: '01',
      shortReason: 'Onde estou perdendo: sumiu há 40 dias',
    })
  })

  it('sem vendedor não há onde pôr — null', () => {
    expect(
      planItemFromLoss({ vendorCode: null, customerCode: '1', loja: '01', reason: 'x' })
    ).toBeNull()
  })

  it('corta motivos longos em 120 caracteres', () => {
    const item = planItemFromLoss({
      vendorCode: 'V1',
      customerCode: '1',
      loja: '01',
      reason: 'a'.repeat(200),
    })
    expect(item?.shortReason.length).toBe(120)
  })

  it('customerKey junta código e loja', () => {
    expect(customerKey({ customerCode: '000123', loja: '02' })).toBe('000123-02')
  })
})
