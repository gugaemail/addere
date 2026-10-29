import { z } from 'zod'
import { DUE_DAY_MAX, DUE_DAY_MIN, GRACE_MONTHS_MAX, isValidCpf } from '@addere/types'
import { moneyInputToApi } from './billing-ui'

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha obrigatória'),
})

export const createUserSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
  role: z.enum(['ADMIN', 'SALESPERSON']),
  copyPermissionsFromUserId: z.string().optional(),
  // Sem isso a API cai no `input.companyId ?? null` e o SUPERADMIN cria um
  // usuário sem empresa: ele some da aba da empresa e, mesmo com intel.manager,
  // fica invisível para a Equipe em campo, que filtra por companyId.
  companyId: z.string().uuid().optional(),
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
  // Perfil da tela, não o enum do banco: "Gerente" é vendedor + intel.manager
  // (decisão D3). A tradução mora em lib/user-profile.ts.
  profile: z.enum(['SALESPERSON', 'MANAGER', 'ADMIN']),
  idVendProt: z.string().optional(),
  // Perfil de vendedor da Inteligência (E10) — strings do form, convertidas no submit
  visitsPerDay: z.string().optional(),
  vehicle: z.enum(['', 'CAR', 'MOTORCYCLE', 'FOOT']).optional(),
  servedCities: z.string().optional(),
  messageTone: z.enum(['', 'informal', 'formal']).optional(),
  managerId: z.string().optional(),
  // Permissões do pedido no app (orders.change_carrier / change_payment_terms)
  canChangeCarrier: z.boolean().optional(),
  canChangePaymentTerms: z.boolean().optional(),
  // Teto diário de IA em milhares de tokens (só o SUPERADMIN vê); 0 desliga
  llmDailyTokenCapK: z
    .string()
    .regex(/^\d{0,5}$/, 'Use um número inteiro de mil tokens (0 a 10000)')
    .optional(),
})

export type UserFormData = z.infer<typeof companyUserBaseSchema>

// Senha obrigatória (min 8) apenas na criação; na edição, vazio mantém a atual
export function makeUserFormSchema(isNew: boolean) {
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

// ─── Gestão Addere — cadastro do cliente (plano 013) ────────────────────────
// Strings do formulário; o ClientFormModal converte vazio em null e grava CPF e
// CEP só com dígitos. A API valida de novo (billing.schema.ts).

const digitsOf = (v: string | undefined) => (v ?? '').replace(/\D/g, '')
const isBlank = (v: string | undefined) => !v || !v.trim()

const optionalFormEmail = z
  .string()
  .optional()
  .refine((v) => isBlank(v) || z.string().email().safeParse(v?.trim()).success, 'E-mail inválido')

export const clientFormSchema = z.object({
  // Empresa
  name: z.string().trim().min(1, 'Nome no sistema obrigatório'),
  cnpj: z.string().refine((v) => digitsOf(v).length === 14, 'CNPJ deve ter 14 dígitos'),
  idProtheus: z.string().max(20, 'Máximo de 20 caracteres').optional(),
  stateRegistration: z.string().optional(),
  legalName: z.string().trim().min(2, 'Razão social obrigatória'),
  tradeName: z.string().optional(),
  // Endereço
  addressStreet: z.string().optional(),
  addressNumber: z.string().optional(),
  addressComplement: z.string().optional(),
  addressDistrict: z.string().optional(),
  addressCity: z.string().optional(),
  addressState: z.string().optional(),
  addressZip: z
    .string()
    .optional()
    .refine((v) => isBlank(v) || digitsOf(v).length === 8, 'CEP deve ter 8 dígitos'),
  // Representante legal
  legalRepName: z.string().optional(),
  legalRepCpf: z
    .string()
    .optional()
    .refine((v) => isBlank(v) || isValidCpf(v ?? ''), 'CPF inválido'),
  legalRepRole: z.string().optional(),
  // Contatos
  contactName: z.string().optional(),
  contactEmail: optionalFormEmail,
  contactPhone: z.string().optional(),
  billingContactName: z.string().optional(),
  billingEmail: optionalFormEmail,
  billingPhone: z.string().optional(),
  // Observações (só a Addere vê)
  notes: z.string().max(2000, 'Máximo de 2000 caracteres').optional(),
})

export type ClientFormData = z.infer<typeof clientFormSchema>

// ─── Gestão Addere — contrato em rascunho (plano 013) ───────────────────────
// Strings do formulário. A quantidade incluída só é digitada no pacote sem
// quantidade fixa (Ilimitado); a tela confere isso no submit, porque o schema
// não conhece o pacote. A API valida de novo (billing.schema.ts).

const intInRange = (v: string, min: number, max: number) =>
  /^\d+$/.test(v.trim()) && Number(v) >= min && Number(v) <= max

export const contractDraftFormSchema = z
  .object({
    packageId: z.string().min(1, 'Escolha o pacote'),
    licenseType: z.enum(['STANDARD', 'INTELLIGENCE']),
    includedSeats: z.string(),
    extraSeats: z.string().refine((v) => intInRange(v, 0, 10000), 'Número inteiro de 0 a 10000'),
    packagePrice: z.string().refine((v) => moneyInputToApi(v) !== null, 'Valor inválido'),
    extraSeatPrice: z.string().refine((v) => moneyInputToApi(v) !== null, 'Valor inválido'),
    graceMonths: z
      .string()
      .refine((v) => intInRange(v, 0, GRACE_MONTHS_MAX), `De 0 a ${GRACE_MONTHS_MAX} meses`),
    dueDay: z
      .string()
      .refine(
        (v) => intInRange(v, DUE_DAY_MIN, DUE_DAY_MAX),
        `Entre os dias ${DUE_DAY_MIN} e ${DUE_DAY_MAX}`
      ),
    useDefaultBlockDays: z.boolean(),
    overdueBlockDays: z.string(),
    reason: z.string().max(500, 'Máximo de 500 caracteres'),
  })
  .superRefine((d, ctx) => {
    if (d.includedSeats.trim() && !intInRange(d.includedSeats, 1, 10000)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['includedSeats'],
        message: 'Número inteiro de 1 a 10000',
      })
    }
    if (!d.useDefaultBlockDays && !intInRange(d.overdueBlockDays, 1, 90)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['overdueBlockDays'],
        message: 'Entre 1 e 90 dias',
      })
    }
  })

