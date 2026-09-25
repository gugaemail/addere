// Geocodificação (E15-F1, decisão D14a): Nominatim agora, Google previsto.
// A interface GeocodingProvider isola o job da implementação — a troca é só
// INTEL_GEOCODER=google (+ chave/billing) quando o stub for implementado.
import type { GeoPrecision } from '@addere/types'
import { env } from '../../../lib/env'

export interface AddressParts {
  address: string | null
  bairro: string | null
  municipio: string | null
  uf: string | null
  cep: string | null
}

export interface GeoResult {
  lat: number
  lng: number
  precision: GeoPrecision
}

export interface GeocodingProvider {
  /** Gravado em GeoAddress.source ('nominatim' | 'google') */
  readonly source: string
  /** null = endereço não encontrado; lança em falha de rede/HTTP */
  geocode(normalizedAddress: string): Promise<GeoResult | null>
}

// ─── Normalização de endereço (pura) ───
// O texto normalizado é a chave de invalidação do cache: só re-geocodifica
// quando ele muda. Também é a query enviada ao provider.
export function normalizeAddress(parts: AddressParts): string | null {
  const clean = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim()
  const address = clean(parts.address)
  const bairro = clean(parts.bairro)
  const municipio = clean(parts.municipio)
  const uf = clean(parts.uf).toUpperCase()
  const cepDigits = clean(parts.cep).replace(/\D/g, '')
  // Sem município não geocodifica: busca free-form só por CEP no Nominatim
  // retorna coordenadas erradas (CEP brasileiro não é indexado de forma confiável)
  if (!municipio) return null
  const cityUf = [municipio, uf].filter(Boolean).join(' - ')
  const cep = cepDigits.length === 8 ? `${cepDigits.slice(0, 5)}-${cepDigits.slice(5)}` : ''
  return [address, bairro, cityUf, cep, 'BRASIL'].filter(Boolean).join(', ').toUpperCase()
}

// ─── Rate limiter serializado (1 req/s do Nominatim) ───
// Fila de promessas: cada chamada espera a anterior e garante o intervalo
// mínimo desde o início da última requisição. clock/sleep injetáveis p/ teste.
export function createRateLimiter(
  intervalMs: number,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  clock: () => number = () => Date.now()
): () => Promise<void> {
  let last = Number.NEGATIVE_INFINITY
  let chain: Promise<void> = Promise.resolve()
  return () => {
    const turn = chain.then(async () => {
      const wait = last + intervalMs - clock()
      if (wait > 0) await sleep(wait)
      last = clock()
    })
    chain = turn.catch(() => undefined)
    return turn
  }
}

// ─── Parser da resposta do Nominatim (formato jsonv2) ───

interface NominatimItem {
  lat?: string
  lon?: string
  category?: string // jsonv2; o formato antigo chama de 'class'
  class?: string
  type?: string
  addresstype?: string
  place_rank?: number | string
}

const STREET_KINDS = new Set([
  'road',
  'street',
  'residential',
  'pedestrian',
  'primary',
  'secondary',
  'tertiary',
  'highway',
])

// Clientes B2B casam com o POI do próprio estabelecimento (loja, indústria,
// escritório...) — precisão de endereço, não de cidade
const POI_KINDS = new Set([
  'shop',
  'amenity',
  'office',
  'tourism',
  'leisure',
  'craft',
  'historic',
  'man_made',
  'industrial',
])

export function precisionFromNominatim(
  item: Pick<NominatimItem, 'category' | 'class' | 'type' | 'addresstype' | 'place_rank'>
): GeoPrecision {
  const category = item.category ?? item.class ?? ''
  const kind = item.addresstype ?? item.type ?? ''
  const rank = Number(item.place_rank ?? Number.NaN)
  if (kind === 'postcode' || item.type === 'postcode') return 'CEP'
  // Nível de endereço: edifício, número de casa ou POI (place_rank 30 = endereço exato)
  if (
    category === 'building' ||
    kind === 'building' ||
    kind === 'house' ||
    POI_KINDS.has(category) ||
    POI_KINDS.has(kind) ||
    rank >= 30
  ) {
    return 'ROOFTOP'
  }
  if (category === 'highway' || STREET_KINDS.has(kind) || (rank >= 26 && rank <= 29)) return 'STREET'
  return 'CITY' // nível de cidade/bairro — não posiciona pino no mapa
}

