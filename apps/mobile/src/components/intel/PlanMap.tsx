// Mapa do plano do dia (E13b): Apple Maps no iOS, Google no Android (D14b).
// Só paradas com coordenada viram pino — as demais ficam no contador da tela.
import { useMemo, useRef } from 'react'
import { Platform, StyleSheet } from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import type { VisitPlanItemDto } from '@addere/types'
import { mappableItems, regionForItems } from '../../utils/mapRegion'
import { PlanPin } from './PlanPin'

interface PlanMapProps {
  items: VisitPlanItemDto[]
  /** ids dos itens com check-in registrado neste aparelho (pino cheio) */
  visitedItemIds: Set<string>
  selectedId: string | null
  onSelect: (item: VisitPlanItemDto) => void
}

export function PlanMap({ items, visitedItemIds, selectedId, onSelect }: PlanMapProps) {
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
        <Marker
          key={item.id}
          identifier={item.id}
          coordinate={{ latitude: item.lat as number, longitude: item.lng as number }}
          onPress={() => onSelect(item)}
          // Ponta do pino no ponto (o SVG tem rabinho na base)
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={item.id === selectedId}
        >
          <PlanPin
            position={item.position}
            status={item.statusAtTime}
            visited={visitedItemIds.has(item.id)}
          />
        </Marker>
      ))}
    </MapView>
  )
}