export type ContractDraftFormData = z.infer<typeof contractDraftFormSchema>

// Aditivo (plano 014): os mesmos termos do rascunho, mais "vale a partir de",
// o motivo (obrigatório: entra no texto do aditivo) e as duas caixas
export const amendmentFormSchema = z
  .object({
    packageId: z.string().min(1, 'Escolha o pacote'),
    licenseType: z.enum(['STANDARD', 'INTELLIGENCE']),
    includedSeats: z.string(),
    extraSeats: z.string().refine((v) => intInRange(v, 0, 10000), 'Número inteiro de 0 a 10000'),
    packagePrice: z.string().refine((v) => moneyInputToApi(v) !== null, 'Valor inválido'),
    extraSeatPrice: z.string().refine((v) => moneyInputToApi(v) !== null, 'Valor inválido'),
    proposedEffectiveFrom: z
      .string()
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Data inválida'),
    reason: z
      .string()
      .trim()
      .min(1, 'Informe o motivo do aditivo')
      .max(500, 'Máximo de 500 caracteres'),
    requestedByClient: z.boolean(),
    carryConditions: z.boolean(),
  })
  .superRefine((d, ctx) => {
    if (d.includedSeats.trim() && !intInRange(d.includedSeats, 1, 10000)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['includedSeats'],
        message: 'Número inteiro de 1 a 10000',
      })
    }
  })

export type AmendmentFormData = z.infer<typeof amendmentFormSchema>

// ─── Gestão Addere — pacotes e regras de cobrança (plano 013) ───────────────

const optionalFormMoney = z
  .string()
  .refine((v) => !v.trim() || moneyInputToApi(v) !== null, 'Valor inválido')

export const packageFormSchema = z.object({
  // O código só é editável na criação (o campo fica só de leitura na edição)
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{2,20}$/, 'Código: 2 a 20 letras maiúsculas, números ou _'),
  name: z.string().trim().min(1, 'Nome obrigatório').max(60, 'Máximo de 60 caracteres'),
  // Vazio = quantidade definida no contrato (Ilimitado)
  seats: z
    .string()
    .refine((v) => !v.trim() || intInRange(v, 1, 10000), 'Número inteiro de 1 a 10000'),
  listPriceStandard: optionalFormMoney,
  listPriceIntelligence: optionalFormMoney,
  listExtraSeatPriceStandard: optionalFormMoney,
  listExtraSeatPriceIntelligence: optionalFormMoney,
  sortOrder: z.string().refine((v) => intInRange(v, 0, 1000), 'De 0 a 1000'),
})

export type PackageFormData = z.infer<typeof packageFormSchema>

export const billingSettingsFormSchema = z.object({
  overdueBlockDays: z.string().refine((v) => intInRange(v, 1, 90), 'Entre 1 e 90 dias'),
  dueReminderDays: z.string().refine((v) => intInRange(v, 0, 15), 'Entre 0 e 15 dias'),
  notifyEmail: optionalFormEmail,
})

export type BillingSettingsFormData = z.infer<typeof billingSettingsFormSchema>
