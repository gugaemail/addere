// Painel da Gestão Addere (plano 018): a agregação pura, sem banco. Os números
// fecham entre si: MRR com Ilimitado e adicionais, a fronteira de 90 % das
// licenças, a virada do dia em São Paulo no vencido e a baixa no dia 1.
// Empresas e valores fictícios.
import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { CLIENT_STATUS_ORDER } from '@addere/types'
import {
  buildBillingDashboard,
  lastClosedMonths,
  revenueWindowStart,
  termsMonthlyValue,
  type DashboardCompanyRow,
  type DashboardInvoiceRow,
  type DashboardSource,
  type DashboardTermsRow,
} from '../dashboard'

const dec = (v: string) => new Prisma.Decimal(v)
const day = (iso: string) => new Date(`${iso}T00:00:00Z`) // @db.Date

// 20/10/2026, meio-dia em São Paulo
const NOW = new Date('2026-10-20T15:00:00Z')

const terms = (over: Partial<DashboardTermsRow> = {}): DashboardTermsRow => ({
  version: 1,
  status: 'EFFECTIVE',
  effectiveFrom: new Date('2026-05-15T15:00:00Z'),
  includedSeats: 10,
  extraSeats: 0,
  packagePrice: dec('0.00'),
  extraSeatPrice: dec('0.00'),
  ...over,
})

function company(
  id: string,
  name: string,
  contract: DashboardCompanyRow['contract'],
  over: Partial<DashboardCompanyRow> = {}
): DashboardCompanyRow {
  return {
    id,
    name,
    active: true,
    accessBlockedAt: null,
    accessBlockReason: null,
    contract,
    ...over,
  }
}

const active = (firstBilled: string, graceMonths: number, t: DashboardTermsRow[]) => ({
  status: 'ACTIVE' as const,
  graceMonths,
  firstBilledCompetence: day(firstBilled),
  terms: t,
})

let invoiceSeq = 0
function invoice(over: Partial<DashboardInvoiceRow> & { companyId: string }): DashboardInvoiceRow {
  invoiceSeq += 1
  return {
    id: `inv-${invoiceSeq}`,
    number: invoiceSeq,
    competence: day('2026-09-01'),
    dueDate: day('2026-10-10'),
    status: 'OPEN',
    total: dec('100.00'),
    paidAt: null,
    paidAmount: null,
    ...over,
  }
}

const source = (over: Partial<DashboardSource> = {}): DashboardSource => ({
  companies: [],
  invoices: [],
  documents: [],
  licenseRequests: [],
  usedSeats: new Map(),
  ...over,
})

// ─── As cinco empresas do esboço ─────────────────────────────────────────────

// A: Pacote 10 Padrão, fora da carência: 1500.00 + 2 × 120.00 = 1740.00, limite 12
const A = company(
  'company-a',
  'Mercado Sol Ltda',
  active('2026-09-01', 0, [
    terms({
      includedSeats: 10,
      extraSeats: 2,
      packagePrice: dec('1500.00'),
      extraSeatPrice: dec('120.00'),
    }),
  ])
)
// B: Ilimitado Com Inteligência, 100 digitadas: 9000.00 + 5 × 85.50 = 9427.50, limite 105
const B = company(
  'company-b',
  'Distribuidora Norte',
  active('2026-06-01', 0, [
    terms({
      includedSeats: 100,
      extraSeats: 5,
      packagePrice: dec('9000.00'),
      extraSeatPrice: dec('85.50'),
    }),
  ])
)
// C: aceite em 05/10/2026 com carência 2 (1ª competência 01/2027): 1000.00, limite 20
const C = company(
  'company-c',
  'Casa do Campo Ltda',
  active('2027-01-01', 2, [
    terms({
      effectiveFrom: new Date('2026-10-05T15:00:00Z'),
      includedSeats: 20,
      packagePrice: dec('1000.00'),
    }),
  ])
)
// D: aguardando aceite, com termos PROPOSED de 3000.00
const D = company('company-d', 'Empório Vale Claro', {
  status: 'PENDING_ACCEPTANCE',
  graceMonths: 0,
  firstBilledCompetence: null,
  terms: [terms({ status: 'PROPOSED', effectiveFrom: null, packagePrice: dec('3000.00') })],
})
// E: cancelado
const E = company(
  'company-e',
  'Atacado Ponte Alta',
  {
    status: 'CANCELLED',
    graceMonths: 0,
    firstBilledCompetence: day('2026-03-01'),
    terms: [terms({ packagePrice: dec('800.00') })],
  },
  { active: false }
)

