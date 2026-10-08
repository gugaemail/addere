// Links de navegação/mensagem (E12): Waze, Google/Apple Maps e WhatsApp.
// Builders puros exportados para teste; o menu "abrir em…" vive em mapChooser.ts.
import { Linking, Platform } from 'react-native'

export interface GeoTarget {
  lat?: number | null
  lng?: number | null
  address?: string | null
}

const hasCoords = (t: GeoTarget): t is { lat: number; lng: number } =>
  typeof t.lat === 'number' && typeof t.lng === 'number'

export function wazeUrl(target: GeoTarget): string | null {
  if (hasCoords(target)) return `https://waze.com/ul?ll=${target.lat},${target.lng}&navigate=yes`
  if (target.address) return `https://waze.com/ul?q=${encodeURIComponent(target.address)}&navigate=yes`
  return null
}

function destinationQuery(target: GeoTarget): string | null {
  if (hasCoords(target)) return `${target.lat},${target.lng}`
  return target.address ? encodeURIComponent(target.address) : null
}

export function appleMapsUrl(target: GeoTarget): string | null {
  const query = destinationQuery(target)
  return query ? `https://maps.apple.com/?daddr=${query}` : null
}

export function googleMapsUrl(target: GeoTarget): string | null {
  const query = destinationQuery(target)
  return query ? `https://www.google.com/maps/dir/?api=1&destination=${query}` : null
}

/**
 * Até onde o Google Maps aceita: destino + 9 waypoints. Acima disso ele corta
 * paradas por conta própria — melhor levar as 10 primeiras, na ordem.
 */
export const ROUTE_MAX_STOPS = 10

/** Rota completa no Google Maps: paradas na ordem do ranking (waypoints) */
export function routeUrl(targets: GeoTarget[]): string | null {
  const stops = targets
    .map((t) => (hasCoords(t) ? `${t.lat},${t.lng}` : (t.address ?? '').trim()))
    .filter(Boolean)
    .slice(0, ROUTE_MAX_STOPS)
  if (stops.length === 0) return null
  const destination = encodeURIComponent(stops[stops.length - 1])
  // Separador %7C (pipe escapado) — pipe cru é inválido em query string
  const waypoints = stops.slice(0, -1).map(encodeURIComponent).join('%7C')
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}${
    waypoints ? `&waypoints=${waypoints}` : ''
  }`
}

/**
 * Opção do menu "abrir em…". Links https: abrem o app quando instalado e o
 * navegador quando não — saber o que está instalado exige declarar os esquemas
 * no build nativo (etapa 2), por isso as opções aparecem sempre.
 */
export type MapChoice = { label: string; url: string } | { label: string; copy: string }

/** Uma parada: Apple Maps (só iOS), Google Maps, Waze e copiar o endereço */
export function stopChoices(target: GeoTarget, platform: string = Platform.OS): MapChoice[] {
  const choices: MapChoice[] = []
  const apple = appleMapsUrl(target)
  const google = googleMapsUrl(target)
  const waze = wazeUrl(target)
  if (platform === 'ios' && apple) choices.push({ label: 'Abrir no Apple Maps', url: apple })
  if (google) choices.push({ label: 'Abrir no Google Maps', url: google })
  if (waze) choices.push({ label: 'Abrir no Waze', url: waze })
  const address = target.address?.trim()
  if (address) choices.push({ label: 'Copiar endereço', copy: address })
  return choices
}

/**
 * Rota completa: só o Google Maps aceita várias paradas por link; Waze e Apple
 * Maps recebem um destino, então levam a 1ª parada.
 */
export function routeChoices(targets: GeoTarget[], platform: string = Platform.OS): MapChoice[] {
  const choices: MapChoice[] = []
  const route = routeUrl(targets)
  const first = targets.find((t) => destinationQuery(t) !== null)
  if (route) {
    choices.push({
      label: targets.length > 1 ? 'Google Maps (todas as paradas)' : 'Abrir no Google Maps',
      url: route,
    })
  }
  if (first && targets.length > 1) {
    const apple = appleMapsUrl(first)
    const waze = wazeUrl(first)
    if (platform === 'ios' && apple) choices.push({ label: 'Apple Maps (1ª parada)', url: apple })
    if (waze) choices.push({ label: 'Waze (1ª parada)', url: waze })
  } else if (first) {
    const apple = appleMapsUrl(first)
    const waze = wazeUrl(first)
    if (platform === 'ios' && apple) choices.push({ label: 'Abrir no Apple Maps', url: apple })
    if (waze) choices.push({ label: 'Abrir no Waze', url: waze })
  }
  return choices
}

export function whatsappUrl(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  // Sem DDI assume Brasil (55)
  const full = digits.length <= 11 ? `55${digits}` : digits
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`
}

export async function openUrl(url: string | null): Promise<boolean> {
  if (!url) return false
  try {
    await Linking.openURL(url)
    return true
  } catch {
    return false
  }
}

export const openWhatsApp = (phone: string, text: string) => openUrl(whatsappUrl(phone, text))
