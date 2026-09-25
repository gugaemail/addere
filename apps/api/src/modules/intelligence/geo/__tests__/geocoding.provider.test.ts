// Testes do provider de geocodificação (E15-F1): normalização (pura),
// rate limiter (clock/sleep mockados) e parser Nominatim (fixtures).
import { describe, expect, it, vi } from 'vitest'
import {
  FallbackGeocodingProvider,
  GoogleProvider,
  MockGeocodingProvider,
  NominatimProvider,
  createRateLimiter,
  isRetryableGeoError,
  normalizeAddress,
  parseGoogleResponse,
  parseNominatimResponse,
  precisionFromGoogle,
  precisionFromNominatim,
} from '../geocoding.provider'

describe('normalizeAddress', () => {
  it('monta o endereço completo em caixa alta com CEP formatado', () => {
    expect(
      normalizeAddress({
        address: 'Rua  das Flores,  123',
        bairro: 'Centro',
        municipio: 'São Paulo',
        uf: 'sp',
        cep: '01310100',
      })
    ).toBe('RUA DAS FLORES, 123, CENTRO, SÃO PAULO - SP, 01310-100, BRASIL')
  })

  it('funciona só com cidade/UF', () => {
    expect(normalizeAddress({ address: null, bairro: null, municipio: 'Campinas', uf: 'SP', cep: null })).toBe(
      'CAMPINAS - SP, BRASIL'
    )
  })

  it('retorna null sem município (só-CEP geocodifica errado no Nominatim)', () => {
    expect(normalizeAddress({ address: null, bairro: null, municipio: null, uf: null, cep: '13010-000' })).toBeNull()
    expect(normalizeAddress({ address: 'Rua X', bairro: null, municipio: null, uf: null, cep: '123' })).toBeNull()
    expect(normalizeAddress({ address: null, bairro: null, municipio: '', uf: 'SP', cep: null })).toBeNull()
  })

  it('colapsa espaços e ignora partes vazias', () => {
    expect(
      normalizeAddress({ address: '  ', bairro: null, municipio: '  Rio   de Janeiro ', uf: null, cep: null })
    ).toBe('RIO DE JANEIRO, BRASIL')
  })
})

describe('createRateLimiter', () => {
  it('não espera na primeira chamada e espaça as seguintes', async () => {
    let now = 0
    const sleeps: number[] = []
    const sleep = vi.fn(async (ms: number) => {
      sleeps.push(ms)
      now += ms
    })
    const wait = createRateLimiter(1000, sleep, () => now)

    await wait() // primeira: sem espera
    expect(sleeps).toEqual([])

    await wait() // imediata: espera o intervalo inteiro
    expect(sleeps).toEqual([1000])

    now += 400 // passou parte do intervalo
    await wait()
    expect(sleeps).toEqual([1000, 600])

    now += 5000 // intervalo já venceu
    await wait()
    expect(sleeps).toEqual([1000, 600])
  })

  it('serializa chamadas concorrentes', async () => {
    let now = 0
    const sleep = async (ms: number) => {
      now += ms
    }
    const wait = createRateLimiter(1000, sleep, () => now)
    await Promise.all([wait(), wait(), wait()])
    expect(now).toBe(2000) // 3 chamadas → 2 intervalos
  })
})

