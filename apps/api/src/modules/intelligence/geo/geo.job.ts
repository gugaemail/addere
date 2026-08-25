// Job GEO (E15-F1): geocodifica clientes novos/alterados via GeocodingProvider.
// Cache permanente em GeoAddress — refaz só quando o endereço normalizado muda
// (não encontrado também fica em cache; falha transitória tenta de novo à noite).
import { prisma } from '@addere/db'
import { unprocessable } from '../../../lib/errors'
import { registerJobHandler } from '../jobs/registry'
import { getGeocodingProvider, normalizeAddress, type GeocodingProvider } from './geocoding.provider'

// Teto por execução: a ~1 req/s do Nominatim, 300 ≈ 5,5 min dentro do noturno.
// O excedente fica para a próxima noite (relatado em `pending`).
export const GEO_MAX_PER_RUN = 300
// Falhas seguidas indicam problema sistêmico (rede, stub Google) — aborta a fila
const MAX_CONSECUTIVE_FAILURES = 5

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
    select: { customerCode: true, loja: true, normalizedAddress: true },
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
    // Cache válido (sucesso OU "não encontrado" com o mesmo endereço) — não refaz
    if (hit && hit.normalizedAddress === normalized) continue
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
      const result = await provider.geocode(item.normalized)
      consecutiveFailures = 0
      const data = {
        normalizedAddress: item.normalized,
        cep: item.cep,
        lat: result?.lat ?? null,
        lng: result?.lng ?? null,
        precision: result?.precision ?? null,
        source: provider.source,
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
