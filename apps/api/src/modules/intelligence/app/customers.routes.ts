// Sinais da carteira + briefing "antes de entrar" (E7) — prefixo /intel/app
// Fase 2: carteira com RFM/cross-sell e texto do agente (E19) e janelas de
// atendimento do cliente (E16).
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import type {
  BriefingDto,
  CustomerSignalListItem,
  CustomerStatus,
  CustomerWindowDto,
  PortfolioDto,
  RfmSegment,
  SignalsSnapshot,
} from '@addere/types'
import { authenticate } from '../../../middleware/authenticate'
import { requireCompany } from '../../../middleware/require-company'
import { requireVendorCode } from '../../../middleware/require-vendor-code'
import { userRateLimit } from '../../../lib/rate-limit'
import { generateWithGuardrails } from '../agent/agent.service'
import { buildCustomerFacts, type GoalFacts } from '../agent/facts'
import { Pseudonymizer } from '../agent/pseudonymizer'
import { buildTenantContext, systemBlocks } from '../agent/tenant-context'
import { buildBriefingPrompt, BRIEFING_SCHEMA, type BriefingOutput } from '../agent/prompts/briefing'
import {
  buildPortfolioPrompt,
  PORTFOLIO_SCHEMA,
  type PortfolioFacts,
  type PortfolioOutput,
} from '../agent/prompts/portfolio'
import { ymdSaoPaulo } from '../engine/business-days'
import { clockToMinutes } from '../engine/routing'
import { getFreshness } from './plan.service'

const signalsQuerySchema = z.object({
  status: z.enum(['NEW', 'ON_CYCLE', 'LATE', 'AT_RISK', 'INACTIVE', 'BLOCKED']).optional(),
})

const briefingParamsSchema = z.object({
  code: z.string().min(1).max(20),
  loja: z.string().min(1).max(10),
})

const clock = z.string().regex(/^\d{2}:\d{2}$/, 'horário no formato HH:MM')
const windowsBodySchema = z.object({
  windows: z
    .array(
      z
        .object({
          weekday: z.number().int().min(0).max(6),
          startTime: clock,
          endTime: clock,
        })
        .strict()
    )
    .max(14),
})

const PORTFOLIO_FACT_CUSTOMERS = 12

/** Snapshot a partir da linha de CustomerSignal + títulos (mesma forma do plano). */
async function loadSnapshot(
  companyId: string,
  code: string,
  loja: string
): Promise<SignalsSnapshot | null> {
  const signal = await prisma.customerSignal.findUnique({
    where: { companyId_customerCode_loja: { companyId, customerCode: code, loja } },
  })
  if (!signal) return null
  const titles = await prisma.openTitle.findMany({
    where: { companyId, customerCode: code, loja },
    select: { balance: true, daysOverdue: true },
  })
  return {
    status: signal.status,
    confidence: signal.confidence,
    cycleDays: signal.cycleDays,
    daysSinceLastPurchase: signal.daysSinceLastPurchase,
    orders12m: signal.orders12m,
    avgTicket: signal.avgTicket?.toString() ?? null,
    trendPct: signal.trendPct === null ? null : Number(signal.trendPct),
    usualMix: (signal.usualMix ?? []) as SignalsSnapshot['usualMix'],
    cutMix: (signal.cutMix ?? []) as SignalsSnapshot['cutMix'],
    openTitles: {
      count: titles.length,
      totalBalance: titles.reduce((sum, t) => sum + Number(t.balance), 0).toFixed(2),
      maxDaysOverdue: titles.reduce<number | null>(
        (max, t) => (t.daysOverdue === null ? max : Math.max(max ?? 0, t.daysOverdue)),
        null
      ),
    },
    reasons: (signal.reasons ?? []) as string[],
    rfmSegment: (signal.rfmSegment ?? null) as RfmSegment | null,
    crossSell: (signal.crossSell ?? []) as SignalsSnapshot['crossSell'],
  }
}

interface PortfolioRow {
  protheusCode: string | null
  loja: string | null
  name: string
  municipio: string | null
}

