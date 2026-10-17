import { describe, expect, it } from 'vitest'
import type { BillingDashboardDto, RevenueMonth } from '@addere/types'
import {
  agoLabel,
  billingDay,
  brlCompact,
  countLabel,
  daysLabel,
  daysSince,
  dueInLabel,
  hasRevenue,
  documentKindsLabel,
  isEmptyDashboard,
  monthLabel,
  monthLongLabel,
  monthName,
  revenueChartData,
  seatsPct,
  timeInSaoPaulo,
} from '../billing-dashboard'

// O Intl põe espaço inseparável depois do R$
const plain = (s: string) => s.replace(/\u00a0/g, ' ')

const months = (values: Array<[string, string]>): RevenueMonth[] =>
  values.map(([billed, received], i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    billed,
    received,
  }))

const zeroYear = () =>
  months(Array.from({ length: 12 }, () => ['0.00', '0.00'] as [string, string]))

function dto(over: Partial<BillingDashboardDto> = {}): BillingDashboardDto {
  const zero = { count: 0, amount: '0.00' }
  const empty = { total: 0, items: [] }
  return {
    generatedAt: '2026-10-20T15:00:00.000Z',
    today: '2026-10-20',
    mrr: { contracted: '0.00', billable: '0.00', activeContracts: 0, graceContracts: 0 },
    clientsByStatus: {
      NO_CONTRACT: 6,
      AWAITING_ACCEPTANCE: 0,
      IN_GRACE: 0,
      CURRENT: 0,
      OVERDUE: 0,
      BLOCKED: 0,
      CANCELLED: 0,
    },
    seats: { used: 0, limit: 0 },
    receivable: { open: zero, overdue: zero, dueNext15Days: zero, receivedThisMonth: zero },
    overdueInvoices: empty,
    upcomingInvoices: empty,
    pendingAcceptance: empty,
    pendingLicenseRequests: empty,
    nearSeatLimit: empty,
    revenue12m: zeroYear(),
    ...over,
  }
}

describe('monthLabel e monthLongLabel', () => {
  it('mês curto em minúsculas, com o ano em dois dígitos', () => {
    expect(monthLabel('2026-10')).toBe('out/26')
    expect(monthLabel('2026-03')).toBe('mar/26')
  })

  it('virada de ano', () => {
    expect(monthLabel('2026-12')).toBe('dez/26')
    expect(monthLabel('2027-01')).toBe('jan/27')
  })

  it('mês por extenso', () => {
    expect(monthLongLabel('2026-10')).toBe('outubro de 2026')
    expect(monthLongLabel('2027-03')).toBe('março de 2027')
  })

  it('mês fora do formato lança RangeError', () => {
    expect(() => monthLabel('2026-13')).toThrow(RangeError)
    expect(() => monthLongLabel('out/26')).toThrow(RangeError)
  })
})

describe('brlCompact', () => {
  it('reais em notação compacta, para o eixo Y', () => {
    expect(plain(brlCompact(12500))).toBe('R$ 12,5 mil')
    expect(plain(brlCompact(15000))).toBe('R$ 15 mil')
    expect(plain(brlCompact(0))).toBe('R$ 0')
  })
})

describe('revenueChartData e hasRevenue', () => {
  it('converte as strings da API em número só para o gráfico, com o rótulo do mês', () => {
    const data = revenueChartData([{ month: '2026-09', billed: '12167.50', received: '7200.00' }])
    expect(data).toEqual([{ month: '2026-09', label: 'set/26', billed: 12167.5, received: 7200 }])
  })

  it('sem nenhum valor nos 12 meses → false; um mês com recebido → true', () => {
    expect(hasRevenue(zeroYear())).toBe(false)
    const year = zeroYear()
    year[5] = { ...year[5], received: '0.01' }
    expect(hasRevenue(year)).toBe(true)
  })
})

describe('seatsPct', () => {
  it('arredonda para baixo', () => {
    expect(seatsPct({ used: 126, limit: 137 })).toBe(91)
    expect(seatsPct({ used: 18, limit: 20 })).toBe(90)
    expect(seatsPct({ used: 94, limit: 105 })).toBe(89)
  })

  it('acima de 100 % quando passou do limite', () => {
    expect(seatsPct({ used: 13, limit: 12 })).toBe(108)
  })

  it('limite 0 → null', () => {
    expect(seatsPct({ used: 0, limit: 0 })).toBeNull()
    expect(seatsPct({ used: 3, limit: 0 })).toBeNull()
  })
})

