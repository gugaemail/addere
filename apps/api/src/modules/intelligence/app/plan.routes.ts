// Rotas do plano/home do vendedor (E7) — prefixo /intel/app
// Posse: TODA consulta filtra por {companyId, vendorCode} (padrão orders.service).
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import { authenticate } from '../../../middleware/authenticate'
import { requireCompany } from '../../../middleware/require-company'
import { requireVendorCode } from '../../../middleware/require-vendor-code'
import { applyPlanOps } from './plan-ops'
import { buildPlanDto, getFreshness, getPlanForDate, persistPlanEdit, todayPlanDate } from './plan.service'

const planQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  kind: z.enum(['day']).default('day'),
})

const opSchema = z.discriminatedUnion('type', [
  z.object({ opId: z.string().min(1).max(64), type: z.literal('reorder'), itemId: z.string().uuid(), position: z.number().int().min(1).max(100) }),
  z.object({ opId: z.string().min(1).max(64), type: z.literal('remove'), itemId: z.string().uuid() }),
  z.object({ opId: z.string().min(1).max(64), type: z.literal('restore'), itemId: z.string().uuid() }),
  z.object({ opId: z.string().min(1).max(64), type: z.literal('skip'), itemId: z.string().uuid() }),
  z.object({ opId: z.string().min(1).max(64), type: z.literal('setGrouping'), grouping: z.string().min(1).max(80) }),
])
const patchSchema = z.object({ ops: z.array(opSchema).min(1).max(50) })

export default async function planRoutes(app: FastifyInstance) {
  const guard = [authenticate, requireCompany, requireVendorCode]

  // GET /intel/app/home — resumo para a primeira tela
  app.get('/home', { preHandler: guard }, async (request, reply) => {
    const companyId = request.user.companyId as string
    const vendorCode = request.vendorCode as string

    const plan = await getPlanForDate(companyId, vendorCode, todayPlanDate())
    const activeItems = plan?.items.filter((i) => !i.removedAt) ?? []

    const portfolio = await prisma.customer.findMany({
      where: { companyId, vendorCode, active: true, protheusCode: { not: null } },
      select: { protheusCode: true, loja: true },
    })
    const signals = await prisma.customerSignal.findMany({
      where: { companyId, customerCode: { in: portfolio.map((c) => c.protheusCode as string) } },
      select: { customerCode: true, loja: true, status: true },
    })
    const keys = new Set(portfolio.map((c) => `${c.protheusCode}|${c.loja ?? '01'}`))
    const byStatus: Record<string, number> = {}
    for (const signal of signals) {
      if (!keys.has(`${signal.customerCode}|${signal.loja}`)) continue
      byStatus[signal.status] = (byStatus[signal.status] ?? 0) + 1
    }

    return reply.send({
      llmSummary: plan?.llmSummary ?? null,
      plan: plan
        ? {
            id: plan.id,
            grouping: plan.grouping,
            itemsCount: activeItems.length,
            firstStop: activeItems[0]?.customerCode ?? null,
            status: plan.status,
          }
        : null,
      portfolio: { total: portfolio.length, byStatus },
      freshness: await getFreshness(companyId),
    })
  })

  // GET /intel/app/plan?date=&kind=day — plano completo do dia
  app.get('/plan', { preHandler: guard }, async (request, reply) => {
    const query = planQuerySchema.parse(request.query)
    const companyId = request.user.companyId as string
    const vendorCode = request.vendorCode as string

    const date = query.date
      ? new Date(`${query.date}T00:00:00Z`)
      : todayPlanDate()
    const plan = await getPlanForDate(companyId, vendorCode, date)
    if (!plan) {
      return reply.status(404).send({ message: 'Sem plano para este dia — aguarde o próximo sync' })
    }
    return reply.send(await buildPlanDto(plan, companyId))
  })

  // PATCH /intel/app/plans/:id/items — edição do vendedor (editar é sinal)
  app.patch('/plans/:id/items', { preHandler: guard }, async (request, reply) => {
    const planId = z.string().uuid().parse((request.params as { id: string }).id)
    const body = patchSchema.parse(request.body)
    const companyId = request.user.companyId as string
    const vendorCode = request.vendorCode as string

    const plan = await prisma.visitPlan.findFirst({
      where: { id: planId, companyId },
      include: { items: { orderBy: { position: 'asc' } } },
    })
    if (!plan) return reply.status(404).send({ message: 'Plano não encontrado' })
    // Posse explícita: plano de outro vendedor → 403 (spec E7)
    if (plan.vendorCode !== vendorCode) {
      return reply.status(403).send({ message: 'Este plano não é seu' })
    }

    const result = applyPlanOps(
      {
        grouping: plan.grouping,
        items: plan.items.map((i) => ({ id: i.id, position: i.position, removed: i.removedAt !== null })),
      },
      body.ops
    )
    await persistPlanEdit(plan.id, result.state.grouping, result.state.items, result.edited)

    const updated = await getPlanForDate(companyId, vendorCode, plan.date)
    return reply.send({
      applied: result.applied,
      ignored: result.ignored,
      plan: updated ? await buildPlanDto(updated, companyId) : null,
    })
  })
}
