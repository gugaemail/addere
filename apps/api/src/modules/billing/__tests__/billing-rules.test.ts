// Regras puras da Gestão Addere (@addere/types/billing). Protege a regra
// "entrou no mês, cobra no seguinte" e o caso "23h30 do dia 31", que os planos
// 016 e 018 também usam. O pacote de tipos não tem script de teste, então o
// teste mora aqui.
import { describe, it, expect } from 'vitest'
import {
  CLIENT_STATUS_LABELS,
  competenceStartInstant,
  computeBillingCalendar,
  contractMonthlyTotal,
  deriveClientStatus,
  formatBillingDate,
  formatCompetence,
  isValidCpf,
  resolveCompetenceTerms,
  resolveCurrentTerms,
  startOfCompetence,
  type ClientStatusInput,
  type ContractTermsStatus,
} from '@addere/types'

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

describe('deriveClientStatus', () => {
  const now = utc('2026-10-20T15:00:00Z')
  const active = (graceMonths: number, firstBilledCompetence: string | null) => ({
    status: 'ACTIVE' as const,
    graceMonths,
    firstBilledCompetence: firstBilledCompetence ? utc(firstBilledCompetence) : null,
  })
  const s = (input: Omit<ClientStatusInput, 'now'>) => deriveClientStatus({ now, ...input })

  it('um caso por estado', () => {
    expect(s({ contract: null })).toBe('NO_CONTRACT')
    expect(
      s({ contract: { status: 'PENDING_ACCEPTANCE', graceMonths: 0, firstBilledCompetence: null } })
    ).toBe('AWAITING_ACCEPTANCE')
    expect(s({ contract: active(2, '2027-01-01T00:00:00Z') })).toBe('IN_GRACE')
    expect(s({ contract: active(0, '2026-11-01T00:00:00Z') })).toBe('CURRENT')
    expect(s({ contract: active(0, '2026-09-01T00:00:00Z'), hasOverdueInvoice: true })).toBe(
      'OVERDUE'
    )
    expect(s({ contract: active(0, '2026-09-01T00:00:00Z'), accessBlockReason: 'MANUAL' })).toBe(
      'BLOCKED'
    )
    expect(
      s({ contract: { status: 'CANCELLED', graceMonths: 0, firstBilledCompetence: null } })
    ).toBe('CANCELLED')
    expect(Object.keys(CLIENT_STATUS_LABELS)).toHaveLength(7)
  })

  it('precedência', () => {
    const cancelled = { status: 'CANCELLED' as const, graceMonths: 0, firstBilledCompetence: null }
    // bloqueio por atraso vence a fatura vencida
    expect(
      s({
        contract: active(0, '2026-09-01T00:00:00Z'),
        accessBlockReason: 'OVERDUE',
        hasOverdueInvoice: true,
      })
    ).toBe('BLOCKED')
    // dívida de contrato encerrado ainda precisa ser cobrada
    expect(s({ contract: cancelled, hasOverdueInvoice: true })).toBe('OVERDUE')
    // o cancelamento do 016 desativa a empresa: continua aparecendo como cancelado
    expect(s({ contract: cancelled, accessBlockReason: 'INACTIVE' })).toBe('CANCELLED')
    // desativada e não cancelada: ninguém entra
    expect(s({ contract: active(0, '2026-09-01T00:00:00Z'), accessBlockReason: 'INACTIVE' })).toBe(
      'BLOCKED'
    )
    expect(s({ contract: null, accessBlockReason: 'INACTIVE' })).toBe('BLOCKED')
  })

  it('DRAFT é sem contrato', () => {
    expect(s({ contract: { status: 'DRAFT', graceMonths: 2, firstBilledCompetence: null } })).toBe(
      'NO_CONTRACT'
    )
  })

  it('carência 2 antes da 1ª competência → em carência', () => {
    // aceite em 10/2026 com carência 2: 1ª competência 01/2027
    expect(s({ contract: active(2, '2027-01-01T00:00:00Z') })).toBe('IN_GRACE')
    expect(
      deriveClientStatus({
        contract: active(2, '2027-01-01T00:00:00Z'),
        now: utc('2027-01-10T15:00:00Z'),
      })
    ).toBe('CURRENT')
  })

  it('carência 0 no mês do aceite → em dia (nada cobrado nem devido)', () => {
    expect(s({ contract: active(0, '2026-11-01T00:00:00Z') })).toBe('CURRENT')
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