describe('isEmptyDashboard', () => {
  it('sem contrato ativo, sem fatura aberta e sem receita → estado vazio', () => {
    expect(isEmptyDashboard(dto())).toBe(true)
  })

  it('com contrato ativo, mesmo sem fatura ainda → não é vazio', () => {
    expect(
      isEmptyDashboard(
        dto({
          mrr: {
            contracted: '1740.00',
            billable: '0.00',
            activeContracts: 1,
            graceContracts: 1,
          },
        })
      )
    ).toBe(false)
  })

  it('sem contrato ativo, mas com fatura em aberto ou receita no ano → não é vazio', () => {
    const open = { ...dto().receivable, open: { count: 1, amount: '800.00' } }
    expect(isEmptyDashboard(dto({ receivable: open }))).toBe(false)
    const year = zeroYear()
    year[0] = { ...year[0], billed: '800.00' }
    expect(isEmptyDashboard(dto({ revenue12m: year }))).toBe(false)
  })
})

describe('dias e rótulos', () => {
  it('daysSince conta dias civis em São Paulo', () => {
    // 23h de 19/10 em São Paulo (já 20/10 em UTC): 1 dia, não 0
    expect(daysSince('2026-10-20T02:00:00.000Z', '2026-10-20')).toBe(1)
    expect(daysSince('2026-10-16T12:00:00.000Z', '2026-10-20')).toBe(4)
    expect(daysSince('2026-10-20T12:00:00.000Z', '2026-10-20')).toBe(0)
  })

  it('agoLabel, dueInLabel e daysLabel', () => {
    expect(agoLabel(0)).toBe('hoje')
    expect(agoLabel(1)).toBe('há 1 dia')
    expect(agoLabel(4)).toBe('há 4 dias')
    expect(dueInLabel('2026-10-20', '2026-10-20')).toBe('hoje')
    expect(dueInLabel('2026-10-21', '2026-10-20')).toBe('amanhã')
    expect(dueInLabel('2026-11-04', '2026-10-20')).toBe('em 15 dias')
    expect(daysLabel(1)).toBe('1 dia')
    expect(daysLabel(10)).toBe('10 dias')
  })
})

describe('textos da tela', () => {
  const doc = (kind: 'CONTRACT' | 'AMENDMENT', i: number) => ({
    documentId: `doc-${i}`,
    companyId: `company-${i}`,
    companyName: 'Empório Vale Claro',
    kind,
    sentAt: '2026-10-16T12:00:00.000Z',
    daysWaiting: 4,
  })

  it('monthName e countLabel', () => {
    expect(monthName('2026-10')).toBe('outubro')
    expect(countLabel(1, 'fatura', 'faturas')).toBe('1 fatura')
    expect(countLabel(6, 'fatura', 'faturas')).toBe('6 faturas')
    expect(countLabel(0, 'baixa', 'baixas')).toBe('0 baixas')
  })

  it('documentKindsLabel separa por tipo só com a lista inteira', () => {
    expect(documentKindsLabel({ total: 0, items: [] })).toBe('nenhum documento enviado')
    expect(documentKindsLabel({ total: 2, items: [doc('CONTRACT', 1), doc('AMENDMENT', 2)] })).toBe(
      '1 contrato · 1 aditivo'
    )
    expect(documentKindsLabel({ total: 2, items: [doc('CONTRACT', 1), doc('CONTRACT', 2)] })).toBe(
      '2 contratos'
    )
    const five = [1, 2, 3, 4, 5].map((i) => doc('AMENDMENT', i))
    expect(documentKindsLabel({ total: 7, items: five })).toBe('7 documentos')
  })

  it('billingDay lê o dia civil sem cair no dia anterior', () => {
    expect(billingDay('2026-11-10')).toBe('10/11/2026')
    expect(billingDay('2027-01-01')).toBe('01/01/2027')
  })

  it('timeInSaoPaulo dá a hora de Brasília, qualquer que seja o fuso', () => {
    expect(timeInSaoPaulo('2026-10-20T17:32:00.000Z')).toBe('14:32')
    expect(timeInSaoPaulo('2026-10-21T02:05:00.000Z')).toBe('23:05')
  })
})
