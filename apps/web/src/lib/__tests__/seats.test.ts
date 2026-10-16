import { describe, expect, it } from 'vitest'
import type { SeatSubject, SeatUsage } from '@addere/types'
import {
  licenseRequestBlockedReason,
  monthlyIncrease,
  overLimitMessage,
  parseLicenseQuantity,
  seatBlocksSave,
  seatMeterTone,
  seatPercent,
  seatsSubtitle,
  seatsToFree,
} from '../seats'

const A = 'empresa-a'

function usage(used: number, limit: number | null, over: Partial<SeatUsage> = {}): SeatUsage {
  const enforced = limit !== null
  return {
    contractStatus: enforced ? 'ACTIVE' : null,
    enforced,
    used,
    limit,
    available: limit === null ? null : Math.max(limit - used, 0),
    overLimit: limit !== null && used > limit,
    holders: [],
    ...over,
  }
}

const seller = (over: Partial<SeatSubject> = {}): SeatSubject => ({
  role: 'SALESPERSON',
  active: true,
  companyId: A,
  ...over,
})
const admin = (over: Partial<SeatSubject> = {}): SeatSubject => seller({ role: 'ADMIN', ...over })

describe('seatsSubtitle', () => {
  it('sem limite: nada no cabeçalho', () => {
    expect(seatsSubtitle(usage(5, null))).toBeNull()
    expect(seatsSubtitle(undefined)).toBeNull()
  })

  it('com limite: Licenças usadas/limite', () => {
    expect(seatsSubtitle(usage(20, 22))).toBe('Licenças 20/22')
  })

  it('acima do limite: avisa', () => {
    expect(seatsSubtitle(usage(24, 22))).toBe('Licenças 24/22 · acima do limite')
  })
})

describe('seatMeterTone', () => {
  it.each<[number, number, string]>([
    [15, 22, 'brand'],
    [20, 22, 'warning'],
    [22, 22, 'danger'],
    [24, 22, 'danger'],
  ])('%i de %i → %s', (used, limit, tone) => {
    expect(seatMeterTone(usage(used, limit))).toBe(tone)
  })

  it('sem limite: cor da marca', () => {
    expect(seatMeterTone(usage(500, null))).toBe('brand')
  })
})

describe('seatPercent e seatsToFree', () => {
  it('91 % com 20 de 22; passa de 100 acima do limite', () => {
    expect(seatPercent(usage(20, 22))).toBe(91)
    expect(seatPercent(usage(24, 22))).toBe(109)
  })

  it('para voltar a criar é preciso ficar abaixo do limite', () => {
    expect(seatsToFree(usage(20, 22))).toBe(0)
    expect(seatsToFree(usage(22, 22))).toBe(1)
    expect(seatsToFree(usage(24, 22))).toBe(3)
    expect(seatsToFree(usage(24, null))).toBe(0)
  })

  it('a frase concorda com o número', () => {
    expect(overLimitMessage(usage(22, 22))).toBe(
      'Desative 1 vendedor ou gerente para voltar a criar ou ativar.'
    )
    expect(overLimitMessage(usage(24, 22))).toBe(
      'Desative 3 vendedores ou gerentes para voltar a criar ou ativar.'
    )
  })
})

describe('seatBlocksSave', () => {
  const full = usage(22, 22)

  it.each<[string, SeatSubject | null, SeatSubject, boolean]>([
    ['criar vendedor', null, seller(), true],
    ['criar gerente (SALESPERSON)', null, seller(), true],
    ['criar ADMIN', null, admin(), false],
    ['editar vendedor ativo', seller(), seller(), false],
    ['ADMIN ativo para vendedor', admin(), seller(), true],
    ['ADMIN inativo para vendedor', admin({ active: false }), seller({ active: false }), false],
    ['vincular órfão vendedor ativo', seller({ companyId: null }), seller(), true],
  ])('no limite, %s → %s', (_label, before, after, expected) => {
    expect(seatBlocksSave(full, before, after)).toBe(expected)
  })

  it('abaixo do limite não trava', () => {
    expect(seatBlocksSave(usage(21, 22), null, seller())).toBe(false)
  })

  it('sem limite não trava', () => {
    expect(seatBlocksSave(usage(500, null), null, seller())).toBe(false)
  })

  it('sem a leitura das licenças não trava (a API decide)', () => {
    expect(seatBlocksSave(undefined, null, seller())).toBe(false)
  })
})

describe('licenseRequestBlockedReason', () => {
  const ana = { id: 'ana', name: 'Ana Lima', valid: true }

  it('o indicado, sem pedido pendente, pode pedir', () => {
    expect(
      licenseRequestBlockedReason({ userId: 'ana', designatedAdmin: ana, hasPendingRequest: false })
    ).toBeNull()
  })

  it('o indicado com pedido pendente espera', () => {
    expect(
      licenseRequestBlockedReason({ userId: 'ana', designatedAdmin: ana, hasPendingRequest: true })
    ).toBe('Você já tem um pedido em análise.')
  })

  it('outro ADMIN vê o nome do indicado, mesmo com pedido pendente', () => {
    for (const hasPendingRequest of [false, true]) {
      expect(
        licenseRequestBlockedReason({ userId: 'joao', designatedAdmin: ana, hasPendingRequest })
      ).toBe('Só Ana Lima, o administrador indicado, pode pedir licenças.')
    }
  })

  it('indicado que deixou de ser ADMIN ativo: a mesma frase para qualquer um', () => {
    for (const userId of ['ana', 'joao']) {
      expect(
        licenseRequestBlockedReason({
          userId,
          designatedAdmin: { ...ana, valid: false },
          hasPendingRequest: false,
        })
      ).toBe(
        'O administrador indicado (Ana Lima) não está mais ativo. Fale com a Addere para indicar outro.'
      )
    }
  })

  it('sem indicado', () => {
    expect(
      licenseRequestBlockedReason({
        userId: 'ana',
        designatedAdmin: null,
        hasPendingRequest: false,
      })
    ).toBe('Sua empresa ainda não tem administrador indicado. Fale com a Addere.')
  })
})

describe('modal do pedido', () => {
  it('aumento mensal em centavos inteiros', () => {
    expect(monthlyIncrease(2, '99.00')).toBe('198.00')
    expect(monthlyIncrease(3, '120.50')).toBe('361.50')
    expect(monthlyIncrease(7, '0.10')).toBe('0.70')
  })

  it('quantidade de 1 a 100', () => {
    expect(parseLicenseQuantity('2')).toBe(2)
    expect(parseLicenseQuantity(' 100 ')).toBe(100)
    expect(parseLicenseQuantity('0')).toBeNull()
    expect(parseLicenseQuantity('101')).toBeNull()
    expect(parseLicenseQuantity('2.5')).toBeNull()
    expect(parseLicenseQuantity('')).toBeNull()
  })
})
