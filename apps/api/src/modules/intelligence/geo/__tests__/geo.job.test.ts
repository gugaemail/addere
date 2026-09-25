// Testes do job GEO (E15-F1): cache por endereço normalizado, upserts,
// teto por execução e aborto em falha sistêmica. Prisma via prisma-mock.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@addere/db', async () => (await import('../../../../test-utils/prisma-mock')).mockDb())

import { prismaMock, resetPrismaMock } from '../../../../test-utils/prisma-mock'
import { backoffMs, geocodeWithRetry, geoHandler, runGeocoding } from '../geo.job'
import type { GeocodingProvider } from '../geocoding.provider'

const COMPANY = '11111111-1111-4111-8111-111111111111'

function customer(code: string, overrides: Record<string, unknown> = {}) {
  return {
    protheusCode: code,
    loja: '01',
    address: `Rua ${code}, 100`,
    bairro: 'Centro',
    municipio: 'Campinas',
    uf: 'SP',
    cep: '13010000',
    ...overrides,
  }
}

function providerMock(result: unknown = { lat: -22.9, lng: -47.06, precision: 'STREET' }) {
  return {
    source: 'nominatim',
    geocode: vi.fn().mockResolvedValue(result),
  } as unknown as GeocodingProvider & { geocode: ReturnType<typeof vi.fn> }
}

beforeEach(() => {
  resetPrismaMock()
})

describe('runGeocoding', () => {
  it('geocodifica cliente novo e grava o cache completo', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customer('A')])
    const provider = providerMock()

    const summary = await runGeocoding(COMPANY, provider)

    expect(summary).toMatchObject({ candidates: 1, geocoded: 1, failed: 0, pending: 0, aborted: false })
    expect(provider.geocode).toHaveBeenCalledWith('RUA A, 100, CENTRO, CAMPINAS - SP, 13010-000, BRASIL')
    const upsert = prismaMock.geoAddress.upsert.mock.calls[0][0]
    expect(upsert.where).toEqual({
      companyId_customerCode_loja: { companyId: COMPANY, customerCode: 'A', loja: '01' },
    })
    expect(upsert.update).toMatchObject({
      lat: -22.9,
      lng: -47.06,
      precision: 'STREET',
      source: 'nominatim',
      error: null,
    })
  })

  it('cliente com loja null usa a chave loja=01 (mesma do engine)', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customer('A', { loja: null })])
    const provider = providerMock()

    await runGeocoding(COMPANY, provider)

    const upsert = prismaMock.geoAddress.upsert.mock.calls[0][0]
    expect(upsert.where).toEqual({
      companyId_customerCode_loja: { companyId: COMPANY, customerCode: 'A', loja: '01' },
    })
  })

  it('não refaz quando o endereço normalizado não mudou (mesmo com erro anterior)', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customer('A')])
    prismaMock.geoAddress.findMany.mockResolvedValue([
      {
        customerCode: 'A',
        loja: '01',
        normalizedAddress: 'RUA A, 100, CENTRO, CAMPINAS - SP, 13010-000, BRASIL',
      },
    ])
    const provider = providerMock()

    const summary = await runGeocoding(COMPANY, provider)

    expect(summary.candidates).toBe(0)
    expect(provider.geocode).not.toHaveBeenCalled()
  })

  it('refaz quando o endereço mudou', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customer('A', { address: 'Rua Nova, 9' })])
    prismaMock.geoAddress.findMany.mockResolvedValue([
      { customerCode: 'A', loja: '01', normalizedAddress: 'RUA A, 100, ...' },
    ])
    const provider = providerMock()

    const summary = await runGeocoding(COMPANY, provider)

    expect(summary.geocoded).toBe(1)
    expect(provider.geocode).toHaveBeenCalledTimes(1)
  })

  it('cliente sem cidade e sem CEP é pulado (skippedNoAddress)', async () => {
    prismaMock.customer.findMany.mockResolvedValue([
      customer('A', { municipio: null, cep: null }),
      customer('B'),
    ])
    const provider = providerMock()

    const summary = await runGeocoding(COMPANY, provider)

    expect(summary).toMatchObject({ skippedNoAddress: 1, candidates: 1, geocoded: 1 })
  })

  it('não encontrado grava erro em cache (não tenta de novo à noite seguinte)', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customer('A')])
    const provider = providerMock(null)

    const summary = await runGeocoding(COMPANY, provider)

    expect(summary).toMatchObject({ notFound: 1, geocoded: 0 })
    const upsert = prismaMock.geoAddress.upsert.mock.calls[0][0]
    expect(upsert.update).toMatchObject({
      lat: null,
      lng: null,
      precision: null,
      error: 'Endereço não encontrado',
    })
    // normalizedAddress gravado → vira cache hit na próxima execução
    expect(upsert.update.normalizedAddress).toContain('RUA A')
  })

  it('falha transitória grava só o erro e mantém o endereço pendente', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customer('A')])
    const provider = providerMock()
    provider.geocode.mockRejectedValue(new Error('ECONNRESET'))

    const summary = await runGeocoding(COMPANY, provider)

    expect(summary).toMatchObject({ failed: 1, geocoded: 0 })
    const upsert = prismaMock.geoAddress.upsert.mock.calls[0][0]
    expect(upsert.update).toEqual({ error: 'ECONNRESET' }) // sem normalizedAddress → refaz
  })

  it('respeita o teto por execução e relata pendentes', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customer('A'), customer('B'), customer('C')])
    const provider = providerMock()

    const summary = await runGeocoding(COMPANY, provider, 2)

    expect(summary).toMatchObject({ candidates: 3, geocoded: 2, pending: 1 })
    expect(provider.geocode).toHaveBeenCalledTimes(2)
  })

  it('aborta a fila após 5 falhas seguidas (problema sistêmico)', async () => {
    prismaMock.customer.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => customer(`C${i}`))
    )
    const provider = providerMock()
    provider.geocode.mockRejectedValue(new Error('rede fora'))

    const summary = await runGeocoding(COMPANY, provider)

    expect(summary.failed).toBe(5)
    expect(summary.pending).toBe(5)
    expect(summary.aborted).toBe(true)
    expect(provider.geocode).toHaveBeenCalledTimes(5)
  })
})

