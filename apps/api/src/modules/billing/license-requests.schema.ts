import { z } from 'zod'

// Pedido de licenças adicionais (plano 015)

export const createLicenseRequestSchema = z.object({
  quantity: z
    .number()
    .int('Quantidade inválida')
    .min(1, 'Peça pelo menos 1 licença')
    .max(100, 'Peça no máximo 100 licenças por vez'),
  message: z.string().trim().max(500, 'Mensagem com no máximo 500 caracteres').optional(),
  // O preço por licença que o modal mostrou; a API confere com o atual
  unitPriceShown: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Valor por licença inválido'),
})

export const decideLicenseRequestSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('APPROVE') }),
  z.object({
    decision: z.literal('REJECT'),
    reason: z
      .string({ required_error: 'Informe o motivo da recusa' })
      .trim()
      .min(3, 'Informe o motivo da recusa')
      .max(500, 'Motivo com no máximo 500 caracteres'),
  }),
])

export const listLicenseRequestsQuerySchema = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  companyId: z.string().uuid('companyId inválido').optional(),
})

export const licenseRequestIdParam = z.object({
  id: z.string().uuid('Pedido inválido'),
})

export type CreateLicenseRequestInput = z.infer<typeof createLicenseRequestSchema>
export type DecideLicenseRequestInput = z.infer<typeof decideLicenseRequestSchema>
export type ListLicenseRequestsQuery = z.infer<typeof listLicenseRequestsQuerySchema>
