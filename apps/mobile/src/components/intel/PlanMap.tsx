// Mapa do plano do dia (E13b): Apple Maps no iOS, Google no Android (D14b).
// Só paradas com coordenada viram pino — as demais ficam no contador da tela.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, StyleSheet } from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import type { VisitPlanItemDto } from '@addere/types'
import { mappableItems, regionForItems } from '../../utils/mapRegion'
import { PlanPin } from './PlanPin'

/**
 * No Android o Marker mostra um bitmap tirado do filho React, e só tira um novo
 * enquanto `tracksViewChanges` for true. Com ele já false na primeira
 * renderização o retrato sai antes de o react-native-svg pintar o pino — o mapa
 * aparece enquadrado e sem pino nenhum. Rastrear por um instante a cada mudança
 * visual resolve; desligar em seguida é o que mantém o mapa fluido ao arrastar.
 */
const PIN_SETTLE_MS = 800

interface PlanMarkerProps {
  item: VisitPlanItemDto
  /** true = visita já registrada neste aparelho (pino cheio) */
  visited: boolean
  onSelect: (item: VisitPlanItemDto) => void
}

function PlanMarker({ item, visited, onSelect }: PlanMarkerProps) {
  const [tracking, setTracking] = useState(true)

  // Número, status e "visitado" são tudo o que o pino desenha: cada mudança
  // desses precisa de um retrato novo, senão o pino fica com a aparência velha.
  useEffect(() => {
    setTracking(true)
    const timer = setTimeout(() => setTracking(false), PIN_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [item.position, item.statusAtTime, visited])

  return (
    <Marker
      identifier={item.id}
      coordinate={{ latitude: item.lat as number, longitude: item.lng as number }}
      onPress={() => onSelect(item)}
      // Ponta do pino no ponto (o SVG tem rabinho na base)
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={tracking}
    >
      <PlanPin position={item.position} status={item.statusAtTime} visited={visited} />
    </Marker>
  )
}

interface PlanMapProps {
  items: VisitPlanItemDto[]
  /** ids dos itens com check-in registrado neste aparelho (pino cheio) */
  visitedItemIds: Set<string>
  onSelect: (item: VisitPlanItemDto) => void
}

export function PlanMap({ items, visitedItemIds, onSelect }: PlanMapProps) {
  const mapRef = useRef<MapView>(null)
  const pins = useMemo(() => mappableItems(items), [items])
  const region = useMemo(() => regionForItems(items), [items])

  if (!region) return null

  return (
    <MapView
      ref={mapRef}
      testID="plan-map"
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
      initialRegion={region}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
    >
      {pins.map((item) => (
        <PlanMarker
          key={item.id}
          item={item}
          visited={visitedItemIds.has(item.id)}
          onSelect={onSelect}
        />
      ))}
    </MapView>
  )
}
