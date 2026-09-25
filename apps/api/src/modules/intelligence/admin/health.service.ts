// Relatório de saúde dos dados da Inteligência (E4, tela W4).
import { prisma } from '@addere/db'
import type { Company } from '@prisma/client'
import type { GeoPrecision, HealthReport, IntelJob, IntelJobRunStatus, IntelligenceConfig } from '@addere/types'
import { mergeIntelligenceConfig } from './config.routes'

const SAMPLE = 20
const TRACKED_JOBS: IntelJob[] = ['NIGHTLY', 'REFRESH', 'SYNC', 'GOALS', 'GEO', 'PURGE']

export interface RunStep {
  step: string
  ok: boolean
  error?: string
}

/**
 * Lê `metadata.steps`, gravado pelo noturno e pelo refresh. O backfill grava
 * outro formato no mesmo campo, então nada aqui pode assumir o shape: o que
 * não for passo reconhecível é descartado em vez de derrubar o relatório.
 */
export function parseRunSteps(metadata: unknown): RunStep[] {
  if (metadata === null || typeof metadata !== 'object') return []
  const steps = (metadata as { steps?: unknown }).steps
  if (!Array.isArray(steps)) return []
  return steps.flatMap((raw) => {
    if (raw === null || typeof raw !== 'object') return []
    const { step, ok, error } = raw as Record<string, unknown>
    if (typeof step !== 'string') return []
    return [{ step, ok: ok !== false, error: typeof error === 'string' ? error : undefined }]
  })
}

/**
 * SYNC, GEO e GOALS não têm run próprio: rodam como passo do noturno,
 * reaproveitando o runId dele. Sem traduzir o passo de volta para o job, o
 * frescor deles ficava em "nunca" para sempre — inclusive logo depois de rodar.
 */
function jobOfStep(step: string): IntelJob | null {
  switch (step.split(':')[0]) {
    case 'sync':
      return 'SYNC'
    case 'geo':
      return 'GEO'
    case 'goals':
      return 'GOALS'
    case 'engine':
      return 'ENGINE'
    case 'plan':
      return 'PLAN'
    case 'purge':
      return 'PURGE'
    default:
      return null
  }
}

export interface RunForFreshness {
  job: string
  status: string
  startedAt: Date
  metadata?: unknown
}

/**
 * Frescor por job: o run próprio quando existe, senão o passo correspondente
 * dentro do noturno/refresh. Empate fica com o run próprio, que é a fonte mais
 * forte. O horário é o do run — o passo não guarda o seu, e a diferença de
 * minutos não muda a faixa do badge, que é de 24 h.
 */
export function computeFreshness(runs: RunForFreshness[]): HealthReport['freshness'] {
  return TRACKED_JOBS.map((job) => {
    let best: { at: Date; status: IntelJobRunStatus } | null = null
    for (const run of runs) {
      const found: IntelJobRunStatus[] = []
      if (run.job === job) found.push(run.status as IntelJobRunStatus)
      const steps = parseRunSteps(run.metadata).filter((s) => jobOfStep(s.step) === job)
      if (steps.length > 0) found.push(steps.every((s) => s.ok) ? 'OK' : 'ERROR')
      for (const status of found) {
        if (best === null || run.startedAt > best.at) best = { at: run.startedAt, status }
      }
    }
    return {
      job,
      lastRunAt: best?.at.toISOString() ?? null,
      lastStatus: best?.status ?? null,
    }
  })
}

/** Média simples dos componentes de completude (0–100, arredondado). */
export function computeHealthyPct(components: number[]): number {
  if (components.length === 0) return 100
  const mean = components.reduce((a, b) => a + b, 0) / components.length
  return Math.round(mean)
}

/** Próximo noturno em São Paulo (UTC-3 fixo desde 2019, sem horário de verão). */
export function nextNightlyAt(now: Date, syncHour: number): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const hh = String(syncHour).padStart(2, '0')
  const today = new Date(`${get('year')}-${get('month')}-${get('day')}T${hh}:00:00-03:00`)
  return Number(get('hour')) < syncHour
    ? today
    : new Date(today.getTime() + 24 * 60 * 60 * 1000)
}

export interface ProtheusFixItem {
  type: 'cliente_sem_cidade' | 'venda_sem_vendedor' | 'venda_cliente_desconhecido'
  code: string
  detail: string
}