/** Sinais da carteira do vendedor já no formato da lista (E7/E19). */
async function loadPortfolioItems(
  companyId: string,
  vendorCode: string,
  status?: CustomerStatus
): Promise<{ items: CustomerSignalListItem[]; portfolio: PortfolioRow[] }> {
  const portfolio = await prisma.customer.findMany({
    where: { companyId, vendorCode, active: true, protheusCode: { not: null } },
    select: { protheusCode: true, loja: true, name: true, municipio: true },
  })
  const byKey = new Map(portfolio.map((c) => [`${c.protheusCode}|${c.loja ?? '01'}`, c]))

  const signals = await prisma.customerSignal.findMany({
    where: {
      companyId,
      customerCode: { in: portfolio.map((c) => c.protheusCode as string) },
      ...(status ? { status } : {}),
    },
    orderBy: [{ scoreTotal: 'desc' }, { daysSinceLastPurchase: 'desc' }],
    take: 500,
  })

  const items = signals
    .filter((s) => byKey.has(`${s.customerCode}|${s.loja}`))
    .map((s) => {
      const customer = byKey.get(`${s.customerCode}|${s.loja}`) as PortfolioRow
      const crossSell = (s.crossSell ?? []) as unknown[]
      return {
        customerCode: s.customerCode,
        loja: s.loja,
        customerName: customer.name,
        status: s.status,
        daysSinceLastPurchase: s.daysSinceLastPurchase,
        avgTicket: s.avgTicket?.toString() ?? null,
        reason: ((s.reasons ?? []) as string[])[0] ?? null,
        cycleDays: s.cycleDays,
        orders12m: s.orders12m,
        trendPct: s.trendPct === null ? null : Number(s.trendPct),
        rfmSegment: (s.rfmSegment ?? null) as RfmSegment | null,
        city: customer.municipio,
        crossSellCount: Array.isArray(crossSell) ? crossSell.length : 0,
      }
    })
  return { items, portfolio }
}

