// Validação Zod das rotas admin de consultas da Inteligência (E3, W3)
import { z } from 'zod'

export const queryNameSchema = z.enum(['CUSTOMERS', 'SALES', 'OPEN_TITLES', 'PRODUCTS', 'STOCK'])

const companyId = z.string().uuid('companyId deve ser um UUID válido').optional()

export const upsertQuerySchema = z.object({
  companyId,
  sql: z.string().min(1, 'SQL vazio').max(20_000, 'SQL grande demais (máx. 20 mil caracteres)'),
  scope: z.enum(['ALL', 'PER_SELLER']).optional(),
  definition: z.string().max(2_000).nullish(),
  exclusions: z.string().max(2_000).nullish(),
  gotchas: z.string().max(2_000).nullish(),
})
export type UpsertQueryInput = z.infer<typeof upsertQuerySchema>

export const previewSchema = z.object({ companyId })

export const reconcileSchema = z.object({
  companyId,
  period: z.string().regex(/^\d{6}$/, 'Período deve ser YYYYMM'),
  refAmount: z.number().positive('Valor de referência deve ser positivo'),
})
export type ReconcileInput = z.infer<typeof reconcileSchema>

export const publishSchema = z.object({ companyId })
