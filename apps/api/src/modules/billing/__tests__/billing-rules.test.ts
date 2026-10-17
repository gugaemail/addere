// Regras puras da Gestão Addere (@addere/types/billing). Protege a regra
// "entrou no mês, cobra no seguinte" e o caso "23h30 do dia 31", que os planos
// 016 e 018 também usam. O pacote de tipos não tem script de teste, então o
// teste mora aqui.
import { describe, it, expect } from 'vitest'
import {
  CLIENT_STATUS_LABELS,
  CLIENT_STATUS_ORDER,
  competenceStartInstant,
  computeBillingCalendar,
  contractMonthlyTotal,
  deriveClientStatus,
  formatBillingDate,
  formatCompetence,
  isBillableNow,
  isInvoiceOverdue,
  isValidCpf,
  resolveCompetenceTerms,
  resolveCurrentTerms,
  startOfCompetence,
  type ClientStatus,
  type ClientStatusInput,
  type ContractTermsStatus,
} from '@addere/types'
import { resolveCompanyAccess } from '../../../lib/company-access'
import { dateToYmdUtc, ymdSaoPaulo } from '../../intelligence/engine/business-days'

const utc = (iso: string) => new Date(iso)
const ymd = (d: Date) => d.toISOString().slice(0, 10)

const spDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

describe('computeBillingCalendar', () => {
  it('aceite às 00:00 de São Paulo do dia 1: o mês do aceite não é cobrado', () => {
    const r = computeBillingCalendar({
      acceptDate: utc('2026-10-01T03:00:00Z'),
      graceMonths: 0,
      dueDay: 1,
    })
    expect(ymd(r.firstBilledCompetence)).toBe('2026-11-01')
    expect(ymd(r.firstDueDate)).toBe('2026-12-01')
  })

  it('o caso do fuso: 23h30 de 31/10 em São Paulo ainda é outubro', () => {
    // 2026-11-01T02:30Z é 31/10 às 23:30 em São Paulo (UTC−3)
    const r = computeBillingCalendar({
      acceptDate: utc('2026-11-01T02:30:00Z'),
      graceMonths: 0,
      dueDay: 10,
    })
    expect(formatCompetence(r.firstBilledCompetence)).toBe('11/2026')
  })

  it('virada de dezembro para janeiro', () => {
    const r = computeBillingCalendar({
      acceptDate: utc('2026-12-15T15:00:00Z'),
      graceMonths: 0,
      dueDay: 10,
    })
    expect(ymd(r.firstBilledCompetence)).toBe('2027-01-01')
    expect(ymd(r.firstDueDate)).toBe('2027-02-10')
  })

  it('carência 0 contra carência 3, a partir do mesmo aceite', () => {
    const acceptDate = utc('2026-10-15T15:00:00Z')
    const sem = computeBillingCalendar({ acceptDate, graceMonths: 0, dueDay: 5 })
    const com = computeBillingCalendar({ acceptDate, graceMonths: 3, dueDay: 5 })
    expect(ymd(sem.firstBilledCompetence)).toBe('2026-11-01')
    expect(ymd(sem.firstDueDate)).toBe('2026-12-05')
    expect(ymd(com.firstBilledCompetence)).toBe('2027-02-01')
    expect(ymd(com.firstDueDate)).toBe('2027-03-05')
  })

  it('vencimento entre 1 e 10; fora disso, ou carência negativa, lança RangeError', () => {
    const acceptDate = utc('2026-10-15T15:00:00Z')
    expect(() => computeBillingCalendar({ acceptDate, graceMonths: 0, dueDay: 1 })).not.toThrow()
    expect(() => computeBillingCalendar({ acceptDate, graceMonths: 0, dueDay: 10 })).not.toThrow()
    expect(() => computeBillingCalendar({ acceptDate, graceMonths: 0, dueDay: 0 })).toThrow(
      RangeError
    )
    expect(() => computeBillingCalendar({ acceptDate, graceMonths: 0, dueDay: 11 })).toThrow(
      RangeError
    )
    expect(() => computeBillingCalendar({ acceptDate, graceMonths: -1, dueDay: 10 })).toThrow(
      RangeError
    )
  })

  it('o exemplo do desenho: 15/10/2026, carência 2, dia 10 → 01/2027 e 10/02/2027', () => {
    const r = computeBillingCalendar({
      acceptDate: utc('2026-10-15T15:00:00Z'),
      graceMonths: 2,
      dueDay: 10,
    })
    expect(formatCompetence(r.firstBilledCompetence)).toBe('01/2027')
    expect(formatBillingDate(r.firstDueDate)).toBe('10/02/2027')
  })
})

