import { z } from 'zod'
import {
  BRAZIL_UFS,
  DUE_DAY_MAX,
  DUE_DAY_MIN,
  GRACE_MONTHS_MAX,
  LICENSE_TYPES,
  LLM_MODEL_IDS,
  isValidCpf,
} from '@addere/types'
import { isoDay } from './invoices.schema'

// Gestão Addere (plano 013). Todo texto passa por trim, e string vazia vira
// null: o painel manda o formulário inteiro, e campo apagado é campo vazio.

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

function optionalText(max: number) {
  return z
    .preprocess(emptyToNull, z.string().trim().max(max, `Máximo de ${max} caracteres`).nullish())
    .transform((v) => v ?? null)
}

const optionalEmail = z
  .preprocess(emptyToNull, z.string().trim().toLowerCase().email('E-mail inválido').nullish())
  .transform((v) => v ?? null)

export const money = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Valor inválido')

// Preço de tabela: opcional, só pré-preenche o contrato
const listPrice = z.preprocess(emptyToNull, money.nullable())

// ─── Pacotes e regras ────────────────────────────────────────────────────────

const packageFields = {
  name: z.string().trim().min(1, 'Informe o nome').max(60, 'Máximo de 60 caracteres'),
  // null = quantidade digitada no contrato (Ilimitado)
  seats: z.number().int().min(1).max(10000).nullable(),
  listPriceStandard: listPrice,
  listPriceIntelligence: listPrice,
  listExtraSeatPriceStandard: listPrice,
  listExtraSeatPriceIntelligence: listPrice,
  sortOrder: z.number().int().min(0).max(1000),
}

export const packageCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]{2,20}$/, 'Código: 2 a 20 letras maiúsculas, números ou _'),
  ...packageFields,
})

// O código não muda depois de criado
export const packageUpdateSchema = z.object(packageFields)

export const packageActiveSchema = z.object({ active: z.boolean() })

export type PackageCreateData = z.infer<typeof packageCreateSchema>
export type PackageUpdateData = z.infer<typeof packageUpdateSchema>

// O bloqueio automático (plano 017) é opcional no corpo: sem a chave, o valor
// gravado fica como está. Nasce false (decisão padrão 4) e só é ligado pelo
// superadmin, em Pacotes e regras, depois que o OTA do app estiver no ar.
// Desligar é o rollback: libera os bloqueios por atraso no tick seguinte.
export const settingsSchema = z.object({
  overdueBlockDays: z.number().int().min(1).max(90),
  dueReminderDays: z.number().int().min(0).max(15),
  notifyEmail: optionalEmail,
  autoBlockEnabled: z.boolean().optional(),
})

export type SettingsData = z.infer<typeof settingsSchema>

// Orçamento mensal de IA da empresa — atingido, o agente pausa até o fim do
// mês; null = sem orçamento
export const llmBudgetSchema = z.object({
  tokens: z.number().int().positive().max(2_000_000_000).nullable(),
  brl: z
    .number()
    .positive()
    .max(10_000_000)
    .transform((v) => Math.round(v * 100) / 100)
    .nullable(),
})

// Teste e troca do modelo do agente da empresa; null volta ao do ambiente
export const llmEvalSchema = z.object({ model: z.enum(LLM_MODEL_IDS) })
export const llmModelSchema = z.object({ model: z.enum(LLM_MODEL_IDS).nullable() })

// ─── Cadastro ────────────────────────────────────────────────────────────────

const uf = z
  .preprocess(emptyToNull, z.enum(BRAZIL_UFS, { message: 'UF inválida' }).nullish())
  .transform((v) => v ?? null)

// CEP: 8 dígitos, com ou sem hífen; gravado só com dígitos
const zip = optionalText(9)
  .refine((v) => v === null || /^\d{5}-?\d{3}$/.test(v), 'CEP inválido')
  .transform((v) => (v === null ? null : v.replace(/\D/g, '')))

// CPF do representante: dígitos verificadores conferidos; gravado só com dígitos
const cpf = optionalText(14)
  .refine((v) => v === null || isValidCpf(v), 'CPF inválido')
  .transform((v) => (v === null ? null : v.replace(/\D/g, '')))

export const clientProfileSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(2, 'Informe a razão social')
    .max(200, 'Máximo de 200 caracteres'),
  tradeName: optionalText(200),
  stateRegistration: optionalText(30),

  addressStreet: optionalText(200),
  addressNumber: optionalText(20),
  addressComplement: optionalText(100),
  addressDistrict: optionalText(100),
  addressCity: optionalText(100),
  addressState: uf,
  addressZip: zip,

  legalRepName: optionalText(200),
  legalRepCpf: cpf,
  legalRepRole: optionalText(100),

  contactName: optionalText(200),
  contactEmail: optionalEmail,
  contactPhone: optionalText(30),

  billingContactName: optionalText(200),
  billingEmail: optionalEmail,
  billingPhone: optionalText(30),

  notes: optionalText(2000),
})

export type ClientProfileData = z.infer<typeof clientProfileSchema>

export const clientSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(200, 'Máximo de 200 caracteres'),
  cnpj: z.string().trim().min(1, 'Informe o CNPJ'),
  idProtheus: optionalText(20),
  profile: clientProfileSchema,
})

export type ClientData = z.infer<typeof clientSchema>

// ─── Contrato em rascunho ────────────────────────────────────────────────────

export const contractDraftSchema = z.object({
  packageId: z.string().uuid('Pacote inválido'),
  licenseType: z.enum(LICENSE_TYPES),
  // Só vale no pacote sem quantidade fixa (Ilimitado); nos outros é ignorado
  includedSeats: z
    .number()
    .int()
    .min(1)
    .max(10000)
    .nullish()
    .transform((v) => v ?? undefined),
  extraSeats: z.number().int().min(0).max(10000).default(0),
  packagePrice: money,
  extraSeatPrice: money,
  graceMonths: z
    .number()
    .int()
    .min(0, 'Carência entre 0 e 12 meses')
    .max(GRACE_MONTHS_MAX, 'Carência entre 0 e 12 meses'),
  dueDay: z
    .number()
    .int()
    .min(DUE_DAY_MIN, 'Vencimento entre os dias 1 e 10')
    .max(DUE_DAY_MAX, 'Vencimento entre os dias 1 e 10'),
  // null = padrão das regras globais
  overdueBlockDays: z
    .number()
    .int()
    .min(1)
    .max(90)
    .nullish()
    .transform((v) => v ?? null),
  reason: optionalText(500),
})

export type ContractDraftData = z.infer<typeof contractDraftSchema>

export const companyIdParam = z.object({ companyId: z.string().uuid() })
export const packageIdParam = z.object({ id: z.string().uuid() })

// "Liberar até…" (plano 017): data opcional 'YYYY-MM-DD'. A faixa (de hoje a
// hoje + 90, em São Paulo) é conferida no serviço, que sabe que dia é hoje.
export const unblockClientSchema = z.object({ until: isoDay.nullish() })