describe('parseNominatimResponse', () => {
  const base = { lat: '-23.561414', lon: '-46.655881' }

  it('building → ROOFTOP', () => {
    expect(parseNominatimResponse([{ ...base, class: 'building', type: 'yes', addresstype: 'building' }])).toEqual({
      lat: -23.561414,
      lng: -46.655881,
      precision: 'ROOFTOP',
    })
  })

  it('via (highway/road) → STREET', () => {
    expect(parseNominatimResponse([{ ...base, class: 'highway', type: 'residential', addresstype: 'road' }])?.precision).toBe(
      'STREET'
    )
  })

  it('postcode → CEP', () => {
    expect(parseNominatimResponse([{ ...base, class: 'place', type: 'postcode', addresstype: 'postcode' }])?.precision).toBe(
      'CEP'
    )
  })

  it('POI do estabelecimento (jsonv2 category) → ROOFTOP', () => {
    // Caso real: 'Avenida Paulista, 1578' casa com o POI do MASP (tourism)
    expect(
      parseNominatimResponse([{ ...base, category: 'tourism', type: 'museum', addresstype: 'tourism', place_rank: 30 }])
    ?.precision).toBe('ROOFTOP')
    expect(precisionFromNominatim({ category: 'landuse', type: 'industrial', addresstype: 'industrial' })).toBe('ROOFTOP')
    expect(precisionFromNominatim({ category: 'place', type: 'house', addresstype: 'place', place_rank: 30 })).toBe('ROOFTOP')
  })

  it('place_rank 30 de kind desconhecido → ROOFTOP; 26 → STREET', () => {
    expect(precisionFromNominatim({ category: 'x', type: 'y', addresstype: 'z', place_rank: 30 })).toBe('ROOFTOP')
    expect(precisionFromNominatim({ category: 'x', type: 'y', addresstype: 'z', place_rank: 26 })).toBe('STREET')
  })

  it('cidade/bairro → CITY', () => {
    expect(precisionFromNominatim({ class: 'boundary', type: 'administrative', addresstype: 'city' })).toBe('CITY')
    expect(precisionFromNominatim({ class: 'place', type: 'suburb', addresstype: 'suburb' })).toBe('CITY')
  })

  it('lista vazia ou coordenada inválida → null', () => {
    expect(parseNominatimResponse([])).toBeNull()
    expect(parseNominatimResponse('nada')).toBeNull()
    expect(parseNominatimResponse([{ lat: 'x', lon: 'y' }])).toBeNull()
  })
})

describe('NominatimProvider', () => {
  const noWait = () => Promise.resolve()

  it('chama o endpoint com q/format/countrycodes e User-Agent identificado', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => [{ lat: '-23.5', lon: '-46.6', addresstype: 'road' }],
    })) as unknown as typeof fetch
    const provider = new NominatimProvider(fetchFn, noWait)

    const result = await provider.geocode('RUA X, CAMPINAS - SP, BRASIL')

    expect(result).toEqual({ lat: -23.5, lng: -46.6, precision: 'STREET' })
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [URL, RequestInit]
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search')
    expect(url.searchParams.get('q')).toBe('RUA X, CAMPINAS - SP, BRASIL')
    expect(url.searchParams.get('format')).toBe('jsonv2')
    expect(url.searchParams.get('countrycodes')).toBe('br')
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('AddereInteligencia')
  })

  it('lança em resposta HTTP não-ok', async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429 })) as unknown as typeof fetch
    const provider = new NominatimProvider(fetchFn, noWait)
    await expect(provider.geocode('X')).rejects.toThrow('HTTP 429')
  })
})

// fetch sempre injetado: o teste antigo chamava o Google de verdade e só passava
// porque a chave falsa dava REQUEST_DENIED — rede dentro de teste unitário
const googleFetch = (body: unknown, ok = true, status = 200) =>
  vi.fn(async () => ({ ok, status, json: async () => body })) as unknown as typeof fetch

const googleOk = (locationType: string, types: string[] = []) => ({
  status: 'OK',
  results: [{ geometry: { location: { lat: -23.5, lng: -46.6 }, location_type: locationType }, types }],
})

describe('GoogleProvider', () => {
  it('sem chave, explica a configuração', async () => {
    await expect(new GoogleProvider(undefined).geocode('X')).rejects.toThrow('GOOGLE_GEOCODING_API_KEY')
  })

  it('devolve coordenada e marca a origem', async () => {
    const provider = new GoogleProvider('k', googleFetch(googleOk('ROOFTOP')))
    const hit = await provider.geocode('RUA X, 10, SAO PAULO - SP, BRASIL')
    expect(hit).toEqual({ lat: -23.5, lng: -46.6, precision: 'ROOFTOP', source: 'google' })
  })

  it('ZERO_RESULTS é "não encontrado", não erro', async () => {
    const provider = new GoogleProvider('k', googleFetch({ status: 'ZERO_RESULTS', results: [] }))
    await expect(provider.geocode('X')).resolves.toBeNull()
  })

  it('erro no corpo com HTTP 200 lança, para não virar cache de "não existe"', async () => {
    const provider = new GoogleProvider('k', googleFetch({ status: 'REQUEST_DENIED', error_message: 'chave restrita' }))
    await expect(provider.geocode('X')).rejects.toThrow(/REQUEST_DENIED.*chave restrita/)
  })

  it('não vaza a chave na mensagem de erro HTTP', async () => {
    const provider = new GoogleProvider('SEGREDO', googleFetch(null, false, 403))
    await expect(provider.geocode('X')).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('SEGREDO') })
    )
  })
})

