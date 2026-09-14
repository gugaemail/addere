// Helpers puros do mapa da equipe (E20) — testados em __tests__/team-map.test.ts.
// O componente Leaflet só desenha o que sai daqui; assim o filtro, o recorte
// dos limites e o HTML dos pinos são testáveis sem DOM.
import type { CustomerStatus, TeamMapSellerDto, TeamMapStopDto } from '@addere/types'
import { BRAND, STATUS } from './brand-tokens'

/** [[sul, oeste], [norte, leste]] — o que o Leaflet aceita em fitBounds. */
export type LatLngBoundsTuple = [[number, number], [number, number]]

export interface MapPin {
  seller: TeamMapSellerDto
  stop: TeamMapStopDto
}

/** Cor do pino pelo status — a mesma régua do app (tokens status.* do painel). */
export function pinColor(status: CustomerStatus): string {
  switch (status) {
    case 'ON_CYCLE':
      return STATUS.onCycle
    case 'LATE':
      return STATUS.late
    case 'AT_RISK':
      return STATUS.atRisk
    case 'BLOCKED':
      return STATUS.blocked
    case 'NEW':
      return STATUS.new
    default:
      return BRAND.muted // INACTIVE
  }
}

/** '' = todos os vendedores. */
export function filterMapSellers(
  sellers: TeamMapSellerDto[],
  vendorCode: string
): TeamMapSellerDto[] {
  if (!vendorCode) return sellers
  return sellers.filter((seller) => seller.vendorCode === vendorCode)
}

/** Paradas com coordenada, achatadas e ligadas ao vendedor (para o popup). */
export function mapPins(sellers: TeamMapSellerDto[]): MapPin[] {
  return sellers.flatMap((seller) =>
    seller.stops
      .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lng))
      .map((stop) => ({ seller, stop }))
  )
}

/** Limites que enquadram paradas e últimos check-ins; null sem nenhum ponto. */
export function mapBounds(sellers: TeamMapSellerDto[]): LatLngBoundsTuple | null {
  let minLat = Infinity
  let minLng = Infinity
  let maxLat = -Infinity
  let maxLng = -Infinity
  const extend = (lat: number, lng: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    minLat = Math.min(minLat, lat)
    minLng = Math.min(minLng, lng)
    maxLat = Math.max(maxLat, lat)
    maxLng = Math.max(maxLng, lng)
  }
  for (const seller of sellers) {
    for (const stop of seller.stops) extend(stop.lat, stop.lng)
    if (seller.lastCheckIn) extend(seller.lastCheckIn.lat, seller.lastCheckIn.lng)
  }
  if (!Number.isFinite(minLat)) return null
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}

export interface WithoutPinRow {
  userId: string
  name: string
  withoutPin: number
}

/** Só quem tem parada sem coordenada — o contador da tela. */
export function withoutPinRows(sellers: TeamMapSellerDto[]): WithoutPinRow[] {
  return sellers
    .filter((seller) => seller.withoutPin > 0)
    .map((seller) => ({ userId: seller.userId, name: seller.name, withoutPin: seller.withoutPin }))
}

export function withoutPinLabel(count: number): string {
  return `${count} parada${count === 1 ? '' : 's'} sem posição`
}

/** 'HH:MM' em São Paulo do ISO do check-in; '—' se inválido. */
export function checkInTimeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export const STOP_PIN_SIZE = 28
export const CHECKIN_PIN_SIZE = 22

/**
 * HTML do pino de parada para L.divIcon: círculo numerado com anel na cor do
 * status — vazio quando prevista, cheio (navy) quando já visitada, como o
 * PlanPin do app. Só números e tokens entram no HTML; nome de cliente vai
 * para o popup, renderizado pelo React.
 */
export function stopPinHtml(stop: Pick<TeamMapStopDto, 'position' | 'status' | 'visited'>): string {
  const ring = pinColor(stop.status)
  const fill = stop.visited ? BRAND.navy : 'white'
  const text = stop.visited ? 'white' : BRAND.navy
  const position = String(Math.trunc(Number(stop.position)) || 0)
  return (
    `<span style="display:flex;align-items:center;justify-content:center;` +
    `width:${STOP_PIN_SIZE}px;height:${STOP_PIN_SIZE}px;border-radius:999px;` +
    `border:3px solid ${ring};background:${fill};color:${text};` +
    `font:700 12px/1 var(--font-body),sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.35)">` +
    `${position}</span>`
  )
}

/** Marcador do último check-in: ponto azul da marca com o glifo Lucide `navigation`. */
export function checkInPinHtml(): string {
  return (
    `<span style="display:flex;align-items:center;justify-content:center;` +
    `width:${CHECKIN_PIN_SIZE}px;height:${CHECKIN_PIN_SIZE}px;border-radius:999px;` +
    `background:${BRAND.primary};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)">` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" ` +
    `stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<polygon points="3 11 22 2 13 21 11 13 3 11"/></svg></span>`
  )
}