const used = (a: number, b: number, c: number) =>
  new Map([
    [A.id, a],
    [B.id, b],
    [C.id, c],
    [D.id, 30],
    [E.id, 4],
  ])

const fiveCompanies = (over: Partial<DashboardSource> = {}) =>
  source({ companies: [A, B, C, D, E], usedSeats: used(13, 95, 18), ...over })

describe('termsMonthlyValue', () => {
  it('soma em Decimal, sem erro de ponto flutuante', () => {
    const value = termsMonthlyValue({
      packagePrice: dec('0.10'),
      extraSeats: 2,
      extraSeatPrice: dec('0.10'),
    })
    expect(value.toFixed(2)).toBe('0.30')
  })
})

describe('MRR', () => {
  it('Ilimitado e adicionais; carência fora do faturável; pendente e cancelado fora de tudo', () => {
    const dto = buildBillingDashboard(fiveCompanies(), NOW)
    expect(dto.mrr).toEqual({
      contracted: '12167.50',
      billable: '11167.50',
      activeContracts: 3,
      graceContracts: 1,
    })
  })

  it('aditivo EFFECTIVE que só vale no mês que vem não muda o MRR', () => {
    const withAmendment = company(A.id, A.name, {
      ...A.contract!,
      terms: [
        ...A.contract!.terms,
        terms({
          version: 2,
          effectiveFrom: new Date('2026-11-01T03:01:00Z'),
          packagePrice: dec('2500.00'),
        }),
      ],
    })
    const dto = buildBillingDashboard(
      fiveCompanies({ companies: [withAmendment, B, C, D, E] }),
      NOW
    )
    expect(dto.mrr.contracted).toBe('12167.50')
  })

  it('no mês do aceite com carência 0 o contrato está no MRR contratado, não no faturável', () => {
    const justAccepted = company(
      'company-f',
      'Loja Recém Aceita',
      active('2026-11-01', 0, [terms({ packagePrice: dec('500.00') })])
    )
    const dto = buildBillingDashboard(source({ companies: [justAccepted] }), NOW)
    expect(dto.mrr).toEqual({
      contracted: '500.00',
      billable: '0.00',
      activeContracts: 1,
      graceContracts: 1,
    })
    // A situação, por outro lado, é "em dia": nada vencido nem carência contratada
    expect(dto.clientsByStatus.CURRENT).toBe(1)
  })
})

describe('licenças', () => {
  it('ocupação só de contratos ACTIVE e "perto do limite" do mais ocupado ao menos', () => {
    const dto = buildBillingDashboard(fiveCompanies(), NOW)
    expect(dto.seats).toEqual({ used: 126, limit: 137 })
    // A 13/12 (108 %), B 95/105 (90,5 %), C 18/20 (90 % exatos); D pendente fica fora
    expect(dto.nearSeatLimit.items.map((s) => [s.companyName, s.used, s.limit])).toEqual([
      ['Mercado Sol Ltda', 13, 12],
      ['Distribuidora Norte', 95, 105],
      ['Casa do Campo Ltda', 18, 20],
    ])
    expect(dto.nearSeatLimit.total).toBe(3)
  })

  it('B com 94 de 105 (89,5 %) sai da lista; C em 90 % exatos fica', () => {
    const dto = buildBillingDashboard(fiveCompanies({ usedSeats: used(13, 94, 18) }), NOW)
    expect(dto.nearSeatLimit.items.map((s) => s.companyName)).toEqual([
      'Mercado Sol Ltda',
      'Casa do Campo Ltda',
    ])
  })
})

