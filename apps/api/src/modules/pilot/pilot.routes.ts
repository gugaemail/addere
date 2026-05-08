import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@addere/db'
import { authenticate, requireSuperAdmin } from '../../middleware/authenticate'

// ─── Schemas ─────────────────────────────────────────────────────────────────

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

const createPilotSchema = z.object({
  clientName: z.string().min(1).max(200),
  companyId: z.string().uuid(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
})

const updatePilotStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']),
})

// ─── Routes ──────────────────────────────────────────────────────────────────

export async function pilotRoutes(app: FastifyInstance) {
  // Recebimento de eventos do app mobile (autenticado por JWT do rep)
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

  // Feedback pós-sync do app mobile
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

  // ── Admin: CRUD de pilotos (SUPERADMIN) ──────────────────────────────────

  // Listar todos os pilotos
  app.get('/admin/pilots', {
    preHandler: requireSuperAdmin,
  }, async (_request, reply) => {
    const pilots = await prisma.pilot.findMany({
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
        _count: { select: { events: true, feedbacks: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return reply.send(pilots)
  })

  // Buscar piloto por ID
  app.get('/admin/pilots/:id', {
    preHandler: requireSuperAdmin,
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const pilot = await prisma.pilot.findUnique({
      where: { id },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
        _count: { select: { events: true, feedbacks: true } },
      },
    })
    if (!pilot) return reply.status(404).send({ message: 'Piloto não encontrado' })
    return reply.send(pilot)
  })

  // Criar novo piloto
  app.post('/admin/pilots', {
    preHandler: requireSuperAdmin,
  }, async (request, reply) => {
    const parsed = createPilotSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: parsed.error.issues })
    }

    const company = await prisma.company.findUnique({
      where: { id: parsed.data.companyId },
      select: { id: true, name: true },
    })
    if (!company) {
      return reply.status(404).send({ message: 'Empresa não encontrada' })
    }

    // Verificar se já existe piloto ativo para essa empresa
    const existing = await prisma.pilot.findFirst({
      where: { companyId: parsed.data.companyId, status: 'ACTIVE' },
    })
    if (existing) {
      return reply.status(409).send({
        message: `Empresa já possui um piloto ativo (${existing.clientName}). Encerre-o antes de criar um novo.`,
        existingPilotId: existing.id,
      })
    }

    const pilot = await prisma.pilot.create({
      data: {
        clientName: parsed.data.clientName,
        companyId: parsed.data.companyId,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        status: 'ACTIVE',
      },
      include: {
        company: { select: { id: true, name: true } },
      },
    })

    return reply.status(201).send(pilot)
  })

  // Atualizar status do piloto
  app.patch('/admin/pilots/:id/status', {
    preHandler: requireSuperAdmin,
  }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = updatePilotStatusSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Dados inválidos', errors: parsed.error.issues })
    }

    const pilot = await prisma.pilot.update({
      where: { id },
      data: { status: parsed.data.status },
    })

    return reply.send(pilot)
  })
}
