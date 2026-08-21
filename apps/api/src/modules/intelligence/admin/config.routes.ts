// Rotas admin da configuração da camada por empresa (E3) — prefixo /intel/admin/config
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import { DEFAULT_INTELLIGENCE_CONFIG, type IntelligenceConfig } from '@addere/types'
import { requirePermission } from '../../../middleware/authenticate'
import { resolveTenant } from '../../../middleware/resolve-tenant'

const configPatchSchema = z.object({
  syncHour: z.number().int().min(0).max(23).optional(),
  syncEveryHours: z.number().int().min(1).max(24).optional(),
  defaultTone: z.enum(['informal', 'formal']).optional(),
  retentionDays: z.number().int().min(30).max(3650).optional(),
  lgpdNoticeAcceptedAt: z.string().datetime().nullable().optional(),
})

const putSchema = z.object({
  companyId: z.string().uuid().optional(),
  intelligenceEnabled: z.boolean().optional(),
  config: configPatchSchema.optional(),
})

export function mergeIntelligenceConfig(stored: unknown): IntelligenceConfig {
  const partial = (stored ?? {}) as Partial<IntelligenceConfig>
  return { ...DEFAULT_INTELLIGENCE_CONFIG, ...partial }
}

export default async function configRoutes(app: FastifyInstance) {
  const adminOnly = requirePermission('intel.admin')

  app.get('/', { preHandler: [adminOnly] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    return reply.send({
      intelligenceEnabled: company.intelligenceEnabled,
      config: mergeIntelligenceConfig(company.intelligenceConfig),
    })
  })

  app.put('/', { preHandler: [adminOnly] }, async (request, reply) => {
    const body = putSchema.parse(request.body)
    const company = await resolveTenant(request, reply, 'body')
    if (!company) return

    const merged = { ...mergeIntelligenceConfig(company.intelligenceConfig), ...body.config }
    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        ...(body.intelligenceEnabled === undefined
          ? {}
          : { intelligenceEnabled: body.intelligenceEnabled }),
        intelligenceConfig: merged,
      },
      select: { intelligenceEnabled: true, intelligenceConfig: true },
    })

    return reply.send({
      intelligenceEnabled: updated.intelligenceEnabled,
      config: mergeIntelligenceConfig(updated.intelligenceConfig),
    })
  })
}
