import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { requireSuperAdmin } from '../../middleware/authenticate'
import { companyIdParam } from './billing.schema'
import { revertContractCancel, scheduleContractCancel } from './contract-cancel.service'

// Cancelamento do contrato com efeito no fim do mês (plano 016) — registrado
// com o prefixo /admin/billing, ao lado das rotas de contrato do 013. Só o
// SUPERADMIN; o autor de cada ação é request.user.sub.

const cancelSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Informe o motivo (mínimo de 3 caracteres)')
    .max(500, 'Máximo de 500 caracteres'),
  deactivateCompany: z.boolean(),
})

export default async function contractCancelRoutes(app: FastifyInstance) {
  const superadmin = { preHandler: requireSuperAdmin }

  app.post(
    '/clients/:companyId/contract/cancel',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      const input = cancelSchema.parse(request.body)
      return reply.send(
        await scheduleContractCancel(companyId, input, { id: request.user.sub }, new Date())
      )
    }
  )

  app.post(
    '/clients/:companyId/contract/cancel/revert',
    superadmin,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { companyId } = companyIdParam.parse(request.params)
      return reply.send(await revertContractCancel(companyId, { id: request.user.sub }, new Date()))
    }
  )
}
