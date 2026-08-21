// Relatório de saúde dos dados da Inteligência (E4, tela W4).
import { prisma } from '@addere/db'
import type { Company } from '@prisma/client'
import type { HealthReport, IntelJob, IntelJobRunStatus, IntelligenceConfig } from '@addere/types'
import { mergeIntelligenceConfig } from './config.routes'

const SAMPLE = 20
const TRACKED_JOBS: IntelJob[] = ['NIGHTLY', 'REFRESH', 'SYNC', 'GOALS', 'PURGE']

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

  // ─── Frescor por job + execuções recentes (7 dias) ───
  const recentRuns = await prisma.intelJobRun.findMany({
    where: { companyId, startedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
    orderBy: { startedAt: 'desc' },
    take: 50,
  })
  const latestByJob = new Map<string, (typeof recentRuns)[number]>()
  for (const run of recentRuns) {
    if (!latestByJob.has(run.job)) latestByJob.set(run.job, run)
  }
  const freshness = TRACKED_JOBS.map((job) => {
    const run = latestByJob.get(job)
    return {
      job,
      lastRunAt: run?.startedAt.toISOString() ?? null,
      lastStatus: (run?.status ?? null) as IntelJobRunStatus | null,
    }
  })

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
    })),
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
