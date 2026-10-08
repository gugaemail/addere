import { describe, it, expect } from 'vitest'
import { visitMetaLine } from '../visit-history'

const ARRIVED = '2026-09-14T11:12:00.000Z' // 08:12 em São Paulo (UTC-3)
const line = (over: Partial<Parameters<typeof visitMetaLine>[0]> = {}) =>
  visitMetaLine({ arrivedAt: ARRIVED, durationMin: 24, source: 'CHECKIN', channel: null, ...over })

describe('visitMetaLine (painel)', () => {
  it('presencial: hora e duração; sem saída, só a hora', () => {
    expect(line()).toBe('08:12 · 24 min')
    expect(line({ durationMin: null })).toBe('08:12')
  })

  it('nascida do pedido: "registrada pelo pedido"', () => {
    expect(line({ source: 'ORDER', durationMin: null })).toBe('08:12 · registrada pelo pedido')
  })

  it('à distância: o canal no lugar da duração, nunca o tempo', () => {
    expect(line({ source: 'REMOTE', channel: 'PHONE', durationMin: 7 })).toBe('08:12 · por telefone')
    expect(line({ source: 'REMOTE', channel: 'WHATSAPP' })).toBe('08:12 · por WhatsApp')
    expect(line({ source: 'REMOTE', channel: null })).toBe('08:12 · à distância')
  })
})
