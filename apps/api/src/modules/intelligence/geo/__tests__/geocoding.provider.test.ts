// Testes do provider de geocodificação (E15-F1): normalização (pura),
// rate limiter (clock/sleep mockados) e parser Nominatim (fixtures).
import { describe, expect, it, vi } from 'vitest'
import {
  GoogleProvider,
  MockGeocodingProvider,
  NominatimProvider,
  createRateLimiter,
  normalizeAddress,
  parseNominatimResponse,
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

describe('GoogleProvider (stub D14a)', () => {
  it('sem chave, explica a configuração', async () => {
    await expect(new GoogleProvider(undefined).geocode('X')).rejects.toThrow('GOOGLE_GEOCODING_API_KEY')
  })

  it('com chave, avisa que é stub', async () => {
    await expect(new GoogleProvider('key').geocode('X')).rejects.toThrow('stub')
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
