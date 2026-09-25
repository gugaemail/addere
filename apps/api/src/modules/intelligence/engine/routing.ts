// Roteirização das paradas do dia (E16, doc §4.4) — puro e determinístico.
// Vizinho-mais-próximo com Haversine: 8 paradas não precisam de API de rotas.
// Janelas de atendimento entram como restrição suave: a parada cuja janela
// ainda não abriu na hora prevista cede a vez; se só restarem paradas fora da
// janela, o vendedor espera (a hora prevista respeita o início da janela).
// Paradas sem coordenada ficam ao final, na ordem do ranking, sem hora.
import type { Vehicle } from '@addere/types'

export interface RoutableStop<T = unknown> {
  key: string
  lat: number | null
  lng: number | null
  /** Janelas do dia da rota, em minutos desde a meia-noite (várias = qualquer uma) */
  windows: Array<{ startMin: number; endMin: number }>
  payload: T
}

export interface RoutingOptions {
  dayStartHour: number // 8 → primeira visita às 08:00
  visitMinutes: number // duração média da visita
  avgSpeedKmh: number // carro; moto e a pé derivam daqui
  vehicle: Vehicle | null
  /** Ponto de partida (casa/base do vendedor). Sem ele, a 1ª parada é a de maior score. */
  origin?: { lat: number; lng: number } | null
}

export interface RoutedStop<T = unknown> {
  key: string
  position: number // 1..n
  distFromPrevM: number | null
  etaMin: number | null // deslocamento desde a parada anterior (ou origem)
  plannedTime: string | null // "08:30"
  payload: T
}

const EARTH_RADIUS_M = 6_371_000
const FOOT_SPEED_KMH = 5
const MOTORCYCLE_FACTOR = 1.2
// Deslocamento "em linha reta" subestima a rua: fator de tortuosidade urbana
const DETOUR_FACTOR = 1.3

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)))
}

export function speedKmh(vehicle: Vehicle | null, avgSpeedKmh: number): number {
  if (vehicle === 'FOOT') return FOOT_SPEED_KMH
  if (vehicle === 'MOTORCYCLE') return avgSpeedKmh * MOTORCYCLE_FACTOR
  return avgSpeedKmh
}

export function travelMinutes(distanceM: number, vehicle: Vehicle | null, avgSpeedKmh: number): number {
  const kmh = Math.max(1, speedKmh(vehicle, avgSpeedKmh))
  return Math.max(1, Math.round(((distanceM * DETOUR_FACTOR) / 1000 / kmh) * 60))
}

export function minutesToClock(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMinutes)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function clockToMinutes(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

/** Se a parada tem janelas, devolve o menor "início" que a hora ainda alcança; null = fora de todas. */
function windowStartFor(stop: RoutableStop, arrivalMin: number): number | null {
  if (stop.windows.length === 0) return arrivalMin
  const usable = stop.windows
    .filter((w) => w.endMin > arrivalMin)
    .sort((a, b) => a.startMin - b.startMin)
  if (usable.length === 0) return null
  return Math.max(arrivalMin, usable[0].startMin)
}

/**
 * Sequencia as paradas com coordenada por vizinho-mais-próximo a partir da
 * origem (ou da primeira do ranking) e calcula distância, deslocamento e hora
 * prevista de cada uma. As sem coordenada vão ao final, na ordem recebida.
 */
export function routeStops<T>(stops: RoutableStop<T>[], opts: RoutingOptions): RoutedStop<T>[] {
  const mappable = stops.filter((s) => s.lat !== null && s.lng !== null)
  const unmapped = stops.filter((s) => s.lat === null || s.lng === null)

  const result: RoutedStop<T>[] = []
  let clock = opts.dayStartHour * 60
  let current: { lat: number; lng: number } | null = opts.origin ?? null
  const remaining = [...mappable]

  while (remaining.length > 0) {
    let pick: RoutableStop<T> | null = null
    let pickDist = 0
    let pickArrival = 0
    let pickWait = Number.POSITIVE_INFINITY

    if (current === null) {
      // Sem origem: começa pela primeira do ranking (a de maior score)
      pick = remaining[0]
      pickDist = 0
      pickArrival = windowStartFor(pick, clock) ?? clock
    } else {
      for (const candidate of remaining) {
        const dist = haversineMeters(current, {
          lat: candidate.lat as number,
          lng: candidate.lng as number,
        })
        const arrival = clock + travelMinutes(dist, opts.vehicle, opts.avgSpeedKmh)
        const start = windowStartFor(candidate, arrival)
        // Fora de todas as janelas: só se não houver alternativa (penalidade máxima)
        const wait = start === null ? Number.POSITIVE_INFINITY : start - arrival
        // Critério: menor espera primeiro (respeita janela), depois menor distância
        const better =
          pick === null ||
          wait < pickWait ||
          (wait === pickWait && dist < pickDist) ||
          (wait === pickWait && dist === pickDist && candidate.key.localeCompare(pick.key) < 0)
        if (better) {
          pick = candidate
          pickDist = dist
          pickArrival = start ?? arrival
          pickWait = wait
        }
      }
    }

    const chosen = pick as RoutableStop<T>
    remaining.splice(remaining.indexOf(chosen), 1)
    const eta =
      current === null ? null : travelMinutes(pickDist, opts.vehicle, opts.avgSpeedKmh)
    result.push({
      key: chosen.key,
      position: result.length + 1,
      distFromPrevM: current === null ? null : pickDist,
      etaMin: eta,
      plannedTime: minutesToClock(pickArrival),
      payload: chosen.payload,
    })
    clock = pickArrival + opts.visitMinutes
    current = { lat: chosen.lat as number, lng: chosen.lng as number }
  }

  for (const stop of unmapped) {
    result.push({
      key: stop.key,
      position: result.length + 1,
      distFromPrevM: null,
      etaMin: null,
      plannedTime: null,
      payload: stop.payload,
    })
  }
  return result
}

/**
 * Recalcula distância/deslocamento/hora prevista de uma ordem JÁ decidida
 * (o vendedor reordenou): não muda a sequência, só os números.
 */
export function annotateSequence<T>(
  ordered: RoutableStop<T>[],
  opts: RoutingOptions
): RoutedStop<T>[] {
  const result: RoutedStop<T>[] = []
  let clock = opts.dayStartHour * 60
  let current: { lat: number; lng: number } | null = opts.origin ?? null

  ordered.forEach((stop, index) => {
    if (stop.lat === null || stop.lng === null) {
      result.push({
        key: stop.key,
        position: index + 1,
        distFromPrevM: null,
        etaMin: null,
        plannedTime: null,
        payload: stop.payload,
      })
      return
    }
    const here = { lat: stop.lat, lng: stop.lng }
    const dist = current === null ? null : haversineMeters(current, here)
    const eta = dist === null ? null : travelMinutes(dist, opts.vehicle, opts.avgSpeedKmh)
    const arrival = clock + (eta ?? 0)
    const start = windowStartFor(stop, arrival) ?? arrival
    result.push({
      key: stop.key,
      position: index + 1,
      distFromPrevM: dist,
      etaMin: eta,
      plannedTime: minutesToClock(start),
      payload: stop.payload,
    })
    clock = start + opts.visitMinutes
    current = here
  })
  return result
}
