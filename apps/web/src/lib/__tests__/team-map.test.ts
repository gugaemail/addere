import { describe, expect, it } from 'vitest'
import type { TeamMapSellerDto, TeamMapStopDto } from '@addere/types'
import { BRAND, STATUS } from '../brand-tokens'
import {
  checkInPinHtml,
  checkInTimeLabel,
  filterMapSellers,
  mapBounds,
  mapPins,
  pinColor,
  stopPinHtml,
  withoutPinLabel,
  withoutPinRows,
} from '../team-map'

const stop = (over: Partial<TeamMapStopDto>): TeamMapStopDto => ({
  itemId: 'i1',
  position: 1,
  customerCode: '000001',
  loja: '01',
  customerName: 'Cliente',
  status: 'ON_CYCLE',
  lat: -7.12,
  lng: -34.86,
  plannedTime: '08:30',
  visited: false,
  ...over,
})

const seller = (over: Partial<TeamMapSellerDto>): TeamMapSellerDto => ({
  userId: 'u1',
  name: 'Ana',
  vendorCode: 'V1',
  grouping: null,
  stops: [],
  withoutPin: 0,
  lastCheckIn: null,
  ...over,
})

describe('pinColor', () => {
  it('segue os tokens de status do painel; inativo cai no muted', () => {
    expect(pinColor('ON_CYCLE')).toBe(STATUS.onCycle)
    expect(pinColor('LATE')).toBe(STATUS.late)
    expect(pinColor('AT_RISK')).toBe(STATUS.atRisk)
    expect(pinColor('BLOCKED')).toBe(STATUS.blocked)
    expect(pinColor('NEW')).toBe(STATUS.new)
    expect(pinColor('INACTIVE')).toBe(BRAND.muted)
  })
})

describe('filterMapSellers/mapPins', () => {
  const sellers = [
    seller({ userId: 'u1', vendorCode: 'V1', stops: [stop({ itemId: 'a' }), stop({ itemId: 'b' })] }),
    seller({ userId: 'u2', vendorCode: 'V2', name: 'Bia', stops: [stop({ itemId: 'c' })] }),
  ]

  it("'' devolve todos; código recorta um vendedor", () => {
    expect(filterMapSellers(sellers, '')).toHaveLength(2)
    expect(filterMapSellers(sellers, 'V2').map((s) => s.name)).toEqual(['Bia'])
    expect(filterMapSellers(sellers, 'V9')).toEqual([])
  })

  it('achata as paradas ligando cada uma ao vendedor', () => {
    const pins = mapPins(sellers)
    expect(pins.map((p) => p.stop.itemId)).toEqual(['a', 'b', 'c'])
    expect(pins[2].seller.name).toBe('Bia')
  })

  it('ignora parada com coordenada inválida', () => {
    const broken = [seller({ stops: [stop({ lat: Number.NaN })] })]
    expect(mapPins(broken)).toEqual([])
  })
})

describe('mapBounds', () => {
  it('enquadra paradas e o último check-in', () => {
    const sellers = [
      seller({
        stops: [stop({ lat: -7.1, lng: -34.9 }), stop({ lat: -7.3, lng: -34.8 })],
        lastCheckIn: { lat: -7.0, lng: -35.0, at: '2026-09-13T13:00:00Z', customerName: 'X' },
      }),
    ]
    expect(mapBounds(sellers)).toEqual([
      [-7.3, -35.0],
      [-7.0, -34.8],
    ])
  })

  it('um ponto só vira limite degenerado (o mapa aplica o maxZoom)', () => {
    expect(mapBounds([seller({ stops: [stop({})] })])).toEqual([
      [-7.12, -34.86],
      [-7.12, -34.86],
    ])
  })

  it('sem ponto nenhum devolve null', () => {
    expect(mapBounds([])).toBeNull()
    expect(mapBounds([seller({ withoutPin: 3 })])).toBeNull()
  })
})

describe('withoutPinRows/withoutPinLabel', () => {
  it('lista só quem tem parada sem posição', () => {
    const rows = withoutPinRows([
      seller({ userId: 'u1', name: 'Ana', withoutPin: 0 }),
      seller({ userId: 'u2', name: 'Bia', withoutPin: 2 }),
    ])
    expect(rows).toEqual([{ userId: 'u2', name: 'Bia', withoutPin: 2 }])
  })

  it('singular e plural', () => {
    expect(withoutPinLabel(1)).toBe('1 parada sem posição')
    expect(withoutPinLabel(3)).toBe('3 paradas sem posição')
  })
})

describe('checkInTimeLabel', () => {
  it('hora de São Paulo', () => {
    expect(checkInTimeLabel('2026-09-13T13:42:00Z')).toBe('10:42')
    expect(checkInTimeLabel('nada')).toBe('—')
  })
})

describe('stopPinHtml/checkInPinHtml', () => {
  it('pino previsto: fundo branco, número navy, anel na cor do status', () => {
    const html = stopPinHtml({ position: 3, status: 'LATE', visited: false })
    expect(html).toContain('>3</span>')
    expect(html).toContain(`border:3px solid ${STATUS.late}`)
    expect(html).toContain('background:white')
    expect(html).toContain(`color:${BRAND.navy}`)
  })

  it('pino visitado: cheio em navy com número branco', () => {
    const html = stopPinHtml({ position: 7, status: 'AT_RISK', visited: true })
    expect(html).toContain(`background:${BRAND.navy}`)
    expect(html).toContain('color:white')
    expect(html).toContain(`border:3px solid ${STATUS.atRisk}`)
  })

  it('posição não numérica não vira HTML arbitrário', () => {
    const html = stopPinHtml({
      position: '<img onerror=1>' as unknown as number,
      status: 'NEW',
      visited: false,
    })
    expect(html).not.toContain('<img')
    expect(html).toContain('>0</span>')
  })

  it('check-in usa o azul da marca e o glifo navigation', () => {
    const html = checkInPinHtml()
    expect(html).toContain(`background:${BRAND.primary}`)
    expect(html).toContain('<polygon points="3 11 22 2 13 21 11 13 3 11"/>')
  })
})