describe('precisão do Google', () => {
  it('mapeia location_type e cai em CEP/CITY no APPROXIMATE', () => {
    expect(precisionFromGoogle({ geometry: { location_type: 'ROOFTOP' } })).toBe('ROOFTOP')
    expect(precisionFromGoogle({ geometry: { location_type: 'RANGE_INTERPOLATED' } })).toBe('STREET')
    expect(precisionFromGoogle({ geometry: { location_type: 'GEOMETRIC_CENTER' } })).toBe('STREET')
    expect(
      precisionFromGoogle({ geometry: { location_type: 'APPROXIMATE' }, types: ['postal_code'] })
    ).toBe('CEP')
    expect(precisionFromGoogle({ geometry: { location_type: 'APPROXIMATE' }, types: ['locality'] })).toBe('CITY')
  })

  it('corpo sem coordenada utilizável vira null', () => {
    expect(parseGoogleResponse({ status: 'OK', results: [] })).toBeNull()
    expect(parseGoogleResponse({ status: 'OK', results: [{ geometry: {} }] })).toBeNull()
  })
})

describe('FallbackGeocodingProvider', () => {
  const achou = { lat: -1, lng: -2, precision: 'ROOFTOP' as const }
  const stub = (impl: () => Promise<unknown>, source: string) => ({ source, geocode: impl }) as never

  it('usa o principal quando ele responde', async () => {
    const secundario = vi.fn()
    const p = new FallbackGeocodingProvider(
      stub(async () => achou, 'google'),
      stub(secundario as never, 'nominatim')
    )
    await expect(p.geocode('X')).resolves.toMatchObject({ source: 'google' })
    expect(secundario).not.toHaveBeenCalled()
  })

  it('cai no secundário quando o principal lança, e registra quem respondeu', async () => {
    const p = new FallbackGeocodingProvider(
      stub(async () => {
        throw new Error('Google Geocoding status OVER_QUERY_LIMIT')
      }, 'google'),
      stub(async () => achou, 'nominatim')
    )
    // source do resultado denuncia o principal quebrado em vez de passar batido
    await expect(p.geocode('X')).resolves.toMatchObject({ source: 'nominatim' })
  })

  it('tenta o secundário também quando o principal não acha', async () => {
    const p = new FallbackGeocodingProvider(
      stub(async () => null, 'google'),
      stub(async () => achou, 'nominatim')
    )
    await expect(p.geocode('X')).resolves.toMatchObject({ source: 'nominatim' })
  })
})

describe('isRetryableGeoError', () => {
  it('separa o que passa do que não passa', () => {
    expect(isRetryableGeoError(new Error('Nominatim respondeu HTTP 429'))).toBe(true)
    expect(isRetryableGeoError(new Error('Google Geocoding respondeu HTTP 503'))).toBe(true)
    expect(isRetryableGeoError(new Error('Google Geocoding status OVER_QUERY_LIMIT'))).toBe(true)
    expect(isRetryableGeoError(new Error('The operation was aborted due to timeout'))).toBe(true)
    // configuração errada não melhora com nova tentativa
    expect(isRetryableGeoError(new Error('Google Geocoding status REQUEST_DENIED'))).toBe(false)
    expect(isRetryableGeoError(new Error('Nominatim respondeu HTTP 400'))).toBe(false)
  })
})

describe('MockGeocodingProvider', () => {
  it('é determinístico e fica perto de Campinas com precisão STREET', async () => {
    const provider = new MockGeocodingProvider()
    const a = await provider.geocode('RUA A, CAMPINAS - SP, BRASIL')
    const b = await provider.geocode('RUA A, CAMPINAS - SP, BRASIL')
    const c = await provider.geocode('RUA OUTRA, CAMPINAS - SP, BRASIL')

    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
    expect(a?.precision).toBe('STREET')
    expect(a?.lat).toBeGreaterThan(-23.1)
    expect(a?.lat).toBeLessThan(-22.7)
    expect(a?.lng).toBeGreaterThan(-47.3)
    expect(a?.lng).toBeLessThan(-46.9)
  })
})
