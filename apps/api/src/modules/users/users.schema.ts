import { z } from 'zod'

// Perfil de vendedor (E10) — os mesmos campos na criação e na edição. Fora do
// schema da criação, o Zod descartava o que o formulário mandava e o vendedor
// nascia sem código Protheus, veículo e gerente.
const vendorProfileFields = {
  idVendProt: z.string().max(20).nullable().optional(),
  visitsPerDay: z.number().int().min(1).max(50).nullable().optional(),
  vehicle: z.enum(['CAR', 'MOTORCYCLE', 'FOOT']).nullable().optional(),
  servedCities: z.array(z.string()).optional(),
  messageTone: z.enum(['informal', 'formal']).nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
}

// Teto diário de tokens do agente (custo de IA). Só o SUPERADMIN grava — para
// os demais o serviço ignora; 0 desliga a IA do vendedor
const llmDailyTokenCap = z.number().int().min(0).max(10_000_000).optional()

export const createUserSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  role: z.enum(['ADMIN', 'SALESPERSON']),
  // Apenas SUPERADMIN pode indicar a empresa; demais roles herdam a própria
  companyId: z.string().uuid().optional(),
  copyPermissionsFromUserId: z.string().optional(),
  // Perfil "Gerente" do painel = role SALESPERSON + intel.manager (decisão D3:
  // o enum Role não ganha valor novo). A permissão nunca é default do role.
  intelManager: z.boolean().optional(),
  // Permissões do pedido no app (orders.change_carrier e
  // orders.change_payment_terms), ligadas pelo administrador da empresa.
  canChangeCarrier: z.boolean().optional(),
  canChangePaymentTerms: z.boolean().optional(),
  llmDailyTokenCap,
  ...vendorProfileFields,
})

export const updateUserSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').optional(),
  email: z.string().email('Email inválido').optional(),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres').optional(),
  role: z.enum(['ADMIN', 'SALESPERSON']).optional(),
  intelManager: z.boolean().optional(),
  // Permissões do pedido no app (orders.change_carrier e
  // orders.change_payment_terms), ligadas pelo administrador da empresa.
  canChangeCarrier: z.boolean().optional(),
  canChangePaymentTerms: z.boolean().optional(),
  llmDailyTokenCap,
  ...vendorProfileFields,
  // Só para vincular um usuário que ficou sem empresa (bug antigo do painel).
  // Não serve para mover de empresa — ver users.service:updateUserById.
  companyId: z.string().uuid().optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
