// "Onde estou perdendo" (E21, W2): carrega as vendas do período e da base,
// decompõe (puro em engine/decomposition.ts) e monta o DTO com nomes, status,
// vendedor e o texto do agente (cache diário por recorte).
import { prisma } from '@addere/db'
import type { CustomerStatus, LossesReportDto } from '@addere/types'
import { generateWithGuardrails } from '../agent/agent.service'
import { Pseudonymizer } from '../agent/pseudonymizer'
import { buildTenantContext, systemBlocks } from '../agent/tenant-context'
import { buildLossesPrompt, LOSSES_SCHEMA, type LossesFacts, type LossesOutput } from '../agent/prompts/losses'
import { decomposeLosses } from '../engine/decomposition'
import { getFreshness, todayPlanDate } from '../app/plan.service'
import { addDays, ymdToUtcDate } from './range'
import { sellerScopeWhere, type TeamScope } from './manager.service'

const MAX_CUSTOMERS = 20
const MAX_PRODUCTS = 10
const FACT_CUSTOMERS = 8

export interface LossesQuery {
  anchorYmd: string // dia final do período atual (YYYYMMDD)
  baselineMonths: number
  vendorCode: string | null
}

/** Janelas do período atual (1º do mês → âncora) e da base (N meses fechados antes). Puro. */
export function lossWindows(anchorYmd: string, baselineMonths: number) {
  const year = Number(anchorYmd.slice(0, 4))
  const month = Number(anchorYmd.slice(4, 6))
  const currentFrom = `${anchorYmd.slice(0, 6)}01`
  const currentTo = anchorYmd

  const totalMonths = year * 12 + (month - 1) - baselineMonths
  const baseYear = Math.floor(totalMonths / 12)
  const baseMonth = (totalMonths % 12) + 1
  const baselineFrom = `${baseYear}${String(baseMonth).padStart(2, '0')}01`
  const baselineTo = addDays(currentFrom, -1)

  const daysBetween = (a: string, b: string) =>
    Math.round((ymdToUtcDate(b).getTime() - ymdToUtcDate(a).getTime()) / 86_400_000) + 1
  const scale = daysBetween(currentFrom, currentTo) / daysBetween(baselineFrom, baselineTo)
  return { currentFrom, currentTo, baselineFrom, baselineTo, scale }
}

export async function buildLossesReport(
  companyId: string,
  scope: TeamScope,
  query: LossesQuery
): Promise<LossesReportDto> {
  const windows = lossWindows(query.anchorYmd, query.baselineMonths)

  // Vendedores do recorte (gerente só vê os dele — mesma regra da Equipe)
  const sellers = await prisma.user.findMany({
    where: {
      companyId,
      active: true,
      idVendProt: { not: null },
      ...sellerScopeWhere(scope),
      ...(query.vendorCode ? { idVendProt: query.vendorCode } : {}),
    },
    select: { idVendProt: true },
  })
  const vendorCodes = sellers.map((s) => s.idVendProt as string)
  const freshness = await getFreshness(companyId)

  const empty: LossesReportDto = {
    period: { fromYmd: windows.currentFrom, toYmd: windows.currentTo, baselineMonths: query.baselineMonths },
    vendorCode: query.vendorCode,
    totals: { baselineAmount: '0.00', currentAmount: '0.00', diffAmount: '0.00', diffPct: null },
    components: [],
    customers: [],
    products: [],
    text: null,
    lastSyncAt: freshness.lastSyncAt,
  }
  if (vendorCodes.length === 0) return empty

  const customers = await prisma.customer.findMany({
    where: { companyId, active: true, protheusCode: { not: null }, vendorCode: { in: vendorCodes } },
    select: { protheusCode: true, loja: true, name: true, vendorCode: true },
  })
  const customerByKey = new Map(customers.map((c) => [`${c.protheusCode}|${c.loja ?? '01'}`, c]))
  if (customerByKey.size === 0) return empty

  const sales = await prisma.salesItem.findMany({
    where: {
      companyId,
      customerCode: { in: customers.map((c) => c.protheusCode as string) },
      date: { gte: ymdToUtcDate(windows.baselineFrom), lte: ymdToUtcDate(windows.currentTo) },
    },
    select: { customerCode: true, loja: true, productCode: true, productDesc: true, date: true, amount: true },
  })

  const result = decomposeLosses({
    sales: sales
      .filter((s) => customerByKey.has(`${s.customerCode}|${s.loja}`))
      .map((s) => ({
        customerKey: `${s.customerCode}|${s.loja}`,
        productCode: s.productCode,
        productDesc: s.productDesc,
        ymd: s.date.toISOString().slice(0, 10).replace(/-/g, ''),
        amount: Number(s.amount),
      })),
    currentFromYmd: windows.currentFrom,
    currentToYmd: windows.currentTo,
    baselineFromYmd: windows.baselineFrom,
    baselineToYmd: windows.baselineTo,
    scale: windows.scale,
    maxCustomers: MAX_CUSTOMERS,
    maxProducts: MAX_PRODUCTS,
  })

  const lossKeys = result.customers.map((c) => c.customerKey)
  const [signals, todayItems] = await Promise.all([
    prisma.customerSignal.findMany({
      where: { companyId, customerCode: { in: lossKeys.map((k) => k.split('|')[0]) } },
      select: { customerCode: true, loja: true, status: true },
    }),
    prisma.visitPlanItem.findMany({
      where: {
        removedAt: null,
        customerCode: { in: lossKeys.map((k) => k.split('|')[0]) },
        plan: { companyId, kind: 'DAY', date: todayPlanDate(), vendorCode: { in: vendorCodes } },
      },
      select: { customerCode: true, loja: true },
    }),
  ])
  const statusByKey = new Map(signals.map((s) => [`${s.customerCode}|${s.loja}`, s.status]))
  const inPlan = new Set(todayItems.map((i) => `${i.customerCode}|${i.loja}`))

  const dto: LossesReportDto = {
    period: { fromYmd: windows.currentFrom, toYmd: windows.currentTo, baselineMonths: query.baselineMonths },
    vendorCode: query.vendorCode,
    totals: {
      baselineAmount: result.totals.baselineAmount.toFixed(2),
      currentAmount: result.totals.currentAmount.toFixed(2),
      diffAmount: result.totals.diffAmount.toFixed(2),
      diffPct: result.totals.diffPct,
    },
    components: result.components.map((c) => ({ kind: c.kind, amount: c.amount.toFixed(2), count: c.count })),
    customers: result.customers.map((c) => {
      const [code, loja] = c.customerKey.split('|')
      const customer = customerByKey.get(c.customerKey)
      return {
        customerCode: code,
        loja,
        customerName: customer?.name ?? code,
        vendorCode: customer?.vendorCode ?? null,
        status: (statusByKey.get(c.customerKey) ?? null) as CustomerStatus | null,
        baselineAmount: c.baselineAmount.toFixed(2),
        currentAmount: c.currentAmount.toFixed(2),
        diffAmount: c.diffAmount.toFixed(2),
        reason: c.reason,
        inPlanToday: inPlan.has(c.customerKey),
      }
    }),
    products: result.products.map((p) => ({
      productCode: p.productCode,
      productDesc: p.productDesc,
      baselineAmount: p.baselineAmount.toFixed(2),
      currentAmount: p.currentAmount.toFixed(2),
      diffPct: p.diffPct,
    })),
    text: null,
    lastSyncAt: freshness.lastSyncAt,
  }
  dto.text = await lossesText(companyId, query, dto, statusByKey)
  return dto
}

