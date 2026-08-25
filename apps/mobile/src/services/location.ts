// Leitura única de GPS no "Cheguei" (E12, decisão D10): when-in-use,
// timeout de 5 s e NUNCA bloqueia o check-in — sem posição retorna null.
import * as Location from 'expo-location'

export interface VisitPosition {
  lat: number
  lng: number
  accuracyM: number | null
}

export const LOCATION_TIMEOUT_MS = 5_000

export async function getVisitPosition(): Promise<VisitPosition | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync()
    if (status !== 'granted') return null

    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), LOCATION_TIMEOUT_MS)),
    ])
    if (!position) return null

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracyM: position.coords.accuracy === null ? null : Math.round(position.coords.accuracy),
    }
  } catch {
    return null
  }
}
