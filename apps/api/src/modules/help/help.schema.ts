import { z } from 'zod'

export const VALID_TYPES = [
  'pedido_nao_enviou',
  'app_travou',
  'dados_incorretos',
  'falha_sync',
  'login',
  'outro',
] as const

export const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif'])

export const createReportSchema = z.object({
  type: z.enum(VALID_TYPES, {
    message: `Tipo inválido. Valores aceitos: ${VALID_TYPES.join(', ')}`,
  }),
  description: z.string().min(20, 'Descrição deve ter pelo menos 20 caracteres'),
  appVersion: z.string().optional(),
  device: z.string().optional(),
})

export const listReportsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
  status: z.enum(['aberto', 'em_analise', 'resolvido']).optional(),
})