describe('vencido na virada do dia em São Paulo', () => {
  const X = company('company-x', 'Mercado Sol Ltda', active('2026-09-01', 0, [terms()]))
  const due = invoice({ companyId: X.id, dueDate: day('2027-02-10'), total: dec('1740.00') })
  const at = (iso: string) =>
    buildBillingDashboard(source({ companies: [X], invoices: [due] }), new Date(iso))

  it('23:59 de 10/02 em São Paulo (já 11/02 em UTC): vence hoje, não está vencida', () => {
    const dto = at('2027-02-11T02:59:00Z')
    expect(dto.today).toBe('2027-02-10')
    expect(dto.receivable.overdue).toEqual({ count: 0, amount: '0.00' })
    expect(dto.receivable.dueNext15Days).toEqual({ count: 1, amount: '1740.00' })
    expect(dto.upcomingInvoices.items[0]).toMatchObject({
      invoiceId: due.id,
      dueDate: '2027-02-10',
      daysOverdue: 0,
    })
    expect(dto.clientsByStatus.CURRENT).toBe(1)
  })

  it('00:00 de 11/02 em São Paulo: vencida há 1 dia, e a empresa vira "vencido"', () => {
    const dto = at('2027-02-11T03:00:00Z')
    expect(dto.receivable.overdue).toEqual({ count: 1, amount: '1740.00' })
    expect(dto.overdueInvoices.items[0]).toMatchObject({ invoiceId: due.id, daysOverdue: 1 })
    expect(dto.upcomingInvoices.total).toBe(0)
    expect(dto.clientsByStatus.OVERDUE).toBe(1)
    expect(dto.receivable.open).toEqual({ count: 1, amount: '1740.00' })
  })

  it('vence em 15 dias inclui o 15º dia e não o 16º', () => {
    const X2 = invoice({ companyId: X.id, dueDate: day('2027-02-25') })
    const X3 = invoice({ companyId: X.id, dueDate: day('2027-02-26') })
    const dto = buildBillingDashboard(
      source({ companies: [X], invoices: [X3, X2] }),
      new Date('2027-02-10T15:00:00Z')
    )
    expect(dto.upcomingInvoices.items.map((i) => i.dueDate)).toEqual(['2027-02-25'])
    expect(dto.receivable.open.count).toBe(2)
  })
})

describe('recebido no mês (paidAt é @db.Date)', () => {
  const X = company('company-x', 'Mercado Sol Ltda', active('2026-09-01', 0, [terms()]))
  const paidFeb = invoice({
    companyId: X.id,
    competence: day('2027-01-01'),
    status: 'PAID',
    total: dec('700.00'),
    paidAt: day('2027-02-28'),
    paidAmount: dec('700.00'),
  })
  // Baixa com data de 01/03: meia-noite UTC é 21h de 28/02 em São Paulo. Pelo
  // ymdSaoPaulo ela cairia em fevereiro; o dia civil gravado é março.
  const paidMar = invoice({
    companyId: X.id,
    competence: day('2027-02-01'),
    status: 'PAID',
    total: dec('300.00'),
    paidAt: day('2027-03-01'),
    paidAmount: dec('300.00'),
  })

  it('a baixa conta no mês do dia civil informado, no KPI e no gráfico', () => {
    const dto = buildBillingDashboard(
      source({ companies: [X], invoices: [paidFeb, paidMar] }),
      new Date('2027-03-10T15:00:00Z')
    )
    expect(dto.receivable.receivedThisMonth).toEqual({ count: 1, amount: '300.00' })
    const feb = dto.revenue12m.find((m) => m.month === '2027-02')
    expect(feb).toEqual({ month: '2027-02', billed: '300.00', received: '700.00' })
    expect(dto.revenue12m.at(-1)?.month).toBe('2027-02')
    // Fatura paga não está a receber
    expect(dto.receivable.open.count).toBe(0)
  })
})

