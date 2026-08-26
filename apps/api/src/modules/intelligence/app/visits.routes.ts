// Visitas do vendedor (E7, D10): check-in idempotente por clientId gerado no
// app (offline-first). Prefixo /intel/app
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import { authenticate } from '../../../middleware/authenticate'
import { requireCompany } from '../../../middleware/require-company'
import { requireVendorCode } from '../../../middleware/require-vendor-code'

const visitSchema = z.object({
  clientId: z.string().uuid(),
  planItemId: z.string().uuid().nullish(),
  customerCode: z.string().min(1).max(20),
  loja: z.string().min(1).max(10),
  arrivedAt: z.string().datetime(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  accuracyM: z.number().int().min(0).max(100_000).nullish(),
  result: z.enum(['ORDER', 'NO_ORDER', 'NOT_FOUND', 'RESCHEDULED']).nullish(),
  noOrderReason: z.string().max(200).nullish(),
  orderId: z.string().uuid().nullish(),
  notes: z.string().max(1000).nullish(),
  createdOfflineAt: z.string().datetime().nullish(),
})

const patchSchema = z.object({
  leftAt: z.string().datetime().nullish(),
  result: z.enum(['ORDER', 'NO_ORDER', 'NOT_FOUND', 'RESCHEDULED']).nullish(),
  noOrderReason: z.string().max(200).nullish(),
  orderId: z.string().uuid().nullish(),
  notes: z.string().max(1000).nullish(),
})

// Primeiro check-in do dia: o plano deixa de ser GENERATED. O motor só
// recria planos GENERATED — sem esta promoção, um "Rodar sync agora" no meio
// do dia apagava o plano em andamento (ids novos, visitas com planItemId
// órfão, "Visitado" e pinos do mapa perdidos).
async function markPlanInProgress(planId: string | null): Promise<void> {
  if (!planId) return
  await prisma.visitPlan.updateMany({
    where: { id: planId, status: 'GENERATED' },
    data: { status: 'IN_PROGRESS' },
  })
}

export default async function visitsRoutes(app: FastifyInstance) {
  const guard = [authenticate, requireCompany, requireVendorCode]

  // Pedido citado na visita precisa ser do próprio usuário (padrão de posse)
  async function assertOwnOrder(
    orderId: string,
    companyId: string,
    userId: string
  ): Promise<boolean> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, companyId, userId },
      select: { id: true },
    })
    return Boolean(order)
  }

  // POST /intel/app/visits — check-in (upsert por clientId; retry offline seguro)
  app.post('/visits', { preHandler: guard }, async (request, reply) => {
    const body = visitSchema.parse(request.body)
    const companyId = request.user.companyId as string
    const vendorCode = request.vendorCode as string

    if (body.orderId && !(await assertOwnOrder(body.orderId, companyId, request.user.sub))) {
      return reply.status(422).send({ message: 'Pedido informado não pertence a você' })
    }
    let planId: string | null = null
    if (body.planItemId) {
      const item = await prisma.visitPlanItem.findFirst({
        where: { id: body.planItemId, plan: { companyId, vendorCode } },
        select: { id: true, planId: true },
      })
      if (!item) {
        return reply.status(422).send({ message: 'Item de plano não pertence ao seu plano' })
      }
      planId = item.planId
    }

    const existing = await prisma.visit.findUnique({
      where: { companyId_clientId: { companyId, clientId: body.clientId } },
    })
    if (existing && existing.vendorCode !== vendorCode) {
      // clientId é uuid do app; colisão entre vendedores = conflito real
      return reply.status(409).send({ message: 'Visita já registrada por outro vendedor' })
    }

    const data = {
      planItemId: body.planItemId ?? null,
      customerCode: body.customerCode,
      loja: body.loja,
      arrivedAt: new Date(body.arrivedAt),
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      accuracyM: body.accuracyM ?? null,
      result: body.result ?? null,
      noOrderReason: body.noOrderReason ?? null,
      orderId: body.orderId ?? null,
      notes: body.notes ?? null,
      createdOfflineAt: body.createdOfflineAt ? new Date(body.createdOfflineAt) : null,
    }

    if (existing) {
      await prisma.visit.update({ where: { id: existing.id }, data })
      await markPlanInProgress(planId)
      return reply.send({ id: existing.id, clientId: body.clientId, updated: true })
    }

    const visit = await prisma.visit.create({
      data: { ...data, companyId, vendorCode, clientId: body.clientId },
    })
    await markPlanInProgress(planId)
    return reply.status(201).send({ id: visit.id, clientId: body.clientId, updated: false })
  })

  // PATCH /intel/app/visits/:clientId — fecha a visita (resultado/saída)
  app.patch('/visits/:clientId', { preHandler: guard }, async (request, reply) => {
    const clientId = z.string().uuid().parse((request.params as { clientId: string }).clientId)
    const body = patchSchema.parse(request.body)
    const companyId = request.user.companyId as string
    const vendorCode = request.vendorCode as string

    const visit = await prisma.visit.findFirst({ where: { companyId, clientId, vendorCode } })
    if (!visit) return reply.status(404).send({ message: 'Visita não encontrada' })

    if (body.orderId && !(await assertOwnOrder(body.orderId, companyId, request.user.sub))) {
      return reply.status(422).send({ message: 'Pedido informado não pertence a você' })
    }

    await prisma.visit.update({
      where: { id: visit.id },
      data: {
        ...(body.leftAt === undefined ? {} : { leftAt: body.leftAt ? new Date(body.leftAt) : null }),
        ...(body.result === undefined ? {} : { result: body.result }),
        ...(body.noOrderReason === undefined ? {} : { noOrderReason: body.noOrderReason }),
        ...(body.orderId === undefined ? {} : { orderId: body.orderId }),
        ...(body.notes === undefined ? {} : { notes: body.notes }),
      },
    })
    return reply.send({ ok: true })
  })
}
