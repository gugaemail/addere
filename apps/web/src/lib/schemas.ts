import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

export const createUserSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  role: z.enum(['ADMIN', 'SALESPERSON']),
  userTypeId: z.string().optional(),
  copyPermissionsFromUserId: z.string().optional(),
})

export type LoginFormData = z.infer<typeof loginSchema>
export type CreateUserFormData = z.infer<typeof createUserSchema>

// ─── Empresa — modais de entidade (EntityModals) ────────────────────────────

export const branchSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  cnpj: z.string().optional(),
  idProtheus: z.string().optional(),
  razaoSocial: z.string().optional(),
  endereco: z.string().optional(),
  complemento: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  cep: z.string().optional(),
})

export type BranchFormData = z.infer<typeof branchSchema>

export const companyUserBaseSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  email: z.string().email('Email inválido'),
  password: z.string().optional(),
  role: z.enum(['ADMIN', 'SALESPERSON']),
  idVendProt: z.string().optional(),
  // Perfil de vendedor da Inteligência (E10) — strings do form, convertidas no submit
  visitsPerDay: z.string().optional(),
  vehicle: z.enum(['', 'CAR', 'MOTORCYCLE', 'FOOT']).optional(),
  servedCities: z.string().optional(),
  messageTone: z.enum(['', 'informal', 'formal']).optional(),
  managerId: z.string().optional(),
})

export type CompanyUserFormData = z.infer<typeof companyUserBaseSchema>

// Senha obrigatória (min 8) apenas na criação; na edição, vazio mantém a atual
export function makeCompanyUserSchema(isNew: boolean) {
  return companyUserBaseSchema.superRefine((data, ctx) => {
    const missing = isNew && !data.password
    const tooShort = !!data.password && data.password.length < 8
    if (missing || tooShort) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['password'],
        message: 'Senha deve ter pelo menos 8 caracteres',
      })
    }
  })
}

export const customerSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  protheusCode: z.string().optional(),
  loja: z.string().optional(),
  document: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  municipio: z.string().optional(),
  bairro: z.string().optional(),
  cep: z.string().optional(),
  uf: z.string().optional(),
  vendorCode: z.string().optional(),
  msblql: z.string().optional(),
  transpPadrao: z.string().optional(),
  condPagPadrao: z.string().optional(),
  tes: z.string().optional(),
  xcodemp: z.string().optional(),
})

export type CustomerFormData = z.infer<typeof customerSchema>

export const productSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  protheusCode: z.string().optional(),
  description: z.string().optional(),
  price: z.string().optional(),
  unit: z.string().optional(),
  stock: z.string().optional(),
  saldo: z.string().optional(),
})

export type ProductFormData = z.infer<typeof productSchema>
