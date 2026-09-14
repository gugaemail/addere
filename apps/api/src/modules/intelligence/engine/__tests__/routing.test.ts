import { describe, it, expect } from 'vitest'
import {
  annotateSequence,
  clockToMinutes,
  haversineMeters,
  minutesToClock,
  routeStops,
  travelMinutes,
  type RoutableStop,
} from '../routing'

// Campinas (centro) e vizinhança — distâncias reais na casa dos km
const CENTRO = { lat: -22.9056, lng: -47.0608 }
const BARAO = { lat: -22.8228, lng: -47.0698 } // ~9 km ao norte
const CAMBUI = { lat: -22.8934, lng: -47.0517 } // ~1,6 km
const TAQUARAL = { lat: -22.8746, lng: -47.0524 } // ~3,5 km

const stop = (key: string, pos: { lat: number; lng: number } | null, windows: RoutableStop['windows'] = []): RoutableStop<string> => ({
  key,
  lat: pos?.lat ?? null,
  lng: pos?.lng ?? null,
  windows,
  payload: key,
})

const opts = { dayStartHour: 8, visitMinutes: 30, avgSpeedKmh: 30, vehicle: null }

describe('haversineMeters', () => {
  it('mede ~9 km entre o centro e Barão Geraldo', () => {
    const d = haversineMeters(CENTRO, BARAO)
    expect(d).toBeGreaterThan(8_500)
    expect(d).toBeLessThan(9_800)
  })
  it('zero para o mesmo ponto', () => {
    expect(haversineMeters(CENTRO, CENTRO)).toBe(0)
  })
})

describe('travelMinutes', () => {
  it('a pé é mais lento que de carro; moto mais rápida', () => {
    const car = travelMinutes(5_000, 'CAR', 30)
    expect(travelMinutes(5_000, 'FOOT', 30)).toBeGreaterThan(car)
    expect(travelMinutes(5_000, 'MOTORCYCLE', 30)).toBeLessThan(car)
  })
  it('nunca é zero', () => {
    expect(travelMinutes(0, null, 30)).toBe(1)
  })
})

describe('relógio', () => {
  it('converte minutos ↔ HH:MM', () => {
    expect(minutesToClock(8 * 60 + 5)).toBe('08:05')
    expect(clockToMinutes('13:45')).toBe(13 * 60 + 45)
    expect(clockToMinutes('25:00')).toBeNull()
    expect(clockToMinutes('abc')).toBeNull()
  })
})

describe('routeStops — vizinho-mais-próximo', () => {
  it('sem origem começa pela 1ª do ranking e segue pelo mais perto', () => {
    // Ranking: A (centro), B (Barão, longe), C (Cambuí, perto), D (Taquaral)
    const routed = routeStops(
      [stop('A', CENTRO), stop('B', BARAO), stop('C', CAMBUI), stop('D', TAQUARAL)],
      opts
    )
    expect(routed.map((r) => r.key)).toEqual(['A', 'C', 'D', 'B'])
    expect(routed[0].distFromPrevM).toBeNull()
    expect(routed[0].plannedTime).toBe('08:00')
    expect(routed[1].distFromPrevM).toBeGreaterThan(1_000)
    expect(routed[1].etaMin).toBeGreaterThan(0)
    // 08:00 + 30 min de visita + deslocamento
    expect(clockToMinutes(routed[1].plannedTime as string)).toBe(8 * 60 + 30 + (routed[1].etaMin as number))
  })

  it('com origem, a primeira parada é a mais perto da origem', () => {
    const routed = routeStops([stop('A', BARAO), stop('B', CAMBUI)], { ...opts, origin: CENTRO })
    expect(routed[0].key).toBe('B')
    expect(routed[0].distFromPrevM).toBeGreaterThan(0)
  })

  it('paradas sem coordenada vão ao final, sem hora, na ordem recebida', () => {
    const routed = routeStops([stop('X', null), stop('A', CENTRO), stop('Y', null)], opts)
    expect(routed.map((r) => r.key)).toEqual(['A', 'X', 'Y'])
    expect(routed[1].plannedTime).toBeNull()
    expect(routed[2].position).toBe(3)
  })

  it('janela ainda fechada cede a vez; se só restar ela, espera o início', () => {
    // C abre só às 14:00; D abre já — D vai antes de C mesmo sendo mais longe
    const routed = routeStops(
      [
        stop('A', CENTRO),
        stop('C', CAMBUI, [{ startMin: 14 * 60, endMin: 18 * 60 }]),
        stop('D', TAQUARAL),
      ],
      opts
    )
    expect(routed.map((r) => r.key)).toEqual(['A', 'D', 'C'])
    expect(routed[2].plannedTime).toBe('14:00')
  })

  it('é determinístico: mesmo input, mesma saída', () => {
    const input = [stop('A', CENTRO), stop('B', BARAO), stop('C', CAMBUI)]
    expect(routeStops(input, opts)).toEqual(routeStops(input, opts))
  })
})

describe('annotateSequence — ordem do vendedor', () => {
  it('mantém a ordem e recalcula números', () => {
    const annotated = annotateSequence([stop('B', BARAO), stop('A', CENTRO), stop('X', null)], opts)
    expect(annotated.map((a) => a.key)).toEqual(['B', 'A', 'X'])
    expect(annotated[0].plannedTime).toBe('08:00')
    expect(annotated[1].distFromPrevM).toBeGreaterThan(8_000)
    expect(annotated[2].plannedTime).toBeNull()
  })
})
