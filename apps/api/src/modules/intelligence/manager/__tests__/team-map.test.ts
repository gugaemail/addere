import { describe, it, expect } from 'vitest'
import { buildTeamMap, type TeamMapInput } from '../team-map'

const base = (): TeamMapInput => ({
  date: '2026-09-14',
  sellers: [
    { userId: 'u1', name: 'Ana', vendorCode: 'V1' },
    { userId: 'u2', name: 'Bruno', vendorCode: 'V2' },
  ],
  plans: [
    {
      vendorCode: 'V1',
      grouping: 'Campinas',
      items: [
        { id: 'i1', position: 1, customerCode: 'A', loja: '01', statusAtTime: 'LATE', lat: -22.9, lng: -47.06, plannedTime: '08:00', removed: false },
        { id: 'i2', position: 2, customerCode: 'B', loja: '01', statusAtTime: 'ON_CYCLE', lat: null, lng: null, plannedTime: null, removed: false },
        { id: 'i3', position: 3, customerCode: 'C', loja: '01', statusAtTime: 'AT_RISK', lat: -22.8, lng: -47.07, plannedTime: '09:10', removed: true },
      ],
    },
  ],
  visits: [
    { vendorCode: 'V1', planItemId: 'i1', customerCode: 'A', loja: '01', arrivedAt: '2026-09-14T11:00:00Z', lat: -22.9, lng: -47.06 },
    { vendorCode: 'V1', planItemId: null, customerCode: 'Z', loja: '01', arrivedAt: '2026-09-14T13:00:00Z', lat: -22.95, lng: -47.1 },
  ],
  nameByKey: new Map([
    ['A|01', 'Cliente A'],
    ['B|01', 'Cliente B'],
    ['Z|01', 'Fora do plano'],
  ]),
  lastSyncAt: '2026-09-14T06:00:00Z',
})

describe('buildTeamMap', () => {
  it('só paradas ativas com coordenada viram pino; removidas e sem posição ficam de fora', () => {
    const map = buildTeamMap(base())
    const ana = map.sellers[0]
    expect(ana.stops.map((s) => s.itemId)).toEqual(['i1'])
    expect(ana.withoutPin).toBe(1) // B ativo sem coordenada; C removido não conta
    expect(ana.stops[0]).toMatchObject({ customerName: 'Cliente A', visited: true, plannedTime: '08:00' })
    expect(ana.grouping).toBe('Campinas')
  })

  it('último check-in é a visita mais recente com GPS, mesmo fora do plano', () => {
    const map = buildTeamMap(base())
    expect(map.sellers[0].lastCheckIn).toMatchObject({ customerName: 'Fora do plano', lat: -22.95 })
  })

  it('vendedor sem plano aparece vazio, sem quebrar', () => {
    const map = buildTeamMap(base())
    expect(map.sellers[1]).toMatchObject({ name: 'Bruno', stops: [], withoutPin: 0, lastCheckIn: null, grouping: null })
    expect(map.date).toBe('2026-09-14')
    expect(map.lastSyncAt).toBe('2026-09-14T06:00:00Z')
  })
})
