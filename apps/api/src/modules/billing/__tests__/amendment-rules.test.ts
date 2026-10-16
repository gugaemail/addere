// Regras do aditivo (plano 014, decisão de desenho 7; contrato §13 e aditivo
// §3.3): o que é aumento de preço e quando a antecedência de 30 dias vale.
import { describe, it, expect } from 'vitest'
import { AppError } from '../../../lib/errors'
import {
  assertAmendmentNotice,
  isPriceIncrease,
  minimumEffectiveDate,
  requiredNoticeDate,
  todayYmdSaoPaulo,
} from '../amendment-rules'

const prices = (packagePrice: string, extraSeatPrice: string) => ({
  packagePrice,
  extraSeatPrice,
})

describe('isPriceIncrease', () => {
  it('valor do pacote maior ⇒ aumento', () => {
    expect(isPriceIncrease(prices('1000.00', '95.00'), prices('1200.00', '95.00'), false)).toBe(
      true
    )
  })

  it('adicional mais caro com o pacote igual ⇒ aumento', () => {
    expect(isPriceIncrease(prices('1000.00', '95.00'), prices('1000.00', '95.01'), false)).toBe(
      true
    )
  })

  it('mais licenças adicionais pelo mesmo valor unitário não é aumento', () => {
    // O total mensal sobe, mas os dois preços são os mesmos: vale no aceite
    expect(isPriceIncrease(prices('1000.00', '95.00'), prices('1000', '95'), false)).toBe(false)
  })

  it('valores menores ⇒ não é aumento', () => {
    expect(isPriceIncrease(prices('1000.00', '95.00'), prices('900.00', '80.00'), false)).toBe(
      false
    )
  })

  it('levar às condições gerais novas é sempre aumento', () => {
    expect(isPriceIncrease(prices('1000.00', '95.00'), prices('900.00', '80.00'), true)).toBe(true)
  })
})

describe('datas do aviso', () => {
  it('envio em 15/10/2026: mínimo 14/11/2026', () => {
    expect(minimumEffectiveDate('2026-10-15')).toBe('2026-11-14')
    expect(minimumEffectiveDate('2026-12-15')).toBe('2027-01-14')
  })

  it('envio às 23h30 de São Paulo usa o dia de São Paulo', () => {
    expect(todayYmdSaoPaulo(new Date('2026-10-16T02:30:00Z'))).toBe('2026-10-15')
  })
})

function noticeError(fn: () => void): AppError | null {
  try {
    fn()
    return null
  } catch (err) {
    return err as AppError
  }
}

describe('assertAmendmentNotice', () => {
  const base = {
    increase: false,
    requestedByClient: false,
    carryConditions: false,
    proposedEffectiveFromYmd: null as string | null,
    sentYmd: '2026-10-15',
    reason: 'Troca de pacote',
  }

  it('aumento sem a caixa: exige 30 dias (13/11 recusado, 14/11 aceito)', () => {
    const short = noticeError(() =>
      assertAmendmentNotice({ ...base, increase: true, proposedEffectiveFromYmd: '2026-11-13' })
    )
    expect(short?.statusCode).toBe(422)
    expect(short?.code).toBe('AMENDMENT_NOTICE_TOO_SHORT')
    expect(short?.details).toEqual({ minimumEffectiveFrom: '2026-11-14' })
    expect(short?.message).toContain('14/11/2026')

    expect(noticeError(() => assertAmendmentNotice({ ...base, increase: true }))?.code).toBe(
      'AMENDMENT_NOTICE_TOO_SHORT'
    )
    expect(
      noticeError(() =>
        assertAmendmentNotice({ ...base, increase: true, proposedEffectiveFromYmd: '2026-11-14' })
      )
    ).toBeNull()
  })

  it('aumento a pedido da Empresa: vale no aceite', () => {
    expect(
      noticeError(() => assertAmendmentNotice({ ...base, increase: true, requestedByClient: true }))
    ).toBeNull()
  })

  it('a pedido da Empresa, o motivo é obrigatório', () => {
    expect(
      noticeError(() =>
        assertAmendmentNotice({ ...base, increase: true, requestedByClient: true, reason: ' ' })
      )?.code
    ).toBe('AMENDMENT_REASON_REQUIRED')
  })

  it('condições gerais novas, mesmo a pedido da Empresa: exige 30 dias', () => {
    expect(
      noticeError(() =>
        assertAmendmentNotice({
          ...base,
          increase: true,
          carryConditions: true,
          requestedByClient: true,
        })
      )?.code
    ).toBe('AMENDMENT_NOTICE_TOO_SHORT')
  })

  it('sem aumento: vale no aceite, sem data', () => {
    expect(noticeError(() => assertAmendmentNotice(base))).toBeNull()
    expect(requiredNoticeDate(base)).toBeNull()
  })
})
