// Matemática pura do mapa do plano (E13b) — testada em __tests__.
import type { VisitPlanItemDto } from '@addere/types'

export interface LatLng {
  latitude: number
  longitude: number
}

export interface MapRegion extends LatLng {
  latitudeDelta: number
  longitudeDelta: number
}

/** Paradas ativas com coordenada (CITY/sem geo ficam de fora do mapa) */
export function mappableItems(items: VisitPlanItemDto[]): VisitPlanItemDto[] {
  return items.filter((i) => !i.removedAt && i.lat !== null && i.lng !== null)
}

/** Paradas ativas SEM coordenada — viram o contador "N sem posição" */
export function unmappedCount(items: VisitPlanItemDto[]): number {
  return items.filter((i) => !i.removedAt && (i.lat === null || i.lng === null)).length
}

const MIN_DELTA = 0.01 // ~1 km — zoom máximo quando há 1 pino só
const PADDING = 1.4 // 40% de folga nas bordas

/** Região que enquadra todos os pinos (null sem coordenadas) */
export function regionForItems(items: VisitPlanItemDto[]): MapRegion | null {
  const coords = mappableItems(items)
  if (coords.length === 0) return null
  const lats = coords.map((i) => i.lat as number)
  const lngs = coords.map((i) => i.lng as number)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * PADDING, MIN_DELTA),
    longitudeDelta: Math.max((maxLng - minLng) * PADDING, MIN_DELTA),
  }
}