describe('receita dos últimos 12 meses', () => {
  it('lastClosedMonths: os 12 meses fechados antes do mês corrente', () => {
    expect(lastClosedMonths('20270105', 12)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ])
    // Hoje em out/2026 → de out/2025 a set/2026
    const oct = lastClosedMonths('20261020', 12)
    expect([oct[0], oct[11]]).toEqual(['2025-10', '2026-09'])
    expect(revenueWindowStart('20261020')).toEqual(day('2025-10-01'))
  })

  it('competência corrente fora, meses vazios em zero, cancelada fora de tudo', () => {
    const X = company('company-x', 'Mercado Sol Ltda', active('2026-02-01', 0, [terms()]))
    const dto = buildBillingDashboard(
      source({
        companies: [X],
        invoices: [
          invoice({ companyId: X.id, competence: day('2026-03-01'), total: dec('1000.00') }),
          invoice({
            companyId: X.id,
            competence: day('2026-12-01'),
            status: 'PAID',
            total: dec('500.00'),
            paidAt: day('2027-01-03'),
            paidAmount: dec('500.00'),
          }),
          // competência do mês corrente: ainda não fechou
          invoice({ companyId: X.id, competence: day('2027-01-01'), total: dec('999.00') }),
          invoice({
            companyId: X.id,
            competence: day('2026-05-01'),
            status: 'CANCELLED',
            total: dec('777.00'),
          }),
        ],
      }),
      new Date('2027-01-05T15:00:00Z')
    )
    expect(dto.revenue12m).toHaveLength(12)
    expect(dto.revenue12m[0].month).toBe('2026-01')
    expect(dto.revenue12m[11].month).toBe('2026-12')
    const byMonth = Object.fromEntries(dto.revenue12m.map((m) => [m.month, m]))
    expect(byMonth['2026-03']).toEqual({ month: '2026-03', billed: '1000.00', received: '0.00' })
    expect(byMonth['2026-12']).toEqual({ month: '2026-12', billed: '500.00', received: '0.00' })
    expect(byMonth['2026-05']).toEqual({ month: '2026-05', billed: '0.00', received: '0.00' })
    expect(byMonth['2026-07']).toEqual({ month: '2026-07', billed: '0.00', received: '0.00' })
    // A cancelada não está a receber; a corrente está
    expect(dto.receivable.open).toEqual({ count: 2, amount: '1999.00' })
    expect(dto.receivable.receivedThisMonth).toEqual({ count: 1, amount: '500.00' })
  })
})

