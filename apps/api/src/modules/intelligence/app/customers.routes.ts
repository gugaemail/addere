// Sinais da carteira + briefing "antes de entrar" (E7) — prefixo /intel/app
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import type { BriefingDto, SignalsSnapshot } from '@addere/types'
import { authenticate } from '../../../middleware/authenticate'
import { requireCompany } from '../../../middleware/require-company'
import { requireVendorCode } from '../../../middleware/require-vendor-code'
import { userRateLimit } from '../../../lib/rate-limit'
import { generateWithGuardrails } from '../agent/agent.service'
import { buildCustomerFacts } from '../agent/facts'
import { Pseudonymizer } from '../agent/pseudonymizer'
import { buildTenantContext, systemBlocks } from '../agent/tenant-context'
import { buildBriefingPrompt, BRIEFING_SCHEMA, type BriefingOutput } from '../agent/prompts/briefing'
import { getFreshness } from './plan.service'

const signalsQuerySchema = z.object({
  status: z.enum(['NEW', 'ON_CYCLE', 'LATE', 'AT_RISK', 'INACTIVE', 'BLOCKED']).optional(),
})

const briefingParamsSchema = z.object({
  code: z.string().min(1).max(20),
  loja: z.string().min(1).max(10),
})

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
  }
}

export default async function customersRoutes(app: FastifyInstance) {
  const guard = [authenticate, requireCompany, requireVendorCode]

  // GET /intel/app/customers/signals?status= — "Quem está esfriando?"
  app.get('/customers/signals', { preHandler: guard }, async (request, reply) => {
    const query = signalsQuerySchema.parse(request.query)
    const companyId = request.user.companyId as string
    const vendorCode = request.vendorCode as string

    const portfolio = await prisma.customer.findMany({
      where: { companyId, vendorCode, active: true, protheusCode: { not: null } },
      select: { protheusCode: true, loja: true, name: true },
    })
    const nameByKey = new Map(portfolio.map((c) => [`${c.protheusCode}|${c.loja ?? '01'}`, c.name]))

    const signals = await prisma.customerSignal.findMany({
      where: {
        companyId,
        customerCode: { in: portfolio.map((c) => c.protheusCode as string) },
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ scoreTotal: 'desc' }, { daysSinceLastPurchase: 'desc' }],
      take: 200,
    })

    const items = signals
      .filter((s) => nameByKey.has(`${s.customerCode}|${s.loja}`))
      .map((s) => ({
        customerCode: s.customerCode,
        loja: s.loja,
        customerName: nameByKey.get(`${s.customerCode}|${s.loja}`) as string,
        status: s.status,
        daysSinceLastPurchase: s.daysSinceLastPurchase,
        avgTicket: s.avgTicket?.toString() ?? null,
        reason: ((s.reasons ?? []) as string[])[0] ?? null,
      }))

    return reply.send({ items, freshness: await getFreshness(companyId) })
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
