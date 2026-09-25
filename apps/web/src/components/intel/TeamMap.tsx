'use client'

// Mapa da equipe (E20): Leaflet com tiles do OpenStreetMap. Carregado só no
// cliente (a página usa next/dynamic com ssr:false) — o Leaflet toca em
// window ao ser importado. Um pino por parada na cor do status, cheio quando
// já visitada, e um marcador azul da marca no último check-in de cada vendedor.
import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo } from 'react'
import * as L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import type { TeamMapSellerDto } from '@addere/types'
import {
  CHECKIN_PIN_SIZE,
  STOP_PIN_SIZE,
  checkInPinHtml,
  checkInTimeLabel,
  mapBounds,
  mapPins,
  stopPinHtml,
  type LatLngBoundsTuple,
} from '@/lib/team-map'

// A atribuição é condição da licença do OpenStreetMap — não remover
const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const FIT_OPTIONS: L.FitBoundsOptions = { padding: [32, 32], maxZoom: 16 }

// O `bounds` do MapContainer só vale na criação; quando o filtro de vendedor
// muda os pontos, é este efeito que reenquadra.
function FitBounds({ bounds }: { bounds: LatLngBoundsTuple }) {
  const map = useMap()
  useEffect(() => {
    map.fitBounds(bounds, FIT_OPTIONS)
  }, [map, bounds])
  return null
}

function divIcon(html: string, size: number): L.DivIcon {
  return L.divIcon({
    html,
    // Classe própria: a padrão (leaflet-div-icon) traz fundo branco e borda
    className: 'team-map-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

interface TeamMapProps {
  sellers: TeamMapSellerDto[]
}

export default function TeamMap({ sellers }: TeamMapProps) {
  const pins = useMemo(() => mapPins(sellers), [sellers])
  const bounds = useMemo(() => mapBounds(sellers), [sellers])
  const checkIns = useMemo(
    () =>
      sellers.flatMap((seller) =>
        seller.lastCheckIn ? [{ seller, checkIn: seller.lastCheckIn }] : []
      ),
    [sellers]
  )
  // Ícones memoizados: recriar a cada render faria o Marker trocar o ícone em
  // todo re-render do pai
  const stopIcons = useMemo(
    () => new Map(pins.map(({ stop }) => [stop.itemId, divIcon(stopPinHtml(stop), STOP_PIN_SIZE)])),
    [pins]
  )
  const checkInIcon = useMemo(() => divIcon(checkInPinHtml(), CHECKIN_PIN_SIZE), [])

  if (!bounds) return null

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={FIT_OPTIONS}
      scrollWheelZoom={false}
      className="h-full w-full"
    >
      <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} />
      <FitBounds bounds={bounds} />

      {pins.map(({ seller, stop }) => (
        <Marker
          key={stop.itemId}
          position={[stop.lat, stop.lng]}
          icon={stopIcons.get(stop.itemId)}
          alt={`${stop.position}. ${stop.customerName}`}
        >
          {/* O popup do Leaflet é sempre claro: cores fixas, não as do tema */}
          <Popup>
            <p className="font-semibold text-navy">{stop.customerName}</p>
            <p className="text-muted">
              {stop.plannedTime ? `Prevista às ${stop.plannedTime}` : 'Sem hora prevista'}
              {stop.visited ? ' · visitada' : ''}
            </p>
            <p className="text-muted">{seller.name}</p>
          </Popup>
        </Marker>
      ))}

      {checkIns.map(({ seller, checkIn }) => (
        <Marker
          key={`checkin-${seller.userId}`}
          position={[checkIn.lat, checkIn.lng]}
          icon={checkInIcon}
          zIndexOffset={1000}
          alt={`Último check-in de ${seller.name}`}
        >
          <Popup>
            <p className="font-semibold text-navy">{seller.name}</p>
            <p className="text-muted">Último check-in às {checkInTimeLabel(checkIn.at)}</p>
            <p className="text-muted">{checkIn.customerName}</p>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
