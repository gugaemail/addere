import { describe, expect, it } from 'vitest'
import {
  BILLING_EVENT_TYPES,
  CLIENT_STATUS_LABELS,
  formatBillingDate,
  formatCompetence,
  type CompanyContractDto,
  type ContractTermsDto,
  type LicensePackageDto,
} from '@addere/types'
import {
  BILLING_EVENT_LABELS,
  CLIENT_STATUS_BADGE,
  billingFieldLabel,
  acceptancePreview,
  currentTermsOf,
  draftMonthlyTotal,
  listPricesFor,
  moneyApiToInput,
  moneyInputToApi,
  parseMoneyInput,
  proposedTermsOf,
  todayInSaoPaulo,
} from '../billing-ui'

describe('parseMoneyInput', () => {
  it('com vírgula: formato brasileiro', () => {
    expect(parseMoneyInput('1.800,50')).toBe(1800.5)
    expect(parseMoneyInput('1800,5')).toBe(1800.5)
    expect(parseMoneyInput('12.345.678,90')).toBe(12345678.9)
  })

  it('sem vírgula e só grupos de milhar: os pontos são milhar', () => {
    expect(parseMoneyInput('1.800')).toBe(1800)
    expect(parseMoneyInput('12.345.678')).toBe(12345678)
  })

  it('fora isso, número simples', () => {
    expect(parseMoneyInput('1800')).toBe(1800)
    expect(parseMoneyInput('1.5')).toBe(1.5)
    expect(parseMoneyInput('1.80')).toBe(1.8)
    expect(parseMoneyInput('1800.00')).toBe(1800)
  })

  it('aceita R$ e espaços', () => {
    expect(parseMoneyInput('R$ 1.800,00')).toBe(1800)
    expect(parseMoneyInput('  R$1.800  ')).toBe(1800)
  })

  it('vazio, lixo e negativo → null', () => {
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('   ')).toBeNull()
    expect(parseMoneyInput('R$')).toBeNull()
    expect(parseMoneyInput('abc')).toBeNull()
    expect(parseMoneyInput('12abc')).toBeNull()
    expect(parseMoneyInput('1,2,3')).toBeNull()
    expect(parseMoneyInput('0x10')).toBeNull()
    expect(parseMoneyInput('1e3')).toBeNull()
    expect(parseMoneyInput('-5')).toBeNull()
    expect(parseMoneyInput('-5,00')).toBeNull()
  })
})

describe('moneyInputToApi', () => {
  it('converte o que se digita no Brasil para o formato da API', () => {
    expect(moneyInputToApi('1.800,00')).toBe('1800.00')
    expect(moneyInputToApi('95,5')).toBe('95.50')
    expect(moneyInputToApi('1800.00')).toBe('1800.00')
    expect(moneyInputToApi('R$ 2.086,50')).toBe('2086.50')
    // Ponto de milhar sem centavos: mil e oitocentos, não R$ 1,80
    expect(moneyInputToApi('1.800')).toBe('1800.00')
  })

  it('vazio, inválido ou negativo → null', () => {
    expect(moneyInputToApi('')).toBeNull()
    expect(moneyInputToApi('   ')).toBeNull()
    expect(moneyInputToApi('abc')).toBeNull()
    expect(moneyInputToApi('-5,00')).toBeNull()
  })
})

describe('moneyApiToInput', () => {
  it('formata para o campo e volta sem perda', () => {
    expect(moneyApiToInput('1800.00')).toBe('1.800,00')
    expect(moneyApiToInput(null)).toBe('')
    expect(moneyInputToApi(moneyApiToInput('1234567.89'))).toBe('1234567.89')
  })
})

describe('mapas de rótulo e cor', () => {
  it('CLIENT_STATUS_BADGE cobre as sete situações', () => {
    expect(Object.keys(CLIENT_STATUS_BADGE).sort()).toEqual(
      Object.keys(CLIENT_STATUS_LABELS).sort()
    )
    expect(Object.keys(CLIENT_STATUS_BADGE)).toHaveLength(7)
    expect(CLIENT_STATUS_BADGE.CURRENT).toBe('success')
    expect(CLIENT_STATUS_BADGE.BLOCKED).toBe('danger')
  })

  it('todo tipo de evento tem rótulo', () => {
    for (const type of BILLING_EVENT_TYPES) expect(BILLING_EVENT_LABELS[type]).toBeTruthy()
  })

  it('campo sem rótulo aparece com o nome cru', () => {
    expect(billingFieldLabel('legalRepCpf')).toBe('CPF do representante')
    expect(billingFieldLabel('campoNovo')).toBe('campoNovo')
  })
})

