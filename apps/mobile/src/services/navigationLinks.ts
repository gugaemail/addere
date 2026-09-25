// Links de navegação/mensagem (E12): Waze, Google/Apple Maps e WhatsApp.
// Builders puros exportados para teste; open* usa Linking com fallback web.
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

export function mapsUrl(target: GeoTarget, platform: string = Platform.OS): string | null {
  const query = hasCoords(target)
    ? `${target.lat},${target.lng}`
    : target.address
      ? encodeURIComponent(target.address)
      : null
  if (!query) return null
  // Apple Maps no iOS; Google Maps nos demais
  return platform === 'ios'
    ? `https://maps.apple.com/?daddr=${query}`
    : `https://www.google.com/maps/dir/?api=1&destination=${query}`
}

/** Rota completa no Google Maps: paradas na ordem do ranking (waypoints) */
export function routeUrl(addresses: string[]): string | null {
  const stops = addresses.map((a) => a.trim()).filter(Boolean)
  if (stops.length === 0) return null
  const destination = encodeURIComponent(stops[stops.length - 1])
  // Separador %7C (pipe escapado) — pipe cru é inválido em query string
  const waypoints = stops.slice(0, -1).map(encodeURIComponent).join('%7C')
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}${
    waypoints ? `&waypoints=${waypoints}` : ''
  }`
}

export function whatsappUrl(phone: string, text: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  // Sem DDI assume Brasil (55)
  const full = digits.length <= 11 ? `55${digits}` : digits
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`
}

async function open(url: string | null): Promise<boolean> {
  if (!url) return false
  try {
    await Linking.openURL(url)
    return true
  } catch {
    return false
  }
}

export const openWaze = (target: GeoTarget) => open(wazeUrl(target))
export const openMaps = (target: GeoTarget) => open(mapsUrl(target))
export const openRouteInMaps = (addresses: string[]) => open(routeUrl(addresses))
export const openWhatsApp = (phone: string, text: string) => open(whatsappUrl(phone, text))
