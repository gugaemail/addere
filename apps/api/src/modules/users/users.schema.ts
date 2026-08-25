import { z } from 'zod'

export const createUserSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  role: z.enum(['ADMIN', 'SALESPERSON']),
  userTypeId: z.string().optional(),
  // Apenas SUPERADMIN pode indicar a empresa; demais roles herdam a própria
  companyId: z.string().uuid().optional(),
  copyPermissionsFromUserId: z.string().optional(),
  // Perfil "Gerente" do painel = role SALESPERSON + intel.manager (decisão D3:
  // o enum Role não ganha valor novo). A permissão nunca é default do role.
  intelManager: z.boolean().optional(),
})

export const updateUserSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').optional(),
  email: z.string().email('Email inválido').optional(),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres').optional(),
  role: z.enum(['ADMIN', 'SALESPERSON']).optional(),
  intelManager: z.boolean().optional(),
  idVendProt: z.string().max(20).nullable().optional(),
  visitsPerDay: z.number().int().min(1).max(50).nullable().optional(),
  vehicle: z.enum(['CAR', 'MOTORCYCLE', 'FOOT']).nullable().optional(),
  servedCities: z.array(z.string()).optional(),
  messageTone: z.enum(['informal', 'formal']).nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
