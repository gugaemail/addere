// Job GEO (E15-F1): geocodifica clientes novos/alterados via GeocodingProvider.
// Cache permanente em GeoAddress — refaz só quando o endereço normalizado muda
// (não encontrado também fica em cache; falha transitória tenta de novo à noite).
import { prisma } from '@addere/db'
import { unprocessable } from '../../../lib/errors'
import { env } from '../../../lib/env'
import { registerJobHandler } from '../jobs/registry'
import {
  getGeocodingProvider,
  isRetryableGeoError,
  normalizeAddress,
  type GeocodingProvider,
} from './geocoding.provider'

// Teto por execução: a ~1 req/s do Nominatim, 300 ≈ 5,5 min dentro do noturno.
// O excedente fica para a próxima noite (relatado em `pending`). Com Google,
// que não tem esse limite, vale subir o INTEL_GEO_MAX_PER_RUN.
export const GEO_MAX_PER_RUN = env.INTEL_GEO_MAX_PER_RUN
// Falhas seguidas indicam problema sistêmico (rede, chave recusada) — aborta a
// fila. Só conta depois de esgotadas as tentativas: uma rajada de HTTP 429 é
// passageira e derrubava o noturno inteiro (5 seguidos pararam a carga em 252
// de 1131 em 09/2026).
const MAX_CONSECUTIVE_FAILURES = 5
const MAX_RETRIES = 3
const BACKOFF_BASE_MS = 2_000

/** Espera crescente entre tentativas: 2s, 4s, 8s. */
export function backoffMs(attempt: number): number {
  return BACKOFF_BASE_MS * 2 ** attempt
}

/** Geocodifica repetindo o que for transitório; erro permanente sobe na hora. */
export async function geocodeWithRetry(
  provider: GeocodingProvider,
  normalized: string,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  maxRetries: number = MAX_RETRIES
): Promise<Awaited<ReturnType<GeocodingProvider['geocode']>>> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await provider.geocode(normalized)
    } catch (err) {
      lastError = err
      if (!isRetryableGeoError(err) || attempt === maxRetries) throw err
      await sleep(backoffMs(attempt))
    }
  }
  throw lastError
}

export interface GeoRunSummary {
  candidates: number
  geocoded: number
  notFound: number
  failed: number
  pending: number
  skippedNoAddress: number
  aborted: boolean // fila interrompida por falhas seguidas (problema sistêmico)
}

interface GeoCandidate {
  customerCode: string
  loja: string
  normalized: string
  cep: string | null
}

export async function runGeocoding(
  companyId: string,
  provider: GeocodingProvider = getGeocodingProvider(),
  maxPerRun: number = GEO_MAX_PER_RUN
): Promise<GeoRunSummary> {
  const customers = await prisma.customer.findMany({
    where: { companyId, active: true, protheusCode: { not: null } },
    select: {
      protheusCode: true,
      loja: true,
      address: true,
      bairro: true,
      municipio: true,
      uf: true,
      cep: true,
    },
  })
  const cached = await prisma.geoAddress.findMany({
    where: { companyId },
    select: { customerCode: true, loja: true, normalizedAddress: true, lat: true, source: true },
  })
  const cacheByKey = new Map(cached.map((g) => [`${g.customerCode}|${g.loja}`, g]))

  let skippedNoAddress = 0
  const queue: GeoCandidate[] = []
  for (const customer of customers) {
    const customerCode = customer.protheusCode as string
    // '01' — mesmo fallback de loja do engine/plan (chaves precisam bater)
    const loja = customer.loja ?? '01'
    const normalized = normalizeAddress(customer)
    if (!normalized) {
      skippedNoAddress++
      continue
    }
    const hit = cacheByKey.get(`${customerCode}|${loja}`)
    // Cache válido: mesmo endereço E (achou coordenada OU foi este mesmo provider
    // que não achou). Trocar de provider dá nova chance a quem ficou sem posição,
    // sem regeocodificar — e sem cobrar de novo — quem já tem pino.
    const cacheValido =
      hit !== undefined &&
      hit.normalizedAddress === normalized &&
      (hit.lat !== null || hit.source === provider.source)
    if (cacheValido) continue
    queue.push({ customerCode, loja, normalized, cep: customer.cep })
  }

  let geocoded = 0
  let notFound = 0
  let failed = 0
  let processed = 0
  let consecutiveFailures = 0
  let aborted = false

  for (const item of queue.slice(0, maxPerRun)) {
    processed++
    const where = {
      companyId_customerCode_loja: {
        companyId,
        customerCode: item.customerCode,
        loja: item.loja,
      },
    }
    try {
      const result = await geocodeWithRetry(provider, item.normalized)
      consecutiveFailures = 0
      const data = {
        normalizedAddress: item.normalized,
        cep: item.cep,
        lat: result?.lat ?? null,
        lng: result?.lng ?? null,
        precision: result?.precision ?? null,
        source: result?.source ?? provider.source,
        geocodedAt: new Date(),
        error: result ? null : 'Endereço não encontrado',
      }
      await prisma.geoAddress.upsert({
        where,
        create: { companyId, customerCode: item.customerCode, loja: item.loja, ...data },
        update: data,
      })
      if (result) geocoded++
      else notFound++
    } catch (err) {
      failed++
      consecutiveFailures++
      const message = (err as Error).message.slice(0, 300)
      // Não grava normalizedAddress: o endereço segue "pendente" e tenta de novo
      await prisma.geoAddress
        .upsert({
          where,
          create: { companyId, customerCode: item.customerCode, loja: item.loja, error: message },
          update: { error: message },
        })
        .catch(() => undefined)
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        aborted = true
        break
      }
    }
  }

  return {
    candidates: queue.length,
    geocoded,
    notFound,
    failed,
    pending: queue.length - processed,
    skippedNoAddress,
    aborted,
  }
}

export async function geoHandler(companyId: string): Promise<GeoRunSummary> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { intelligenceEnabled: true },
  })
  if (!company) throw unprocessable('Empresa não encontrada')
  if (!company.intelligenceEnabled) throw unprocessable('Camada de Inteligência desligada')
  const summary = await runGeocoding(companyId)
  // Aborto sistêmico precisa marcar o passo (e o run noturno) como erro
  if (summary.aborted) {
    throw new Error(`Geocodificação abortada por falhas seguidas: ${JSON.stringify(summary)}`)
  }
  return summary
}

export function registerGeoJob(): void {
  registerJobHandler('GEO', geoHandler)
}