describe('termos do contrato', () => {
  const terms = (over: Partial<ContractTermsDto>): ContractTermsDto => ({
    id: `t${over.version}`,
    version: 1,
    status: 'PROPOSED',
    origin: 'CONTRACT',
    proposedEffectiveFrom: null,
    effectiveFrom: null,
    packageId: 'p',
    packageCode: 'P10',
    packageName: 'Pacote 10',
    licenseType: 'STANDARD',
    includedSeats: 10,
    extraSeats: 0,
    packagePrice: '900.00',
    extraSeatPrice: '95.00',
    monthlyTotal: '900.00',
    reason: null,
    createdByName: null,
    createdAt: '2026-10-15T12:00:00.000Z',
    ...over,
  })
  const contract = (list: ContractTermsDto[]): CompanyContractDto => ({
    id: 'c',
    status: 'ACTIVE',
    startDate: null,
    graceMonths: 0,
    firstBilledCompetence: null,
    dueDay: 10,
    overdueBlockDays: null,
    terms: list,
  })

  it('o atual é o EFFECTIVE vigente; o proposto é o PROPOSED de maior versão', () => {
    const c = contract([
      terms({ version: 1, status: 'EFFECTIVE', effectiveFrom: '2026-10-15T15:00:00.000Z' }),
      terms({ version: 2, status: 'PROPOSED' }),
      terms({ version: 3, status: 'PROPOSED' }),
    ])
    expect(currentTermsOf(c, new Date('2026-10-20T12:00:00Z'))?.version).toBe(1)
    expect(currentTermsOf(c, new Date('2026-10-01T12:00:00Z'))).toBeNull()
    expect(proposedTermsOf(c)?.version).toBe(3)
  })

  it('sem contrato, nada', () => {
    expect(currentTermsOf(null, new Date())).toBeNull()
    expect(proposedTermsOf(null)).toBeNull()
  })
})

describe('formulário do rascunho', () => {
  const pkg: LicensePackageDto = {
    id: 'p20',
    code: 'P20',
    name: 'Pacote 20',
    seats: 20,
    listPriceStandard: '1800.00',
    listPriceIntelligence: '2400.00',
    listExtraSeatPriceStandard: '95.00',
    listExtraSeatPriceIntelligence: null,
    active: true,
    sortOrder: 20,
  }

  it('preço de tabela por tipo de licença', () => {
    expect(listPricesFor(pkg, 'STANDARD')).toEqual({
      packagePrice: '1800.00',
      extraSeatPrice: '95.00',
    })
    expect(listPricesFor(pkg, 'INTELLIGENCE')).toEqual({
      packagePrice: '2400.00',
      extraSeatPrice: null,
    })
  })

  it('total mensal ao vivo; campo inválido some com o total', () => {
    expect(
      draftMonthlyTotal({ packagePrice: '1.800,00', extraSeats: '3', extraSeatPrice: '95,50' })
    ).toBe('2086.50')
    expect(draftMonthlyTotal({ packagePrice: '', extraSeats: '0', extraSeatPrice: '0' })).toBeNull()
    expect(
      draftMonthlyTotal({ packagePrice: '10', extraSeats: 'x', extraSeatPrice: '0' })
    ).toBeNull()
  })

  it('prévia do aceite: o exemplo do desenho, e nada fora da faixa', () => {
    const now = new Date('2026-10-15T15:00:00Z')
    const p = acceptancePreview({ graceMonths: '2', dueDay: '10' }, now)
    expect(p && formatCompetence(p.firstBilledCompetence)).toBe('01/2027')
    expect(p && formatBillingDate(p.firstDueDate)).toBe('10/02/2027')
    expect(acceptancePreview({ graceMonths: '0', dueDay: '11' }, now)).toBeNull()
    expect(acceptancePreview({ graceMonths: '', dueDay: '10' }, now)).toBeNull()
  })

  it('hoje em São Paulo, mesmo às 23h30 do dia 31', () => {
    expect(todayInSaoPaulo(new Date('2026-11-01T02:30:00Z'))).toBe('31/10/2026')
  })
})