export default async function customersRoutes(app: FastifyInstance) {
  const guard = [authenticate, requireCompany, requireVendorCode]

  // GET /intel/app/customers/signals?status= — "Quem está esfriando?"
  app.get('/customers/signals', { preHandler: guard }, async (request, reply) => {
    const query = signalsQuerySchema.parse(request.query)
    const companyId = request.user.companyId as string
    const vendorCode = request.vendorCode as string
    const { items } = await loadPortfolioItems(companyId, vendorCode, query.status)
    return reply.send({ items: items.slice(0, 200), freshness: await getFreshness(companyId) })
  })

  // GET /intel/app/portfolio — Carteira (E19): contagens, RFM, atrasados e texto do agente
  app.get('/portfolio', { preHandler: guard }, async (request, reply) => {
    const companyId = request.user.companyId as string
    const vendorCode = request.vendorCode as string
    const { items, portfolio } = await loadPortfolioItems(companyId, vendorCode)

    const byStatus: Partial<Record<CustomerStatus, number>> = {}
    const byRfm: Partial<Record<RfmSegment, number>> = {}
    for (const item of items) {
      byStatus[item.status] = (byStatus[item.status] ?? 0) + 1
      if (item.rfmSegment) byRfm[item.rfmSegment] = (byRfm[item.rfmSegment] ?? 0) + 1
    }

    // Σ ticket×prob dos atrasados/em risco — o mesmo lateCoverage da meta (§4.2)
    const lateRows = await prisma.customerSignal.findMany({
      where: {
        companyId,
        status: { in: ['LATE', 'AT_RISK'] },
        customerCode: { in: portfolio.map((c) => c.protheusCode as string) },
      },
      select: { customerCode: true, loja: true, avgTicket: true, purchaseProb: true },
    })
    const keys = new Set(portfolio.map((c) => `${c.protheusCode}|${c.loja ?? '01'}`))
    const lateAmount = lateRows
      .filter((s) => keys.has(`${s.customerCode}|${s.loja}`))
      .reduce((sum, s) => sum + Number(s.avgTicket ?? 0) * Number(s.purchaseProb ?? 0), 0)

    const text = await portfolioText(companyId, vendorCode, items, byStatus, byRfm)

    const dto: PortfolioDto = {
      total: portfolio.length,
      byStatus,
      byRfm,
      rfmAvailable: Object.keys(byRfm).length > 0,
      lateAmount: lateAmount.toFixed(2),
      items,
      text,
      freshness: await getFreshness(companyId),
    }
    return reply.send(dto)
  })

  // GET /intel/app/customers/:code/:loja/windows — janelas de atendimento (E16)
  app.get('/customers/:code/:loja/windows', { preHandler: guard }, async (request, reply) => {
    const params = briefingParamsSchema.parse(request.params)
    const companyId = request.user.companyId as string
    const vendorCode = request.vendorCode as string
    if (!(await ownsCustomer(companyId, vendorCode, params.code, params.loja))) {
      return reply.status(404).send({ message: 'Cliente não encontrado' })
    }
    return reply.send({ windows: await loadWindows(companyId, params.code, params.loja) })
  })

  // PUT /intel/app/customers/:code/:loja/windows — substitui as janelas do vendedor
  app.put('/customers/:code/:loja/windows', { preHandler: guard }, async (request, reply) => {
    const params = briefingParamsSchema.parse(request.params)
    const body = windowsBodySchema.parse(request.body)
    const companyId = request.user.companyId as string
    const vendorCode = request.vendorCode as string
    if (!(await ownsCustomer(companyId, vendorCode, params.code, params.loja))) {
      return reply.status(404).send({ message: 'Cliente não encontrado' })
    }
    for (const w of body.windows) {
      const start = clockToMinutes(w.startTime)
      const end = clockToMinutes(w.endTime)
      if (start === null || end === null || end <= start) {
        return reply.status(400).send({ message: 'Janela inválida: o fim precisa ser depois do início' })
      }
    }
    const seen = new Set<number>()
    for (const w of body.windows) {
      if (seen.has(w.weekday)) {
        return reply.status(400).send({ message: 'Só uma janela por dia da semana' })
      }
      seen.add(w.weekday)
    }

    // Replace do que é do vendedor; janela do cadastro/gerente do mesmo dia é
    // sobrescrita (o vendedor conhece o balcão), o resto fica
    await prisma.$transaction([
      prisma.customerWindow.deleteMany({
        where: {
          companyId,
          customerCode: params.code,
          loja: params.loja,
          OR: [{ source: 'SELLER' }, { weekday: { in: body.windows.map((w) => w.weekday) } }],
        },
      }),
      ...body.windows.map((w) =>
        prisma.customerWindow.create({
          data: {
            companyId,
            customerCode: params.code,
            loja: params.loja,
            weekday: w.weekday,
            startTime: w.startTime,
            endTime: w.endTime,
            source: 'SELLER',
            changedBy: request.user.sub,
          },
        })
      ),
    ])
    return reply.send({ windows: await loadWindows(companyId, params.code, params.loja) })
  })

  // GET /intel/app/customers/:code/:loja/briefing — "antes de entrar" (cache 4h)
  app.get(
    '/customers/:code/:loja/briefing',
    { preHandler: [...guard, userRateLimit(20, '1 minute')] },
    async (request, reply) => {
      const params = briefingParamsSchema.parse(request.params)
      const companyId = request.user.companyId as string
      const vendorCode = request.vendorCode as string

      // Posse: o cliente precisa estar na carteira DESTE vendedor
      const customer = await prisma.customer.findFirst({
        where: { companyId, vendorCode, protheusCode: params.code, loja: params.loja, active: true },
        select: { name: true, municipio: true },
      })
      if (!customer) return reply.status(404).send({ message: 'Cliente não encontrado' })

      const snapshot = await loadSnapshot(companyId, params.code, params.loja)
      if (!snapshot) {
        return reply
          .status(404)
          .send({ message: 'Sinais ainda não calculados — aguarde o próximo sync' })
      }

      const pseudonymizer = new Pseudonymizer()
      const facts = buildCustomerFacts(
        { customerCode: params.code, loja: params.loja, city: customer.municipio, snapshot },
        pseudonymizer
      )
      const company = await prisma.company.findUnique({ where: { id: companyId } })
      const system = systemBlocks(company ? await buildTenantContext(company) : '')

      const result = await generateWithGuardrails<BriefingOutput>({
        companyId,
        kind: 'briefing',
        vendorCode,
        targetKey: `${params.code}:${params.loja}`,
        system,
        userPrompt: buildBriefingPrompt({ customers: [facts], freshness: { lastSyncAt: null } }),
        schema: BRIEFING_SCHEMA as unknown as Record<string, unknown>,
        factsPayload: { customers: [facts] },
        selfCheckFacts: {
          customers: [{ pseudonym: facts.pseudonym, status: facts.status }],
          numbers: [
            facts.cycleDays,
            facts.daysSinceLastPurchase,
            facts.orders12m,
            facts.avgTicket === null ? null : Number(facts.avgTicket),
            facts.trendPct === null ? null : Math.abs(facts.trendPct),
            facts.openTitles.count,
            Number(facts.openTitles.totalBalance),
            facts.openTitles.maxDaysOverdue,
            ...(facts.crossSell ?? []).map((p) => p.peersPct),
          ].filter((n): n is number => n !== null && Number.isFinite(n)),
          freshnessLine: null,
        },
        extractText: (data) =>
          `${data.whatHappened}\n${data.whyItMatters}\n${data.whatToDo}\n${data.confidence}`,
      })

      const nameByKey = new Map([[`${params.code}|${params.loja}`, customer.name]])
      const dto: BriefingDto = {
        customerCode: params.code,
        loja: params.loja,
        signals: snapshot,
        text: result.data
          ? pseudonymizer.rehydrate(
              [
                result.data.whatHappened,
                result.data.whyItMatters,
                result.data.whatToDo,
                result.data.confidence,
              ].join('\n'),
              nameByKey
            )
          : null,
        freshness: { lastSyncAt: (await getFreshness(companyId)).lastSyncAt },
      }
      return reply.send(dto)
    }
  )
}

