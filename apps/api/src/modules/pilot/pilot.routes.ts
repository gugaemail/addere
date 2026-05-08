import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@addere/db'
import { authenticate } from '../../middleware/authenticate'

const pilotEventSchema = z.object({
  events: z.array(z.object({
    type: z.enum([
      'ORDER_STARTED', 'ORDER_COMPLETED', 'ORDER_SYNCED',
      'ORDER_SYNC_FAILED', 'SESSION_STARTED', 'CATALOG_LOADED',
    ]),
    metadata: z.record(z.unknown()).optional(),
    occurredAt: z.string().datetime(),
  })).min(1).max(100),
})

const pilotFeedbackSchema = z.object({
  orderId: z.string().optional(),
  rating: z.enum(['positive', 'negative']),
  comment: z.string().max(1000).optional(),
})

export async function pilotRoutes(app: FastifyInstance) {
  app.post('/pilot/events', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { sub: repId, companyId } = request.user

    if (!companyId) {
      return reply.status(400).send({ message: 'Usuário sem empresa associada' })
    }

    const parsed = pilotEventSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: parsed.error.issues })
    }

    const pilot = await prisma.pilot.findFirst({
      where: { companyId, status: 'ACTIVE' },
      select: { id: true },
    })

    if (!pilot) {
      // Sem piloto ativo — ignorar silenciosamente para não quebrar o app
      return reply.status(204).send()
    }

    await prisma.pilotEvent.createMany({
      data: parsed.data.events.map((e) => ({
        pilotId: pilot.id,
        repId,
        eventType: e.type,
        metadata: (e.metadata ?? {}) as Prisma.InputJsonObject,
        occurredAt: new Date(e.occurredAt),
      })),
    })

    return reply.status(204).send()
  })

  app.post('/pilot/feedback', {
    preHandler: authenticate,
  }, async (request, reply) => {
    const { sub: repId, companyId } = request.user

    if (!companyId) {
      return reply.status(400).send({ message: 'Usuário sem empresa associada' })
    }

    const parsed = pilotFeedbackSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: parsed.error.issues })
    }

    const pilot = await prisma.pilot.findFirst({
      where: { companyId, status: 'ACTIVE' },
      select: { id: true },
    })

    if (!pilot) {
      return reply.status(204).send()
    }

    await prisma.pilotFeedback.create({
      data: {
        pilotId: pilot.id,
        repId,
        orderId: parsed.data.orderId,
        rating: parsed.data.rating,
        comment: parsed.data.comment,
      },
    })

    return reply.status(204).send()
  })
}
