import { describe, expect, it } from 'vitest'
import { BILLING_EVENT_TYPES, CLIENT_STATUS_LABELS } from '@addere/types'
import {
  BILLING_EVENT_LABELS,
  CLIENT_STATUS_BADGE,
  billingFieldLabel,
  moneyApiToInput,
  moneyInputToApi,
} from '../billing-ui'

describe('moneyInputToApi', () => {
  it('converte o que se digita no Brasil para o formato da API', () => {
    expect(moneyInputToApi('1.800,00')).toBe('1800.00')
    expect(moneyInputToApi('95,5')).toBe('95.50')
    expect(moneyInputToApi('1800.00')).toBe('1800.00')
    expect(moneyInputToApi('R$ 2.086,50')).toBe('2086.50')
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