export function parseNominatimResponse(payload: unknown): GeoResult | null {
  if (!Array.isArray(payload) || payload.length === 0) return null
  const item = payload[0] as NominatimItem
  const lat = Number(item.lat)
  const lng = Number(item.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, precision: precisionFromNominatim(item) }
}

// ─── Nominatim (OpenStreetMap) ───
// Termos de uso exigem User-Agent identificado e no máximo 1 req/s —
// usamos 1,1 s de folga; o cache permanente em GeoAddress evita repetição.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
const NOMINATIM_USER_AGENT = 'AddereInteligencia/1.0 (+https://github.com/gugaemail/addere)'
const NOMINATIM_INTERVAL_MS = 1100
const REQUEST_TIMEOUT_MS = 10_000

// Limiter único do processo: o scheduler roda o nightly de N empresas em
// paralelo e o limite de 1 req/s do OSM é por serviço, não por tenant
let sharedNominatimLimiter: (() => Promise<void>) | null = null
function nominatimLimiter(): () => Promise<void> {
  sharedNominatimLimiter ??= createRateLimiter(NOMINATIM_INTERVAL_MS)
  return sharedNominatimLimiter
}

export class NominatimProvider implements GeocodingProvider {
  readonly source = 'nominatim'
  private readonly waitTurn: () => Promise<void>

  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    rateLimiter?: () => Promise<void>
  ) {
    this.waitTurn = rateLimiter ?? nominatimLimiter()
  }

  async geocode(normalizedAddress: string): Promise<GeoResult | null> {
    await this.waitTurn()
    const url = new URL(NOMINATIM_URL)
    url.searchParams.set('format', 'jsonv2')
    url.searchParams.set('limit', '1')
    url.searchParams.set('countrycodes', 'br')
    url.searchParams.set('q', normalizedAddress)
    const response = await this.fetchFn(url, {
      headers: { 'User-Agent': NOMINATIM_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`Nominatim respondeu HTTP ${response.status}`)
    return parseNominatimResponse(await response.json())
  }
}

// ─── Google Geocoding — stub documentado (D14a) ───
// Para ativar: contratar billing no Google Cloud, criar GOOGLE_GEOCODING_API_KEY
// e trocar INTEL_GEOCODER=google. Implementação prevista:
//   GET https://maps.googleapis.com/maps/api/geocode/json?address=<q>&region=br&key=<key>
//   Mapeamento de precisão (geometry.location_type):
//     ROOFTOP → ROOFTOP · RANGE_INTERPOLATED/GEOMETRIC_CENTER → STREET ·
//     APPROXIMATE → CEP ou CITY conforme types (postal_code → CEP; locality → CITY)
export class GoogleProvider implements GeocodingProvider {
  readonly source = 'google'

  constructor(private readonly apiKey: string | undefined) {}

  async geocode(_normalizedAddress: string): Promise<GeoResult | null> {
    if (!this.apiKey) {
      throw new Error('GOOGLE_GEOCODING_API_KEY ausente — configure a chave ou use INTEL_GEOCODER=nominatim')
    }
    throw new Error('GoogleProvider é um stub (D14a) — implementar a chamada antes de usar INTEL_GEOCODER=google')
  }
}

// ─── Provider sintético (dev/smoke) ───
// Coordenadas determinísticas por hash do endereço, sem rede — par do
// INTEL_SQL_ADAPTER=mock. Jitter de ~±0,1° em torno de Campinas.
export class MockGeocodingProvider implements GeocodingProvider {
  readonly source = 'mock'

  async geocode(normalizedAddress: string): Promise<GeoResult | null> {
    let hash = 0
    for (const ch of normalizedAddress) hash = (hash * 31 + ch.charCodeAt(0)) | 0
    const jitter = (shift: number) => ((Math.abs(hash >> shift) % 1000) / 1000 - 0.5) * 0.2
    return { lat: -22.9 + jitter(0), lng: -47.06 + jitter(10), precision: 'STREET' }
  }
}

export function getGeocodingProvider(
  name: 'nominatim' | 'google' | 'mock' = env.INTEL_GEOCODER
): GeocodingProvider {
  if (name === 'mock') return new MockGeocodingProvider()
  if (name === 'google') return new GoogleProvider(env.GOOGLE_GEOCODING_API_KEY)
  return new NominatimProvider()
}
