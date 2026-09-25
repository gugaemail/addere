// Feedback 👍/👎 do vendedor (E7) — alimenta a calibração (fase 3). /intel/app
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import { authenticate } from '../../../middleware/authenticate'
import { requireCompany } from '../../../middleware/require-company'
import { requireVendorCode } from '../../../middleware/require-vendor-code'

const feedbackSchema = z.object({
  targetType: z.enum(['PLAN', 'ITEM', 'MESSAGE', 'ANSWER']),
  targetId: z.string().min(1).max(64),
  rating: z.union([z.literal(1), z.literal(-1)]),
  comment: z.string().max(500).nullish(),
})

export default async function feedbackRoutes(app: FastifyInstance) {
  const guard = [authenticate, requireCompany, requireVendorCode]

  app.post('/feedback', { preHandler: guard }, async (request, reply) => {
    const body = feedbackSchema.parse(request.body)
    const companyId = request.user.companyId as string
    const vendorCode = request.vendorCode as string

    // Posse do alvo por tipo — nunca aceitar id de outro vendedor/tenant
    let owned = false
    switch (body.targetType) {
      case 'PLAN':
        owned = Boolean(
          await prisma.visitPlan.findFirst({
            where: { id: body.targetId, companyId, vendorCode },
            select: { id: true },
          })
        )
        break
      case 'ITEM':
        owned = Boolean(
          await prisma.visitPlanItem.findFirst({
            where: { id: body.targetId, plan: { companyId, vendorCode } },
            select: { id: true },
          })
        )
        break
      case 'MESSAGE':
        owned = Boolean(
          await prisma.customerMessage.findFirst({
            where: { id: body.targetId, companyId, vendorCode },
            select: { id: true },
          })
        )
        break
      case 'ANSWER':
        // Resposta do agente não persiste com id próprio — targetId é a chave
        // do cache (kind:targetKey); registra direto com a posse do vendedor
        owned = true
        break
    }
    if (!owned) return reply.status(404).send({ message: 'Alvo do feedback não encontrado' })

    const feedback = await prisma.intelFeedback.create({
      data: {
        companyId,
        vendorCode,
        targetType: body.targetType,
        targetId: body.targetId,
        rating: body.rating,
        comment: body.comment ?? null,
      },
    })
    return reply.status(201).send({ id: feedback.id })
  })
}
