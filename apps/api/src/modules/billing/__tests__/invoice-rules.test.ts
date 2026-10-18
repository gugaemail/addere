// Regras puras da fatura (plano 016): quando uma competência é cobrada e
// quanto. Sem mock: é aqui que "cobrar o que não devia" e o erro de centavo se
// resolvem. Horários em UTC; São Paulo é UTC−3.
import { describe, expect, it } from 'vitest'
import { Prisma } from '@prisma/client'
import { computeBillingCalendar, invoiceDisplayStatus, resolveCompetenceTerms } from '@addere/types'
import { competenceStart, dateToCompetence } from '../competence'
import {
  assertInvoiceFits,
  assertMonthlyTotalFits,
  buildContractItems,
  fitsMoneyColumn,
  isCompetenceBillable,
  isP2002,
  MONEY_COLUMN_MAX,
  sumAmounts,
  type BillableContract,
} from '../invoice-rules'

const date = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`)

function acceptedContract(acceptIso: string, graceMonths: number): BillableContract {
  const { firstBilledCompetence } = computeBillingCalendar({
    acceptDate: new Date(acceptIso),
    graceMonths,
    dueDay: 10,
  })
  return { status: 'ACTIVE', firstBilledCompetence, endsAt: null }
}

describe('termos da competência (013) — fronteira estrita às 00:00 de São Paulo', () => {
  const effective = (iso: string) => [
    { status: 'EFFECTIVE' as const, effectiveFrom: new Date(iso), version: 1 },
  ]

  it('termos de 30/09 às 22h em São Paulo valem para outubro', () => {
    expect(
      resolveCompetenceTerms(effective('2026-10-01T01:00:00Z'), date('2026-10-01'))
    ).not.toBeNull()
  })

  it('termos das 00:00 de 01/10 em São Paulo não valem para outubro, só para novembro', () => {
    const terms = effective('2026-10-01T03:00:00Z')
    expect(resolveCompetenceTerms(terms, date('2026-10-01'))).toBeNull()
    expect(resolveCompetenceTerms(terms, date('2026-11-01'))).not.toBeNull()
  })
})

describe('isCompetenceBillable', () => {
  it('mês do aceite não é cobrado e carência 0 cobra o mês seguinte', () => {
    const contract = acceptedContract('2026-10-15T15:00:00Z', 0)
    expect(isCompetenceBillable(contract, '202610')).toBe(false)
    expect(isCompetenceBillable(contract, '202611')).toBe(true)
  })

  it('carência N: os N meses depois do mês do aceite também não são cobrados', () => {
    const contract = acceptedContract('2026-10-15T15:00:00Z', 2)
    expect(isCompetenceBillable(contract, '202610')).toBe(false)
    expect(isCompetenceBillable(contract, '202611')).toBe(false)
    expect(isCompetenceBillable(contract, '202612')).toBe(false)
    expect(isCompetenceBillable(contract, '202701')).toBe(true)
  })

  it('aceite às 23h30 de 31/10 em São Paulo: a primeira competência é novembro, não dezembro', () => {
    const contract = acceptedContract('2026-11-01T02:30:00Z', 0)
    expect(dateToCompetence(contract.firstBilledCompetence as Date)).toBe('202611')
    expect(isCompetenceBillable(contract, '202610')).toBe(false)
    expect(isCompetenceBillable(contract, '202611')).toBe(true)
  })

  it('cancelamento: o mês do fim é cobrado, o seguinte não (ACTIVE ou CANCELLED)', () => {
    for (const status of ['ACTIVE', 'CANCELLED']) {
      const contract = {
        status,
        firstBilledCompetence: date('2026-08-01'),
        endsAt: date('2026-10-31'),
      }
      expect(isCompetenceBillable(contract, '202610')).toBe(true)
      expect(isCompetenceBillable(contract, '202611')).toBe(false)
    }
  })

  it('DRAFT e PENDING_ACCEPTANCE nunca cobram', () => {
    for (const status of ['DRAFT', 'PENDING_ACCEPTANCE']) {
      const contract = { status, firstBilledCompetence: date('2026-01-01'), endsAt: null }
      for (const ym of ['202601', '202610', '202712']) {
        expect(isCompetenceBillable(contract, ym)).toBe(false)
      }
    }
  })

  it('CANCELLED sem endsAt nunca cobra', () => {
    const contract = {
      status: 'CANCELLED',
      firstBilledCompetence: date('2026-01-01'),
      endsAt: null,
    }
    expect(isCompetenceBillable(contract, '202610')).toBe(false)
  })

  it('sem firstBilledCompetence nunca cobra', () => {
    const contract = { status: 'ACTIVE', firstBilledCompetence: null, endsAt: null }
    expect(isCompetenceBillable(contract, '202610')).toBe(false)
  })

  it('fronteira: firstBilledCompetence igual a M cobra', () => {
    const contract = {
      status: 'ACTIVE',
      firstBilledCompetence: competenceStart('202611'),
      endsAt: null,
    }
    expect(isCompetenceBillable(contract, '202611')).toBe(true)
  })
})

describe('somas Decimal', () => {
  it('0.10 + 0.20 = 0.30, exato', () => {
    expect(sumAmounts(['0.10', '0.20']).toFixed(2)).toBe('0.30')
  })

  it('lista vazia soma 0.00', () => {
    expect(sumAmounts([]).toFixed(2)).toBe('0.00')
  })

  it('pacote + adicionais + desconto + ajuste fecha em 2139.80', () => {
    const items = buildContractItems({
      packageName: 'Pacote 20',
      licenseType: 'INTELLIGENCE',
      includedSeats: 20,
      extraSeats: 3,
      packagePrice: '1990.00',
      extraSeatPrice: '49.90',
    })
    const extra = items.find((i) => i.kind === 'EXTRA_SEATS')
    expect(extra?.amount.toFixed(2)).toBe('149.70')
    const total = sumAmounts([...items.map((i) => i.amount), '-0.10', new Prisma.Decimal('0.20')])
    expect(total.toFixed(2)).toBe('2139.80')
  })
})

describe('buildContractItems', () => {
  it('PACKAGE e EXTRA_SEATS automáticos, com quantidade e preço unitário', () => {
    const items = buildContractItems({
      packageName: 'Pacote 20',
      licenseType: 'INTELLIGENCE',
      includedSeats: 20,
      extraSeats: 3,
      packagePrice: new Prisma.Decimal('1990.00'),
      extraSeatPrice: new Prisma.Decimal('49.90'),
    })
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      kind: 'PACKAGE',
      description: 'Pacote 20 — Com Inteligência (20 licenças)',
      quantity: 1,
      manual: false,
    })
    expect(items[0].unitPrice.toFixed(2)).toBe('1990.00')
    expect(items[0].amount.toFixed(2)).toBe('1990.00')
    expect(items[1]).toMatchObject({
      kind: 'EXTRA_SEATS',
      description: 'Licenças adicionais',
      quantity: 3,
      manual: false,
    })
    expect(items[1].unitPrice.toFixed(2)).toBe('49.90')
  })

  it('sem adicional: só o PACKAGE', () => {
    const items = buildContractItems({
      packageName: 'Ilimitado',
      licenseType: 'STANDARD',
      includedSeats: 100,
      extraSeats: 0,
      packagePrice: '5000.00',
      extraSeatPrice: '30.00',
    })
    expect(items).toHaveLength(1)
    expect(items[0].description).toBe('Pacote Ilimitado — Padrão (100 licenças)')
  })
})

describe('invoiceDisplayStatus', () => {
  it('OPEN com vencimento ontem é vencida; vencimento hoje continua em aberto', () => {
    expect(invoiceDisplayStatus('OPEN', '20261109', '20261110')).toBe('OVERDUE')
    expect(invoiceDisplayStatus('OPEN', '20261110', '20261110')).toBe('OPEN')
    expect(invoiceDisplayStatus('OPEN', '20261111', '20261110')).toBe('OPEN')
  })

  it('PAID e CANCELLED com vencimento passado continuam PAID e CANCELLED', () => {
    expect(invoiceDisplayStatus('PAID', '20260101', '20261110')).toBe('PAID')
    expect(invoiceDisplayStatus('CANCELLED', '20260101', '20261110')).toBe('CANCELLED')
  })
})

describe('isP2002', () => {
  it('reconhece a violação de chave única e nada mais', () => {
    const unique = new Prisma.PrismaClientKnownRequestError('Unique', {
      code: 'P2002',
      clientVersion: '5.22.0',
    })
    const other = new Prisma.PrismaClientKnownRequestError('Other', {
      code: 'P2025',
      clientVersion: '5.22.0',
    })
    expect(isP2002(unique)).toBe(true)
    expect(isP2002(other)).toBe(false)
    expect(isP2002(new Error('P2002'))).toBe(false)
  })
})

describe('teto do Decimal(14,2) (A4 do e2e de 18/10/2026)', () => {
  it('cabe até 999999999999.99, em módulo', () => {
    expect(MONEY_COLUMN_MAX.toFixed(2)).toBe('999999999999.99')
    expect(fitsMoneyColumn('999999999999.99')).toBe(true)
    expect(fitsMoneyColumn('-999999999999.99')).toBe(true)
    expect(fitsMoneyColumn('1000000000000.00')).toBe(false)
    expect(fitsMoneyColumn(new Prisma.Decimal('-1000000000000'))).toBe(false)
  })

  it('total mensal: pacote + adicionais × preço, no limite passa e um centavo acima é 422', () => {
    expect(() =>
      assertMonthlyTotalFits({
        packagePrice: '999999999998.99',
        extraSeats: 1,
        extraSeatPrice: '1.00',
      })
    ).not.toThrow()
    expect(() =>
      assertMonthlyTotalFits({
        packagePrice: '999999999999.99',
        extraSeats: 1,
        extraSeatPrice: '0.01',
      })
    ).toThrow(expect.objectContaining({ statusCode: 422, code: 'AMOUNT_TOO_LARGE' }))
    // O caso do e2e: cada valor cabe, o produto não
    expect(() =>
      assertMonthlyTotalFits({
        packagePrice: '999999999999.99',
        extraSeats: 10000,
        extraSeatPrice: '999999999999.99',
      })
    ).toThrow(expect.objectContaining({ code: 'AMOUNT_TOO_LARGE' }))
  })

  it('fatura: cada item e o total', () => {
    const max = { amount: '999999999999.99' }
    expect(() => assertInvoiceFits([max], '999999999999.99')).not.toThrow()
    // Dois itens que cabem, soma que não cabe
    expect(() => assertInvoiceFits([max, max], sumAmounts([max.amount, max.amount]))).toThrow(
      expect.objectContaining({ statusCode: 422, code: 'AMOUNT_TOO_LARGE' })
    )
    // Item automático acima (licenças adicionais de termos antigos), total compensado
    expect(() =>
      assertInvoiceFits([{ amount: new Prisma.Decimal('1000000000000') }], '1.00')
    ).toThrow(expect.objectContaining({ code: 'AMOUNT_TOO_LARGE' }))
  })
})