describe('situação, aceite, solicitações e listas', () => {
  it('as sete situações sempre, somando o número de empresas', () => {
    const F = company('company-f', 'Loja Sem Contrato', null)
    const dto = buildBillingDashboard(fiveCompanies({ companies: [A, B, C, D, E, F] }), NOW)
    expect(Object.keys(dto.clientsByStatus)).toEqual([...CLIENT_STATUS_ORDER])
    expect(dto.clientsByStatus).toEqual({
      NO_CONTRACT: 1,
      AWAITING_ACCEPTANCE: 1,
      IN_GRACE: 1,
      CURRENT: 2,
      OVERDUE: 0,
      BLOCKED: 0,
      CANCELLED: 1,
    })
    const sum = Object.values(dto.clientsByStatus).reduce((a, b) => a + b, 0)
    expect(sum).toBe(6)
  })

  it('aguardando aceite: contrato e aditivo, do envio mais antigo, com os dias em São Paulo', () => {
    const dto = buildBillingDashboard(
      fiveCompanies({
        documents: [
          // 23h de 19/10 em São Paulo (já 20/10 em UTC): 1 dia de espera, não 0
          {
            id: 'doc-2',
            companyId: A.id,
            kind: 'AMENDMENT',
            status: 'SENT',
            sentAt: new Date('2026-10-20T02:00:00Z'),
          },
          {
            id: 'doc-1',
            companyId: D.id,
            kind: 'CONTRACT',
            status: 'SENT',
            sentAt: new Date('2026-10-16T12:00:00Z'),
          },
          {
            id: 'doc-0',
            companyId: B.id,
            kind: 'CONTRACT',
            status: 'ACCEPTED',
            sentAt: new Date('2026-06-01T12:00:00Z'),
          },
        ],
      }),
      NOW
    )
    expect(dto.pendingAcceptance.total).toBe(2)
    expect(dto.pendingAcceptance.items.map((d) => [d.companyName, d.kind, d.daysWaiting])).toEqual([
      ['Empório Vale Claro', 'CONTRACT', 4],
      ['Mercado Sol Ltda', 'AMENDMENT', 1],
    ])
    // Cliente ativo com aditivo pendente continua "em dia" na situação
    expect(dto.clientsByStatus.AWAITING_ACCEPTANCE).toBe(1)
  })

  it('solicitações pendentes, da mais antiga para a mais nova', () => {
    const dto = buildBillingDashboard(
      fiveCompanies({
        licenseRequests: [
          {
            id: 'req-2',
            companyId: B.id,
            quantity: 5,
            status: 'PENDING',
            createdAt: new Date('2026-10-17T12:00:00Z'),
          },
          {
            id: 'req-1',
            companyId: A.id,
            quantity: 2,
            status: 'PENDING',
            createdAt: new Date('2026-10-19T12:00:00Z'),
          },
          {
            id: 'req-0',
            companyId: A.id,
            quantity: 1,
            status: 'REJECTED',
            createdAt: new Date('2026-10-01T12:00:00Z'),
          },
        ],
      }),
      NOW
    )
    expect(dto.pendingLicenseRequests).toEqual({
      total: 2,
      items: [
        {
          requestId: 'req-2',
          companyId: B.id,
          companyName: 'Distribuidora Norte',
          quantity: 5,
          createdAt: '2026-10-17T12:00:00.000Z',
        },
        {
          requestId: 'req-1',
          companyId: A.id,
          companyName: 'Mercado Sol Ltda',
          quantity: 2,
          createdAt: '2026-10-19T12:00:00.000Z',
        },
      ],
    })
  })

  it('com 7 faturas vencidas, o total é 7 e a lista traz as 5 mais antigas', () => {
    const overdue = [7, 3, 5, 1, 6, 2, 4].map((d) =>
      invoice({
        companyId: A.id,
        competence: day('2026-08-01'),
        dueDate: day(`2026-09-0${d}`),
        total: dec('10.10'),
      })
    )
    const dto = buildBillingDashboard(fiveCompanies({ invoices: overdue }), NOW)
    expect(dto.receivable.overdue).toEqual({ count: 7, amount: '70.70' })
    expect(dto.overdueInvoices.total).toBe(7)
    expect(dto.overdueInvoices.items.map((i) => i.dueDate)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      '2026-09-05',
    ])
    // 01/09 a 20/10: 49 dias
    expect(dto.overdueInvoices.items[0]).toMatchObject({
      companyName: 'Mercado Sol Ltda',
      competence: '2026-08',
      total: '10.10',
      daysOverdue: 49,
    })
    expect(dto.clientsByStatus.OVERDUE).toBe(1)
  })

  it('sem nada: tudo zerado, sete situações em zero, 12 meses em "0.00"', () => {
    const dto = buildBillingDashboard(source(), NOW)
    expect(dto.mrr).toEqual({
      contracted: '0.00',
      billable: '0.00',
      activeContracts: 0,
      graceContracts: 0,
    })
    expect(Object.values(dto.clientsByStatus)).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(dto.revenue12m).toHaveLength(12)
    expect(dto.revenue12m.every((m) => m.billed === '0.00' && m.received === '0.00')).toBe(true)
    expect(dto.today).toBe('2026-10-20')
    expect(dto.generatedAt).toBe(NOW.toISOString())
  })
})