describe('competenceStartInstant', () => {
  it('cai no dia 1 em São Paulo; 1 ms antes cai no último dia do mês anterior', () => {
    for (const competence of [
      utc('2026-01-01T00:00:00Z'),
      utc('2026-03-01T00:00:00Z'),
      utc('2026-12-01T00:00:00Z'),
    ]) {
      const start = competenceStartInstant(competence)
      const [y, m] = [competence.getUTCFullYear(), competence.getUTCMonth()]
      const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`
      const prevLast = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
      expect(spDay.format(start)).toBe(firstDay)
      expect(spDay.format(new Date(start.getTime() - 1))).toBe(prevLast)
    }
  })

  it('startOfCompetence devolve o dia 1 à meia-noite UTC', () => {
    expect(startOfCompetence(utc('2026-10-31T12:00:00Z')).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z'
    )
  })
})

describe('resolução de termos', () => {
  type T = { status: ContractTermsStatus; effectiveFrom: Date | null; version: number }
  const t = (version: number, status: ContractTermsStatus, effectiveFrom: string | null): T => ({
    version,
    status,
    effectiveFrom: effectiveFrom ? utc(effectiveFrom) : null,
  })

  it('PROPOSED e WITHDRAWN nunca contam, nem com effectiveFrom', () => {
    const terms = [
      t(1, 'PROPOSED', '2026-10-01T12:00:00Z'),
      t(2, 'WITHDRAWN', '2026-10-01T12:00:00Z'),
    ]
    const now = utc('2027-01-01T12:00:00Z')
    expect(resolveCurrentTerms(terms, now)).toBeNull()
    expect(resolveCompetenceTerms(terms, utc('2027-01-01T00:00:00Z'))).toBeNull()
  })

  it('sem EFFECTIVE devolve null', () => {
    expect(resolveCurrentTerms([], utc('2026-10-15T12:00:00Z'))).toBeNull()
    expect(resolveCurrentTerms([t(1, 'PROPOSED', null)], utc('2026-10-15T12:00:00Z'))).toBeNull()
  })

  it('mudança no dia 15 vale na hora para o limite e cobra no mês seguinte', () => {
    const v1 = t(1, 'EFFECTIVE', '2026-10-15T15:00:00Z')
    const v2 = t(2, 'EFFECTIVE', '2026-11-15T15:00:00Z')
    const terms = [v1, v2]
    expect(resolveCurrentTerms(terms, utc('2026-11-20T12:00:00Z'))).toBe(v2)
    expect(resolveCompetenceTerms(terms, utc('2026-11-01T00:00:00Z'))).toBe(v1)
    expect(resolveCompetenceTerms(terms, utc('2026-12-01T00:00:00Z'))).toBe(v2)
  })

  it('effectiveFrom exatamente às 00:00 do dia 1 não conta para o mês; 1 ms antes conta', () => {
    const dec = utc('2026-12-01T00:00:00Z')
    const jan = utc('2027-01-01T00:00:00Z')
    const v1 = t(1, 'EFFECTIVE', '2026-10-15T15:00:00Z')
    const exato = { ...t(2, 'EFFECTIVE', null), effectiveFrom: competenceStartInstant(dec) }
    expect(resolveCompetenceTerms([v1, exato], dec)).toBe(v1)
    expect(resolveCompetenceTerms([v1, exato], jan)).toBe(exato)

    const antes = {
      ...t(2, 'EFFECTIVE', null),
      effectiveFrom: new Date(competenceStartInstant(dec).getTime() - 1),
    }
    expect(resolveCompetenceTerms([v1, antes], dec)).toBe(antes)
  })

  it('empate de effectiveFrom: vence a maior version', () => {
    const a = t(3, 'EFFECTIVE', '2026-10-15T15:00:00Z')
    const b = t(4, 'EFFECTIVE', '2026-10-15T15:00:00Z')
    expect(resolveCurrentTerms([b, a], utc('2026-10-20T12:00:00Z'))).toBe(b)
    expect(resolveCurrentTerms([a, b], utc('2026-10-20T12:00:00Z'))).toBe(b)
  })
})

describe('contractMonthlyTotal', () => {
  it('pacote + adicionais × preço do adicional', () => {
    expect(
      contractMonthlyTotal({ packagePrice: '1800.00', extraSeats: 3, extraSeatPrice: '95.50' })
    ).toBe('2086.50')
  })

  it('sem erro de ponto flutuante', () => {
    expect(
      contractMonthlyTotal({ packagePrice: '0.10', extraSeats: 2, extraSeatPrice: '0.20' })
    ).toBe('0.50')
  })

  it("aceita '1800' sem centavos e recusa vírgula", () => {
    expect(contractMonthlyTotal({ packagePrice: '1800', extraSeats: 0, extraSeatPrice: '0' })).toBe(
      '1800.00'
    )
    expect(() =>
      contractMonthlyTotal({ packagePrice: '18,00', extraSeats: 0, extraSeatPrice: '0' })
    ).toThrow(RangeError)
  })
})

describe('deriveClientStatus (plano 018: faturas e bloqueio reais)', () => {
  // Hoje: 20/10/2026 em São Paulo, salvo onde a linha diz outro dia
  const TODAY = '20261020'
  const c = (date: string) => new Date(`${date}T00:00:00Z`) // @db.Date
  const active = (graceMonths: number, firstBilledCompetence: string | null) => ({
    status: 'ACTIVE' as const,
    graceMonths,
    firstBilledCompetence: firstBilledCompetence ? c(firstBilledCompetence) : null,
  })
  const contractOf = (status: 'DRAFT' | 'PENDING_ACCEPTANCE' | 'CANCELLED') => ({
    status,
    graceMonths: 0,
    firstBilledCompetence: null,
  })
  // Liberação manual do 017 vigente, sem bloqueio gravado: o motivo sai do
  // mesmo resolveCompanyAccess do authenticate, que não olha a liberação
  const exemptCompany = {
    active: true,
    accessBlockedAt: null,
    accessBlockReason: null,
    blockExemptUntil: c('2026-10-30'),
  }

  const cases: Array<{
    caso: string
    input: Partial<ClientStatusInput> & Pick<ClientStatusInput, 'contract'>
    esperado: ClientStatus
  }> = [
    { caso: 'sem contrato', input: { contract: null }, esperado: 'NO_CONTRACT' },
    { caso: 'contrato DRAFT', input: { contract: contractOf('DRAFT') }, esperado: 'NO_CONTRACT' },
    {
      caso: 'contrato PENDING_ACCEPTANCE',
      input: { contract: contractOf('PENDING_ACCEPTANCE') },
      esperado: 'AWAITING_ACCEPTANCE',
    },
    {
      caso: 'ACTIVE, 1ª competência 11/2026 (aceite 15/10, carência 0), hoje 20/10/2026',
      input: { contract: active(0, '2026-11-01') },
      esperado: 'CURRENT',
    },
    {
      caso: 'ACTIVE, 1ª competência 01/2027 (aceite 15/10, carência 2), hoje 31/12/2026',
      input: { contract: active(2, '2027-01-01'), today: '20261231' },
      esperado: 'IN_GRACE',
    },
    {
      caso: 'o mesmo, hoje 01/01/2027',
      input: { contract: active(2, '2027-01-01'), today: '20270101' },
      esperado: 'CURRENT',
    },
    {
      caso: 'ACTIVE fora da carência, sem fatura aberta',
      input: { contract: active(0, '2026-09-01') },
      esperado: 'CURRENT',
    },
    {
      caso: 'ACTIVE, fatura que vence hoje',
      input: { contract: active(0, '2026-09-01'), openInvoiceDueDates: ['20261020'] },
      esperado: 'CURRENT',
    },
    {
      caso: 'ACTIVE, fatura que venceu ontem',
      input: { contract: active(0, '2026-09-01'), openInvoiceDueDates: ['20261019'] },
      esperado: 'OVERDUE',
    },
    {
      caso: 'ACTIVE em carência com fatura avulsa vencida (vencido > carência)',
      input: { contract: active(2, '2027-01-01'), openInvoiceDueDates: ['20261019'] },
      esperado: 'OVERDUE',
    },
    {
      caso: 'CANCELLED sem fatura aberta',
      input: { contract: contractOf('CANCELLED') },
      esperado: 'CANCELLED',
    },
    {
      caso: 'CANCELLED com fatura vencida (vencido > cancelado)',
      input: { contract: contractOf('CANCELLED'), openInvoiceDueDates: ['20261005'] },
      esperado: 'OVERDUE',
    },
    {
      caso: 'ACTIVE vencido e bloqueado (bloqueado > vencido)',
      input: {
        contract: active(0, '2026-09-01'),
        openInvoiceDueDates: ['20261005'],
        accessBlockReason: 'OVERDUE',
      },
      esperado: 'BLOCKED',
    },
    {
      caso: 'CANCELLED e motivo MANUAL (bloqueado > cancelado)',
      input: { contract: contractOf('CANCELLED'), accessBlockReason: 'MANUAL' },
      esperado: 'BLOCKED',
    },
    {
      caso: 'CANCELLED e motivo INACTIVE (a desativação é a do próprio cancelamento)',
      input: { contract: contractOf('CANCELLED'), accessBlockReason: 'INACTIVE' },
      esperado: 'CANCELLED',
    },
    {
      caso: 'ACTIVE e motivo INACTIVE (decisão 3)',
      input: { contract: active(0, '2026-09-01'), accessBlockReason: 'INACTIVE' },
      esperado: 'BLOCKED',
    },
    {
      caso: 'PENDING_ACCEPTANCE e motivo MANUAL (bloqueado > aguardando aceite)',
      input: { contract: contractOf('PENDING_ACCEPTANCE'), accessBlockReason: 'MANUAL' },
      esperado: 'BLOCKED',
    },
    {
      caso: 'sem contrato e motivo INACTIVE (decisão 3)',
      input: { contract: null, accessBlockReason: 'INACTIVE' },
      esperado: 'BLOCKED',
    },
    {
      caso: 'ACTIVE vencido com liberação manual vigente e sem bloqueio ativo',
      input: {
        contract: active(0, '2026-09-01'),
        openInvoiceDueDates: ['20261005'],
        accessBlockReason: resolveCompanyAccess(exemptCompany).reason,
      },
      esperado: 'OVERDUE',
    },
  ]

  it.each(cases)('$caso → $esperado', ({ input, esperado }) => {
    expect(
      deriveClientStatus({
        today: TODAY,
        openInvoiceDueDates: [],
        accessBlockReason: null,
        ...input,
      })
    ).toBe(esperado)
  })

  it('virada do dia em São Paulo com o servidor em UTC', () => {
    const at = (iso: string) =>
      deriveClientStatus({
        contract: active(0, '2026-09-01'),
        today: ymdSaoPaulo(new Date(iso)),
        openInvoiceDueDates: [dateToYmdUtc(c('2027-02-10'))],
        accessBlockReason: null,
      })
    // 23:59 de 10/02 em São Paulo: já é dia 11 em UTC, mas a fatura vence hoje
    expect(at('2027-02-11T02:59:00Z')).toBe('CURRENT')
    // 00:00 de 11/02 em São Paulo
    expect(at('2027-02-11T03:00:00Z')).toBe('OVERDUE')
  })

  it('as sete situações, na ordem do painel, com rótulo', () => {
    expect(CLIENT_STATUS_ORDER).toEqual(Object.keys(CLIENT_STATUS_LABELS))
    expect(CLIENT_STATUS_ORDER).toHaveLength(7)
  })
})

describe('isInvoiceOverdue', () => {
  it('vencida só depois do dia do vencimento, em dias civis', () => {
    expect(isInvoiceOverdue('20261019', '20261020')).toBe(true)
    expect(isInvoiceOverdue('20261020', '20261020')).toBe(false)
    expect(isInvoiceOverdue('20261021', '20261020')).toBe(false)
    // virada de ano
    expect(isInvoiceOverdue('20261231', '20270101')).toBe(true)
  })
})

describe('isBillableNow', () => {
  const c = (date: string) => new Date(`${date}T00:00:00Z`)
  const activeFrom = (first: string | null) => ({
    status: 'ACTIVE' as const,
    firstBilledCompetence: first ? c(first) : null,
  })

  it('o mês do aceite não é cobrado, nem com carência 0', () => {
    // aceite em 15/10/2026, carência 0: 1ª competência 11/2026
    expect(isBillableNow(activeFrom('2026-11-01'), '20261020')).toBe(false)
    expect(isBillableNow(activeFrom('2026-11-01'), '20261101')).toBe(true)
  })

  it('a carência fica de fora até a 1ª competência cobrada', () => {
    // aceite em 15/10/2026, carência 2: 1ª competência 01/2027
    expect(isBillableNow(activeFrom('2027-01-01'), '20261231')).toBe(false)
    expect(isBillableNow(activeFrom('2027-01-01'), '20270101')).toBe(true)
  })

  it('só ACTIVE com a 1ª competência gravada', () => {
    const first = c('2026-09-01')
    expect(isBillableNow(null, '20261020')).toBe(false)
    expect(isBillableNow(activeFrom(null), '20261020')).toBe(false)
    for (const status of ['DRAFT', 'PENDING_ACCEPTANCE', 'CANCELLED'] as const) {
      expect(isBillableNow({ status, firstBilledCompetence: first }, '20261020')).toBe(false)
    }
  })
})

describe('isValidCpf', () => {
  it('confere os dígitos verificadores', () => {
    expect(isValidCpf('111.444.777-35')).toBe(true)
    expect(isValidCpf('11144477735')).toBe(true)
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(isValidCpf('111.444.777-36')).toBe(false)
    expect(isValidCpf('1234')).toBe(false)
  })
})

describe('formatação de @db.Date', () => {
  it('lê o dia civil em UTC', () => {
    expect(formatBillingDate(new Date('2027-02-10T00:00:00Z'))).toBe('10/02/2027')
    expect(formatCompetence(new Date('2027-01-01T00:00:00Z'))).toBe('01/2027')
  })
})
