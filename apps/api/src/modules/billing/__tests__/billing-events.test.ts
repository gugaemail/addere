import { describe, it, expect } from 'vitest'
import { Prisma } from '@prisma/client'
import { changedFields } from '../billing-events'

describe('changedFields', () => {
  it('CPF trocado aparece pelo nome do campo', () => {
    const before = { legalName: 'Vale Verde', legalRepCpf: '11144477735' }
    const after = { legalName: 'Vale Verde', legalRepCpf: '52998224725' }
    expect(changedFields(before, after, ['legalName', 'legalRepCpf'])).toEqual(['legalRepCpf'])
  })

  it("dinheiro com formatação diferente não conta ('1800' contra Decimal 1800.00)", () => {
    const before = { packagePrice: new Prisma.Decimal('1800.00') }
    const after = { packagePrice: '1800' }
    expect(changedFields(before, after, ['packagePrice'], ['packagePrice'])).toEqual([])
    expect(
      changedFields(before, { packagePrice: '1800.01' }, ['packagePrice'], ['packagePrice'])
    ).toEqual(['packagePrice'])
  })

  it("null, undefined e '' são iguais", () => {
    expect(changedFields({ tradeName: null }, { tradeName: '' }, ['tradeName'])).toEqual([])
    expect(changedFields({}, { tradeName: null }, ['tradeName'])).toEqual([])
  })

  it('texto que parece número não é tratado como dinheiro', () => {
    // '10' e '10.0' são números de endereço diferentes
    expect(
      changedFields({ addressNumber: '10' }, { addressNumber: '10.0' }, ['addressNumber'])
    ).toEqual(['addressNumber'])
  })

  it('Date vira ISO; número e string iguais não contam', () => {
    const d = new Date('2026-10-15T12:00:00Z')
    expect(changedFields({ at: d }, { at: new Date(d.getTime()) }, ['at'])).toEqual([])
    expect(changedFields({ dueDay: 10 }, { dueDay: 10 }, ['dueDay'])).toEqual([])
    expect(changedFields({ dueDay: 10 }, { dueDay: 5 }, ['dueDay'])).toEqual(['dueDay'])
  })

  it('sem before (criação), devolve os campos preenchidos', () => {
    expect(
      changedFields(null, { legalName: 'X', tradeName: null, notes: '' }, [
        'legalName',
        'tradeName',
        'notes',
      ])
    ).toEqual(['legalName'])
  })
})