export async function buildHealthReport(
  company: Company,
  now: Date = new Date()
): Promise<HealthReport & { fixes: ProtheusFixItem[]; config: IntelligenceConfig }> {
  const config = mergeIntelligenceConfig(company.intelligenceConfig)
  const companyId = company.id

  // ─── Completude: clientes sem cidade/bairro ───
  const [customersTotal, customersNoCity, noCityRows] = await Promise.all([
    prisma.customer.count({ where: { companyId, active: true } }),
    prisma.customer.count({
      where: { companyId, active: true, OR: [{ municipio: null }, { municipio: '' }] },
    }),
    prisma.customer.findMany({
      where: { companyId, active: true, OR: [{ municipio: null }, { municipio: '' }] },
      select: { protheusCode: true, name: true },
      take: SAMPLE,
    }),
  ])

  // ─── Completude: vendas sem vendedor ───
  const [salesTotal, salesNoVendor, noVendorRows] = await Promise.all([
    prisma.salesItem.count({ where: { companyId } }),
    prisma.salesItem.count({ where: { companyId, vendorCode: null } }),
    prisma.salesItem.findMany({
      where: { companyId, vendorCode: null },
      select: { orderRef: true },
      distinct: ['orderRef'],
      take: SAMPLE,
    }),
  ])

  // ─── Vendas com cliente inexistente no cadastro ───
  const [salesCustomers, knownCustomers] = await Promise.all([
    prisma.salesItem.groupBy({
      by: ['customerCode'],
      where: { companyId },
      _count: { customerCode: true },
    }),
    prisma.customer.findMany({
      where: { companyId, protheusCode: { not: null } },
      select: { protheusCode: true },
    }),
  ])
  const knownSet = new Set(knownCustomers.map((c) => c.protheusCode))
  const unknown = salesCustomers.filter((s) => !knownSet.has(s.customerCode))
  const unknownSalesCount = unknown.reduce((sum, u) => sum + u._count.customerCode, 0)

  // ─── Geocodificação (E15-F1): pinos por precisão, falhas, sem posição ───
  // Interseção com clientes ativos: linhas órfãs (cliente inativado/apagado)
  // não contam; falha só conta quando o cliente ficou de fato sem coordenada
  const [geoCustomers, geoRows] = await Promise.all([
    prisma.customer.findMany({
      where: { companyId, active: true, protheusCode: { not: null } },
      select: { protheusCode: true, loja: true },
    }),
    prisma.geoAddress.findMany({
      where: { companyId },
      select: { customerCode: true, loja: true, precision: true, lat: true, error: true },
    }),
  ])
  const activeGeoKeys = new Set(geoCustomers.map((c) => `${c.protheusCode}|${c.loja ?? '01'}`))
  const byPrecision: Partial<Record<GeoPrecision, number>> = {}
  let geoFailed = 0
  for (const row of geoRows) {
    if (!activeGeoKeys.has(`${row.customerCode}|${row.loja}`)) continue
    if (row.lat !== null && row.precision) {
      const precision = row.precision as GeoPrecision
      byPrecision[precision] = (byPrecision[precision] ?? 0) + 1
    } else if (row.error) {
      geoFailed++
    }
  }
  const mappable =
    (byPrecision.ROOFTOP ?? 0) + (byPrecision.STREET ?? 0) + (byPrecision.CEP ?? 0)

  // ─── Frescor por job + execuções recentes (7 dias) ───
  const recentRuns = await prisma.intelJobRun.findMany({
    where: { companyId, startedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
    orderBy: { startedAt: 'desc' },
    take: 50,
  })
  const freshness = computeFreshness(recentRuns)

  // ─── Uso de LLM no mês (custo) ───
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const llm = await prisma.intelLlmCache.aggregate({
    where: { companyId, createdAt: { gte: monthStart } },
    _sum: { inputTokens: true, outputTokens: true },
    _count: { id: true },
  })

  const pctCity = customersTotal === 0 ? 100 : Math.round(((customersTotal - customersNoCity) / customersTotal) * 100)
  const pctVendor = salesTotal === 0 ? 100 : Math.round(((salesTotal - salesNoVendor) / salesTotal) * 100)
  const pctKnown = salesTotal === 0 ? 100 : Math.round(((salesTotal - unknownSalesCount) / salesTotal) * 100)

  const fixes: ProtheusFixItem[] = [
    ...noCityRows.map((c) => ({
      type: 'cliente_sem_cidade' as const,
      code: c.protheusCode ?? '',
      detail: c.name,
    })),
    ...noVendorRows.map((s) => ({
      type: 'venda_sem_vendedor' as const,
      code: s.orderRef,
      detail: 'pedido sem A1_VEND/vendedor_cod',
    })),
    ...unknown.slice(0, SAMPLE).map((u) => ({
      type: 'venda_cliente_desconhecido' as const,
      code: u.customerCode,
      detail: `${u._count.customerCode} item(ns) de venda`,
    })),
  ]

  return {
    healthyPct: computeHealthyPct([pctCity, pctVendor, pctKnown]),
    freshness,
    nextSyncAt: company.intelligenceEnabled ? nextNightlyAt(now, config.syncHour).toISOString() : null,
    customersWithoutCity: {
      count: customersNoCity,
      pct: customersTotal === 0 ? 0 : Math.round((customersNoCity / customersTotal) * 100),
      codes: noCityRows.map((c) => c.protheusCode ?? '').filter(Boolean),
    },
    salesWithoutVendor: {
      count: salesNoVendor,
      pct: salesTotal === 0 ? 0 : Math.round((salesNoVendor / salesTotal) * 100),
      refs: noVendorRows.map((s) => s.orderRef),
    },
    salesWithUnknownCustomer: {
      count: unknownSalesCount,
      refs: unknown.slice(0, SAMPLE).map((u) => u.customerCode),
    },
    recentRuns: recentRuns.slice(0, 20).map((run) => ({
      id: run.id,
      job: run.job as IntelJob,
      status: run.status as IntelJobRunStatus,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      error: run.error,
      // Sem isso o admin vê "3 passo(s) falharam" e não descobre quais
      steps: parseRunSteps(run.metadata),
    })),
    geocoding: {
      byPrecision,
      failed: geoFailed,
      withoutPin: Math.max(0, customersTotal - mappable),
    },
    llmUsageMonth: {
      inputTokens: llm._sum.inputTokens ?? 0,
      outputTokens: llm._sum.outputTokens ?? 0,
      calls: llm._count.id,
    },
    fixes,
    config,
  }
}

export function fixesToCsv(fixes: ProtheusFixItem[]): string {
  const header = 'tipo;codigo;detalhe'
  const lines = fixes.map(
    (f) => `${f.type};${f.code.replace(/;/g, ',')};${f.detail.replace(/;/g, ',')}`
  )
  return [header, ...lines].join('\n')
}