describe('geoHandler', () => {
  it('rejeita empresa inexistente ou com Inteligência desligada', async () => {
    prismaMock.company.findUnique.mockResolvedValue(null)
    await expect(geoHandler(COMPANY)).rejects.toThrow('Empresa não encontrada')

    prismaMock.company.findUnique.mockResolvedValue({ intelligenceEnabled: false })
    await expect(geoHandler(COMPANY)).rejects.toThrow('desligada')
  })
})

// ─── Retry (a rajada de HTTP 429 que parou a carga em 252 de 1131) ───

describe('geocodeWithRetry', () => {
  const semEspera = async () => undefined
  const achou = { lat: -1, lng: -2, precision: 'ROOFTOP' as const }

  it('repete erro transitório e devolve o acerto', async () => {
    const geocode = vi
      .fn()
      .mockRejectedValueOnce(new Error('Nominatim respondeu HTTP 429'))
      .mockRejectedValueOnce(new Error('Nominatim respondeu HTTP 429'))
      .mockResolvedValue(achou)
    const provider = { source: 'nominatim', geocode } as unknown as GeocodingProvider
    await expect(geocodeWithRetry(provider, 'X', semEspera)).resolves.toEqual(achou)
    expect(geocode).toHaveBeenCalledTimes(3)
  })

  it('erro permanente sobe na primeira, sem gastar tentativa', async () => {
    const geocode = vi.fn().mockRejectedValue(new Error('Google Geocoding status REQUEST_DENIED'))
    const provider = { source: 'google', geocode } as unknown as GeocodingProvider
    await expect(geocodeWithRetry(provider, 'X', semEspera)).rejects.toThrow('REQUEST_DENIED')
    expect(geocode).toHaveBeenCalledTimes(1)
  })

  it('desiste depois do teto de tentativas', async () => {
    const geocode = vi.fn().mockRejectedValue(new Error('HTTP 503'))
    const provider = { source: 'google', geocode } as unknown as GeocodingProvider
    await expect(geocodeWithRetry(provider, 'X', semEspera, 2)).rejects.toThrow('HTTP 503')
    expect(geocode).toHaveBeenCalledTimes(3) // 1 + 2 tentativas
  })

  it('espera crescente entre tentativas', () => {
    expect([backoffMs(0), backoffMs(1), backoffMs(2)]).toEqual([2000, 4000, 8000])
  })
})

// ─── Cache: trocar de provider precisa dar nova chance a quem ficou sem posição ───

describe('cache por provider', () => {
  const enderecoDe = (code: string) =>
    `RUA ${code}, 100, CENTRO, CAMPINAS - SP, 13010-000, BRASIL`

  it('não refaz quem já tem coordenada, mesmo de outro provider', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customer('A')])
    prismaMock.geoAddress.findMany.mockResolvedValue([
      { customerCode: 'A', loja: '01', normalizedAddress: enderecoDe('A'), lat: -22.9, source: 'nominatim' },
    ])
    const provider = providerMock()
    ;(provider as unknown as { source: string }).source = 'google'
    const summary = await runGeocoding(COMPANY, provider)
    expect(summary.candidates).toBe(0)
    expect(provider.geocode).not.toHaveBeenCalled()
  })

  it('refaz quem ficou sem coordenada quando o provider muda', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customer('A')])
    prismaMock.geoAddress.findMany.mockResolvedValue([
      {
        customerCode: 'A',
        loja: '01',
        normalizedAddress: enderecoDe('A'),
        lat: null,
        source: 'nominatim',
      },
    ])
    const provider = providerMock()
    ;(provider as unknown as { source: string }).source = 'google'
    const summary = await runGeocoding(COMPANY, provider)
    // os 148 "endereço não encontrado" do Nominatim ganham chance com o Google
    expect(summary.candidates).toBe(1)
    expect(provider.geocode).toHaveBeenCalledTimes(1)
  })

  it('não insiste com o mesmo provider que já não achou', async () => {
    prismaMock.customer.findMany.mockResolvedValue([customer('A')])
    prismaMock.geoAddress.findMany.mockResolvedValue([
      {
        customerCode: 'A',
        loja: '01',
        normalizedAddress: enderecoDe('A'),
        lat: null,
        source: 'nominatim',
      },
    ])
    const provider = providerMock() // source 'nominatim'
    const summary = await runGeocoding(COMPANY, provider)
    expect(summary.candidates).toBe(0)
    expect(provider.geocode).not.toHaveBeenCalled()
  })
})
