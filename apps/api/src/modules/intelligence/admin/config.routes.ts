// Rotas admin da configuração da camada por empresa (E3) — prefixo /intel/admin/config
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '@addere/db'
import { DEFAULT_INTELLIGENCE_CONFIG, type IntelligenceConfig } from '@addere/types'
import { requirePermission } from '../../../middleware/authenticate'
import { resolveTenant } from '../../../middleware/resolve-tenant'
import { conflict, forbidden } from '../../../lib/errors'

const configPatchSchema = z.object({
  syncHour: z.number().int().min(0).max(23).optional(),
  syncEveryHours: z.number().int().min(1).max(24).optional(),
  defaultTone: z.enum(['informal', 'formal']).optional(),
  retentionDays: z.number().int().min(30).max(3650).optional(),
  lgpdNoticeAcceptedAt: z.string().datetime().nullable().optional(),
})

// strict de propósito: por padrão o Zod descarta chaves desconhecidas em
// silêncio, e o painel chegou a mandar `enabled` em vez de
// `intelligenceEnabled` — a rota respondia 200, gravava o config e ignorava a
// flag, então o botão voltava sozinho sem nenhum erro em lugar nenhum.
const putSchema = z
  .object({
    companyId: z.string().uuid().optional(),
    intelligenceEnabled: z.boolean().optional(),
    config: configPatchSchema.optional(),
  })
  .strict()

export function mergeIntelligenceConfig(stored: unknown): IntelligenceConfig {
  const partial = (stored ?? {}) as Partial<IntelligenceConfig>
  return { ...DEFAULT_INTELLIGENCE_CONFIG, ...partial }
}

// A Inteligência entra pelo contrato (plano 014): com contrato ACTIVE, quem a
// liga e desliga é o tipo de licença (syncIntelligenceWithTerms). Sem contrato
// aceito (teste, piloto, implantação), só o SUPERADMIN liga à mão (decisão 1).
async function hasActiveContract(companyId: string): Promise<boolean> {
  const contract = await prisma.companyContract.findUnique({
    where: { companyId },
    select: { status: true },
  })
  return contract?.status === 'ACTIVE'
}

export default async function configRoutes(app: FastifyInstance) {
  const adminOnly = requirePermission('intel.admin')

  app.get('/', { preHandler: [adminOnly] }, async (request, reply) => {
    const company = await resolveTenant(request, reply, 'query')
    if (!company) return
    const managedByContract = await hasActiveContract(company.id)
    return reply.send({
      intelligenceEnabled: company.intelligenceEnabled,
      config: mergeIntelligenceConfig(company.intelligenceConfig),
      managedByContract,
      canToggle: request.user.role === 'SUPERADMIN' && !managedByContract,
    })
  })

  app.put('/', { preHandler: [adminOnly] }, async (request, reply) => {
    const body = putSchema.parse(request.body)
    const company = await resolveTenant(request, reply, 'body')
    if (!company) return

    // Valor igual ao atual é ignorado: o bundle antigo do painel manda o flag
    // em todo salvamento, e o resto do config continua sendo gravado
    const changesFlag =
      body.intelligenceEnabled !== undefined &&
      body.intelligenceEnabled !== company.intelligenceEnabled
    if (changesFlag) {
      if (request.user.role !== 'SUPERADMIN') {
        throw forbidden(
          'A Inteligência é definida pelo contrato da empresa. Fale com a Addere.',
          'INTEL_MANAGED_BY_CONTRACT'
        )
      }
      if (await hasActiveContract(company.id)) {
        throw conflict(
          'Empresa com contrato ativo: a Inteligência muda por aditivo, na aba Contrato da Gestão Addere.',
          'INTEL_MANAGED_BY_CONTRACT'
        )
      }
    }

    const merged = { ...mergeIntelligenceConfig(company.intelligenceConfig), ...body.config }
    const updated = await prisma.company.update({
      where: { id: company.id },
      data: {
        ...(changesFlag ? { intelligenceEnabled: body.intelligenceEnabled } : {}),
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