async function ownsCustomer(
  companyId: string,
  vendorCode: string,
  code: string,
  loja: string
): Promise<boolean> {
  const lojaFilter = loja === '01' ? { OR: [{ loja: '01' }, { loja: null }] } : { loja }
  const customer = await prisma.customer.findFirst({
    where: { companyId, vendorCode, protheusCode: code, active: true, ...lojaFilter },
    select: { id: true },
  })
  return !!customer
}

async function loadWindows(companyId: string, code: string, loja: string): Promise<CustomerWindowDto[]> {
  const rows = await prisma.customerWindow.findMany({
    where: { companyId, customerCode: code, loja },
    orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    select: { weekday: true, startTime: true, endTime: true, source: true },
  })
  return rows.map((r) => ({
    weekday: r.weekday,
    startTime: r.startTime,
    endTime: r.endTime,
    source: r.source,
  }))
}

/**
 * Texto do agente para a carteira (E19): cache diário por vendedor; os fatos
 * levam contagens e os 12 clientes que mais pesam (atrasados/risco por ticket).
 * Sem LLM, sem cota ou reprovado no self-check → null (o app mostra só números).
 */
async function portfolioText(
  companyId: string,
  vendorCode: string,
  items: CustomerSignalListItem[],
  byStatus: Partial<Record<CustomerStatus, number>>,
  byRfm: Partial<Record<RfmSegment, number>>
): Promise<string | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) return null
  const today = ymdSaoPaulo(new Date())

  const heavy = [...items]
    .filter((i) => i.status === 'LATE' || i.status === 'AT_RISK' || i.status === 'BLOCKED')
    .sort((a, b) => Number(b.avgTicket ?? 0) - Number(a.avgTicket ?? 0))
    .slice(0, PORTFOLIO_FACT_CUSTOMERS)
  if (heavy.length === 0) return null

  const pseudonymizer = new Pseudonymizer()
  const nameByKey = new Map<string, string>()
  const customers = []
  for (const item of heavy) {
    const snapshot = await loadSnapshot(companyId, item.customerCode, item.loja)
    if (!snapshot) continue
    nameByKey.set(`${item.customerCode}|${item.loja}`, item.customerName)
    customers.push(
      buildCustomerFacts(
        { customerCode: item.customerCode, loja: item.loja, city: item.city, snapshot },
        pseudonymizer
      )
    )
  }

  const goalRow = await prisma.goalSnapshot.findFirst({
    where: { companyId, vendorCode, period: today.slice(0, 6) },
    orderBy: { capturedAt: 'desc' },
    select: { goalAmount: true, soldAmount: true },
  })
  const goal: GoalFacts | null = goalRow
    ? {
        goalAmount: goalRow.goalAmount === null ? null : Number(goalRow.goalAmount).toFixed(2),
        soldAmount: goalRow.soldAmount === null ? null : Number(goalRow.soldAmount).toFixed(2),
        gap:
          goalRow.goalAmount === null
            ? null
            : Math.max(0, Number(goalRow.goalAmount) - Number(goalRow.soldAmount ?? 0)).toFixed(2),
        perBusinessDay: null,
        lateCoverage: null,
      }
    : null

  const facts: PortfolioFacts = {
    date: today,
    goal,
    counts: [
      ...Object.entries(byStatus).map(([status, count]) => ({ status, count: count as number })),
      ...Object.entries(byRfm).map(([status, count]) => ({ status, count: count as number })),
    ],
    customers,
    freshness: { lastSyncAt: null },
  }

  const numbers = [
    ...facts.counts.map((c) => c.count),
    ...(goal ? [goal.goalAmount, goal.soldAmount, goal.gap].map((v) => (v === null ? null : Number(v))) : []),
    ...customers.flatMap((c) => [
      c.cycleDays,
      c.daysSinceLastPurchase,
      c.orders12m,
      c.avgTicket === null ? null : Number(c.avgTicket),
      c.trendPct === null ? null : Math.abs(c.trendPct),
      c.openTitles.count,
      Number(c.openTitles.totalBalance),
      c.openTitles.maxDaysOverdue,
    ]),
  ].filter((n): n is number => n !== null && Number.isFinite(n))

  const result = await generateWithGuardrails<PortfolioOutput>({
    companyId,
    kind: 'portfolio',
    vendorCode,
    targetKey: today,
    system: systemBlocks(await buildTenantContext(company)),
    userPrompt: buildPortfolioPrompt(facts),
    schema: PORTFOLIO_SCHEMA as unknown as Record<string, unknown>,
    factsPayload: facts,
    selfCheckFacts: {
      customers: customers.map((c) => ({ pseudonym: c.pseudonym, status: c.status })),
      numbers,
      freshnessLine: null,
    },
    extractText: (data) => [data.summary, ...data.actions].join('\n'),
  })
  if (!result.data) return null
  return pseudonymizer.rehydrate(
    [result.data.summary, ...result.data.actions.map((a) => `• ${a}`)].join('\n'),
    nameByKey
  )
}
