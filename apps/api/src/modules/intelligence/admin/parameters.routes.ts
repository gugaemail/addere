// Rotas admin das premissas do motor (E3, tela W5) — prefixo /intel/admin/parameters
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import { DEFAULT_INTEL_PARAMETERS } from '@addere/types'
import { requirePermission, requireAnyPermission } from '../../../middleware/authenticate'
import { resolveTenant } from '../../../middleware/resolve-tenant'

const PARAMETER_KEYS = Object.keys(DEFAULT_INTEL_PARAMETERS) as Array<
  keyof typeof DEFAULT_INTEL_PARAMETERS
>

// Valida o valor conforme o tipo/domínio de cada premissa
export function validateParameterValue(key: string, value: unknown): string | null {
  if (key === 'group_by') {
    return value === 'city' || value === 'district' ? null : 'group_by deve ser city ou district'
  }
  if (key === 'saturday_workday') {
    return typeof value === 'boolean' ? null : 'saturday_workday deve ser booleano'
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return `${key} deve ser um número positivo`
  }
  if (key.startsWith('weight_') || key.endsWith('_pct')) {
    if (value > 100) return `${key} deve ser no máximo 100`
  }
  if ((key.endsWith('_days') || key === 'visits_per_day' || key === 'cycle_min_orders') && value > 3650) {
    return `${key} fora do intervalo aceitável`
  }
  return null
}

const putSchema = z.object({
  companyId: z.string().uuid().optional(),
  parameters: z
    .array(
      z.object({
        key: z.enum(PARAMETER_KEYS as [string, ...string[]]),
        value: z.unknown(),
        segment: z.string().max(40).default(''),
      })
    )
    .min(1, 'Informe ao menos uma premissa'),
})

const historyQuerySchema = z.object({
  companyId: z.string().uuid().optional(),
  key: z.string().optional(),
})

export default async function parametersRoutes(app: FastifyInstance) {
  const adminOnly = requirePermission('intel.admin')
  const adminOrManager = requireAnyPermission('intel.admin', 'intel.manager')

  // GET / — defaults mesclados com os overrides do tenant
  app.get('/', { preHandler: [adminOrManager] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return

    const overrides = await prisma.intelParameter.findMany({
      where: { companyId: company.id },
      orderBy: [{ key: 'asc' }, { segment: 'asc' }],
    })
    const overrideByKey = new Map(
      overrides.filter((o) => o.segment === '').map((o) => [o.key, o])
    )

    const parameters = PARAMETER_KEYS.map((key) => {
      const override = overrideByKey.get(key)
      return {
        key,
        value: override ? override.value : DEFAULT_INTEL_PARAMETERS[key],
        segment: '',
        isDefault: !override,
        changedBy: override?.changedBy ?? null,
        updatedAt: override?.updatedAt.toISOString() ?? null,
      }
    })
    const segmented = overrides
      .filter((o) => o.segment !== '')
      .map((o) => ({
        key: o.key,
        value: o.value,
        segment: o.segment,
        isDefault: false,
        changedBy: o.changedBy,
        updatedAt: o.updatedAt.toISOString(),
      }))

    return reply.send({ parameters: [...parameters, ...segmented] })
  })

  // PUT / — grava overrides + histórico (auditoria de quem mudou o quê)
  app.put('/', { preHandler: [adminOnly] }, async (request, reply) => {
    const body = putSchema.parse(request.body)
    const company = await resolveTenant(request, reply, 'body')
    if (!company) return

    const invalid = body.parameters
      .map((p) => ({ key: p.key, error: validateParameterValue(p.key, p.value) }))
      .filter((p) => p.error)
    if (invalid.length > 0) {
      return reply
        .status(422)
        .send({ message: 'Valores inválidos', details: invalid })
    }

    const userId = request.user.sub
    await prisma.$transaction([
      ...body.parameters.map((p) =>
        prisma.intelParameter.upsert({
          where: {
            companyId_key_segment: { companyId: company.id, key: p.key, segment: p.segment },
          },
          create: {
            companyId: company.id,
            key: p.key,
            segment: p.segment,
            value: p.value as object,
            changedBy: userId,
          },
          update: { value: p.value as object, changedBy: userId },
        })
      ),
      prisma.intelParameterHistory.createMany({
        data: body.parameters.map((p) => ({
          companyId: company.id,
          key: p.key,
          segment: p.segment,
          value: p.value as object,
          changedBy: userId,
        })),
      }),
    ])

    return reply.send({ updated: body.parameters.length })
  })

  // GET /history — auditoria (mais recente primeiro)
  app.get('/history', { preHandler: [adminOrManager] }, async (request, reply) => {
    const query = historyQuerySchema.parse(request.query)
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return

    const rows = await prisma.intelParameterHistory.findMany({
      where: { companyId: company.id, ...(query.key ? { key: query.key } : {}) },
      orderBy: { changedAt: 'desc' },
      take: 50,
    })
    return reply.send({
      history: rows.map((r) => ({
        key: r.key,
        value: r.value,
        segment: r.segment,
        changedBy: r.changedBy,
        changedAt: r.changedAt.toISOString(),
      })),
    })
  })
}
