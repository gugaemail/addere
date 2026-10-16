// Regras puras de licença (plano 015, passo 1), de @addere/types/billing: quem
// ocupa licença, quando uma escrita passa a ocupar uma, o limite do contrato e
// a frase que o administrador indicado aceita ao pedir licenças. O pacote de
// tipos não tem script de teste, então o teste mora aqui.
import { describe, it, expect } from 'vitest'
import {
  consumesSeat,
  holdsSeat,
  licenseRequestDeclaration,
  seatLimit,
  type SeatSubject,
} from '@addere/types'

// Espaço não separável e o estreito, que o Intl põe no "R$ 99,00" conforme a
// versão do ICU (por código, para o caractere não ficar invisível no arquivo)
const NO_BREAK_SPACES = [0x00a0, 0x202f].map((code) => String.fromCharCode(code))

const A = 'empresa-a'
const B = 'empresa-b'

const seller = (over: Partial<SeatSubject> = {}): SeatSubject => ({
  role: 'SALESPERSON',
  active: true,
  companyId: A,
  ...over,
})
const admin = (over: Partial<SeatSubject> = {}): SeatSubject => seller({ role: 'ADMIN', ...over })

describe('consumesSeat', () => {
  it.each<[string, SeatSubject | null, SeatSubject, boolean]>([
    ['criar vendedor', null, seller(), true],
    ['criar ADMIN', null, admin(), false],
    ['ativar vendedor', seller({ active: false }), seller(), true],
    ['ativar ADMIN', admin({ active: false }), admin(), false],
    ['desativar', seller(), seller({ active: false }), false],
    ['ADMIN ativo vira vendedor', admin(), seller(), true],
    ['ADMIN inativo vira vendedor', admin({ active: false }), seller({ active: false }), false],
    ['editar vendedor que continua vendedor', seller(), seller(), false],
    ['vincular órfão vendedor ativo', seller({ companyId: null }), seller(), true],
    [
      'vincular órfão inativo',
      seller({ companyId: null, active: false }),
      seller({ active: false }),
      false,
    ],
    ['companyId null', null, seller({ companyId: null }), false],
    ['vendedor de outra empresa conta como novo', seller({ companyId: B }), seller(), true],
  ])('%s → %s', (_label, before, after, expected) => {
    expect(consumesSeat(before, after)).toBe(expected)
  })

  it('objeto sem role nem active não ocupa (mocks e selects parciais)', () => {
    const partial = { companyId: A } as unknown as SeatSubject
    expect(holdsSeat(partial)).toBe(false)
    expect(consumesSeat(null, partial)).toBe(false)
    expect(consumesSeat(partial, partial)).toBe(false)
  })
})

describe('seatLimit', () => {
  it('soma incluídas e adicionais', () => {
    expect(seatLimit({ includedSeats: 20, extraSeats: 2 })).toBe(22)
  })

  it('Ilimitado com quantidade digitada não é infinito', () => {
    expect(seatLimit({ includedSeats: 100, extraSeats: 0 })).toBe(100)
  })
})

describe('licenseRequestDeclaration', () => {
  it('plural: o texto aprovado em 15/10/2026, byte a byte', () => {
    expect(licenseRequestDeclaration(2, '99')).toBe(
      'Ao enviar, você contrata 2 licenças adicionais a R$ 99,00 por mês cada, cobradas a partir do mês seguinte à liberação.'
    )
  })

  it('singular faz só a concordância', () => {
    expect(licenseRequestDeclaration(1, '120.5')).toBe(
      'Ao enviar, você contrata 1 licença adicional a R$ 120,50 por mês, cobrada a partir do mês seguinte à liberação.'
    )
  })

  it('número e string dão o mesmo texto, com milhar', () => {
    expect(licenseRequestDeclaration(3, 2400.5)).toBe(licenseRequestDeclaration(3, '2400.50'))
    expect(licenseRequestDeclaration(3, '2400.5')).toContain('R$ 2.400,50')
  })

  it('sem espaço não separável (o Intl poria um)', () => {
    for (const text of [
      licenseRequestDeclaration(2, '99'),
      licenseRequestDeclaration(1, '1234.56'),
    ]) {
      for (const ch of NO_BREAK_SPACES) expect(text).not.toContain(ch)
    }
  })
})