/** Texto do agente (cache diário por recorte); null sem LLM ou reprovado no self-check. */
async function lossesText(
  companyId: string,
  query: LossesQuery,
  dto: LossesReportDto,
  statusByKey: Map<string, CustomerStatus>
): Promise<string | null> {
  if (dto.customers.length === 0) return null
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) return null

  const pseudonymizer = new Pseudonymizer()
  const nameByKey = new Map<string, string>()
  const losers = dto.customers.filter((c) => Number(c.diffAmount) < 0).slice(0, FACT_CUSTOMERS)
  const factCustomers = losers.map((c) => {
    const k = `${c.customerCode}|${c.loja}`
    nameByKey.set(k, c.customerName)
    return {
      pseudonym: pseudonymizer.code(k),
      status: statusByKey.get(k) ?? 'ON_CYCLE',
      expectedAmount: c.diffAmount,
      reasons: [c.reason],
    }
  })

  const facts: LossesFacts = {
    date: query.anchorYmd,
    totals: dto.totals,
    components: dto.components.map((c) => ({ status: c.kind, count: c.count, expectedAmount: c.amount })),
    customers: factCustomers,
    products: dto.products.slice(0, 5).map((p) => ({
      productCode: p.productCode,
      productDesc: p.productDesc,
      trendPct: p.diffPct,
    })),
    freshness: { lastSyncAt: null },
  }
  const numbers = [
    Number(dto.totals.baselineAmount),
    Number(dto.totals.currentAmount),
    Math.abs(Number(dto.totals.diffAmount)),
    dto.totals.diffPct === null ? null : Math.abs(dto.totals.diffPct),
    ...dto.components.flatMap((c) => [c.count, Math.abs(Number(c.amount))]),
    ...losers.flatMap((c) => [Number(c.baselineAmount), Number(c.currentAmount), Math.abs(Number(c.diffAmount))]),
    ...dto.products.slice(0, 5).map((p) => (p.diffPct === null ? null : Math.abs(p.diffPct))),
    // Percentuais e valores dentro das frases de motivo ("Comprou 50% a menos…")
    ...losers.flatMap((c) => (c.reason.match(/\d+/g) ?? []).map(Number)),
  ].filter((n): n is number => n !== null && Number.isFinite(n))

  const result = await generateWithGuardrails<LossesOutput>({
    companyId,
    kind: 'losses',
    vendorCode: query.vendorCode ?? '*',
    targetKey: `${query.anchorYmd}:${query.baselineMonths}`,
    system: systemBlocks(await buildTenantContext(company)),
    userPrompt: buildLossesPrompt(facts),
    schema: LOSSES_SCHEMA as unknown as Record<string, unknown>,
    factsPayload: facts,
    selfCheckFacts: {
      customers: factCustomers.map((c) => ({ pseudonym: c.pseudonym, status: c.status })),
      numbers,
      freshnessLine: null,
    },
    extractText: (data) => data.text,
  })
  return result.data ? pseudonymizer.rehydrate(result.data.text, nameByKey) : null
}
