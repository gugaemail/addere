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
  /** Quem respondeu de fato — o fallback pode nao ser o provider principal */
  source?: string
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

// ─── Google Geocoding ───
// Resolve endereço brasileiro incompleto muito melhor que o Nominatim: o
// cadastro do ERP vem com "VIA ANHANGUERA, SN", sem número nem bairro, e o
// Nominatim acertou 40% numa base real (99 de 247 em 09/2026).
//
// A chave NAO pode ser a mesma do mapa do app: aquela e restrita por
// (package, SHA-1) e uma chamada de servidor volta REQUEST_DENIED. Crie uma
// chave separada, restrita por IP ou sem restricao de aplicativo, e limitada a
// Geocoding API.
const GOOGLE_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

interface GoogleResult {
  geometry?: { location?: { lat?: number; lng?: number }; location_type?: string }
  types?: string[]
}

/** location_type do Google → GeoPrecision; APPROXIMATE cai em CEP ou CITY. */
export function precisionFromGoogle(result: GoogleResult): GeoPrecision {
  const locationType = result.geometry?.location_type
  if (locationType === 'ROOFTOP') return 'ROOFTOP'
  if (locationType === 'RANGE_INTERPOLATED' || locationType === 'GEOMETRIC_CENTER') return 'STREET'
  const types = result.types ?? []
  if (types.includes('postal_code')) return 'CEP'
  return 'CITY'
}

/**
 * O Google devolve HTTP 200 com o erro no corpo. ZERO_RESULTS e "nao achou"
 * (null, vira cache); o resto lanca, para nao gravar cache de falha nossa como
 * se fosse endereco inexistente.
 */
export function parseGoogleResponse(raw: unknown): GeoResult | null {
  const body = (raw ?? {}) as { status?: string; results?: GoogleResult[]; error_message?: string }
  if (body.status === 'ZERO_RESULTS') return null
  if (body.status !== 'OK') {
    const detail = body.error_message ? `: ${body.error_message}` : ''
    throw new Error(`Google Geocoding status ${body.status ?? 'desconhecido'}${detail}`)
  }
  const first = body.results?.[0]
  if (!first) return null
  const lat = Number(first.geometry?.location?.lat)
  const lng = Number(first.geometry?.location?.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng, precision: precisionFromGoogle(first), source: 'google' }
}

export class GoogleProvider implements GeocodingProvider {
  readonly source = 'google'

  constructor(
    private readonly apiKey: string | undefined,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async geocode(normalizedAddress: string): Promise<GeoResult | null> {
    if (!this.apiKey) {
      throw new Error('GOOGLE_GEOCODING_API_KEY ausente — configure a chave ou use INTEL_GEOCODER=nominatim')
    }
    const url = new URL(GOOGLE_URL)
    url.searchParams.set('address', normalizedAddress)
    url.searchParams.set('region', 'br')
    url.searchParams.set('language', 'pt-BR')
    url.searchParams.set('key', this.apiKey)
    const response = await this.fetchFn(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    // A URL carrega a chave: nunca entra em mensagem de erro
    if (!response.ok) throw new Error(`Google Geocoding respondeu HTTP ${response.status}`)
    return parseGoogleResponse(await response.json())
  }
}

// ─── Fallback entre providers ───
// Falha do principal (cota, rede, chave recusada) nao pode deixar o tenant sem
// nenhuma coordenada. "Nao encontrou" tambem tenta o secundario: sao bases de
// dados diferentes. O `source` do resultado diz quem respondeu, entao provider
// principal quebrado aparece em intel_geo_addresses em vez de passar batido.
export class FallbackGeocodingProvider implements GeocodingProvider {
  readonly source: string

  constructor(
    private readonly primary: GeocodingProvider,
    private readonly secondary: GeocodingProvider
  ) {
    this.source = primary.source
  }

  async geocode(normalizedAddress: string): Promise<GeoResult | null> {
    try {
      const hit = await this.primary.geocode(normalizedAddress)
      if (hit) return { ...hit, source: hit.source ?? this.primary.source }
    } catch {
      // segue para o secundario — o erro do principal nao interessa aqui
    }
    const fallback = await this.secondary.geocode(normalizedAddress)
    return fallback ? { ...fallback, source: fallback.source ?? this.secondary.source } : null
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

/** Erro que vale nova tentativa: cota, indisponibilidade e timeout sao passageiros. */
export function isRetryableGeoError(err: unknown): boolean {
  const message = (err as Error)?.message ?? ''
  return /HTTP (429|5\d\d)\b|OVER_QUERY_LIMIT|UNKNOWN_ERROR|timed? ?out|aborted/i.test(message)
}

export function getGeocodingProvider(
  name: 'nominatim' | 'google' | 'mock' = env.INTEL_GEOCODER
): GeocodingProvider {
  if (name === 'mock') return new MockGeocodingProvider()
  if (name === 'google') {
    const google = new GoogleProvider(env.GOOGLE_GEOCODING_API_KEY)
    // Sem chave nao ha fallback: o erro precisa aparecer, senao um INTEL_GEOCODER
    // =google mal configurado rodaria em Nominatim para sempre, em silencio.
    if (!env.GOOGLE_GEOCODING_API_KEY) return google
    return new FallbackGeocodingProvider(google, new NominatimProvider())
  }
  return new NominatimProvider()
}
