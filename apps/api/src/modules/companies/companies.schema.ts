import { z } from 'zod'
import { FIELD_REGISTRY_KEYS } from '@addere/types'

// Códigos Protheus interpolados nos placeholders {{FILIAL}}/{{VENDEDOR}} das
// consultas SQL da camada de Inteligência — formato restrito por segurança (E2)
const protheusCode = z.string().regex(/^[A-Za-z0-9 ]{1,20}$/, 'Código Protheus inválido')

export const createCompanySchema = z.object({
  name: z.string().min(1),
  cnpj: z.string().min(1),
  idProtheus: z.string().optional(),
})

export const updateCompanySchema = z
  .object({
    name: z.string().min(1).optional(),
    cnpj: z.string().min(1).optional(),
    idProtheus: z.string().nullable().optional(),
  })
  .refine((b) => b.name !== undefined || b.cnpj !== undefined || b.idProtheus !== undefined, {
    message: 'Nenhum campo para atualizar',
  })

export const createBranchSchema = z.object({
  name: z.string().min(1),
  cnpj: z.string().optional(),
  idProtheus: protheusCode.optional(),
  razaoSocial: z.string().optional(),
  endereco: z.string().optional(),
  complemento: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  cep: z.string().optional(),
  logo: z.string().optional(),
})

export const updateBranchSchema = createBranchSchema.partial().extend({
  logo: z.string().optional().nullable(),
})

export const createCompanyUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['ADMIN', 'SALESPERSON']),
  idVendProt: protheusCode.optional().nullable(),
})

export const updateCompanyUserSchema = createCompanyUserSchema.partial()

export const toggleActiveSchema = z.object({
  active: z.boolean(),
})

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  protheusCode: z.string().optional(),
  loja: z.string().optional(),
  document: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
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

export const updateCustomerSchema = createCustomerSchema.partial()

export const createProductSchema = z.object({
  name: z.string().min(1),
  protheusCode: z.string().optional(),
  description: z.string().optional(),
  price: z.number().min(0),
  unit: z.string().optional(),
  stock: z.number().min(0).optional(),
  saldo: z.number().optional(),
})

export const updateProductSchema = createProductSchema.partial()

export const updateProtheusSchema = z.object({
  apiToken: z.string().optional(),
  apiPord: z.string().optional(),
  apiCliente: z.string().optional(),
  apiPedido: z.string().optional(),
  apiConsPed: z.string().optional(),
  apiCondPag: z.string().optional(),
  apiTransp: z.string().optional(),
  apiMetaVend: z.string().optional(),
  usrProtheus: z.string().optional(),
  passProtheus: z.string().optional(),
  syncConfig: z.record(z.unknown()).optional(),
})

// Antes o corpo era espalhado sem validação direto no JSONB e alimentava
// setInterval — scheduleMin negativo ou string passava sem barreira
const syncScheduleEntitySchema = z.object({
  interv: z.number().int().min(0).optional(),
  scheduleMin: z.number().int().min(0).max(10080).optional(),
  auto: z.boolean().optional(),
})

export const updateSyncScheduleSchema = z
  .object({
    products: syncScheduleEntitySchema.optional(),
    customers: syncScheduleEntitySchema.optional(),
  })
  .refine((b) => b.products || b.customers, {
    message: 'Corpo inválido: products ou customers obrigatório',
  })

function fieldKeysSchema(label: string) {
  return z.array(z.string()).superRefine((arr, ctx) => {
    const invalid = arr.filter((k) => !FIELD_REGISTRY_KEYS.has(k))
    if (invalid.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Chaves inválidas em ${label}: ${invalid.join(', ')}`,
      })
    }
  })
}

export const updateFieldConfigSchema = z.object({
  hidden: fieldKeysSchema('hidden'),
  required: fieldKeysSchema('required'),
})

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().optional(),
})

export const protheusLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  operation: z.string().optional(),
  success: z.enum(['true', 'false']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
})
