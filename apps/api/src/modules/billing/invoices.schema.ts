import { z } from 'zod'
import { INVOICE_PAYMENT_METHODS, type InvoicePaymentMethod } from '@addere/types'
import { isoDayToDate } from './competence'

// Faturas (plano 016). Competência 'YYYY-MM', data 'YYYY-MM-DD' (e válida) e
// dinheiro como string com até duas casas: nada de número de ponto flutuante.

export const competenceIso = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Competência inválida (use AAAA-MM)')

export const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .refine((v) => isoDayToDate(v) !== null, 'Data inválida')

const moneyUnsigned = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Valor inválido')

const moneySigned = z
  .string()
  .trim()
  .regex(/^-?\d{1,12}(\.\d{1,2})?$/, 'Valor inválido')

const isZero = (v: string) => /^-?0+(\.0{1,2})?$/.test(v)

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null))

export const invoiceIdParam = z.object({ id: z.string().uuid() })
export const invoiceItemParam = z.object({ id: z.string().uuid(), itemId: z.string().uuid() })

export const listInvoicesQuery = z.object({
  status: z.enum(['OPEN', 'OVERDUE', 'PAID', 'CANCELLED']).optional(),
  competence: competenceIso.optional(),
  companyId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuery>

/**
 * Item manual. DISCOUNT recebe o valor positivo (o serviço grava negativo);
 * ADJUSTMENT leva o sinal: positivo cobra, negativo devolve. Zero não é item.
 */
export const manualItemSchema = z
  .object({
    kind: z.enum(['DISCOUNT', 'ADJUSTMENT']),
    description: z
      .string()
      .trim()
      .min(3, 'Descrição com pelo menos 3 caracteres')
      .max(200, 'Máximo de 200 caracteres'),
    amount: moneySigned,
  })
  .superRefine((item, ctx) => {
    if (item.kind === 'DISCOUNT' && !moneyUnsigned.safeParse(item.amount).success) {
      ctx.addIssue({ code: 'custom', path: ['amount'], message: 'Desconto com valor positivo' })
    }
    if (isZero(item.amount)) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Valor precisa ser diferente de zero',
      })
    }
  })
export type ManualItemInput = z.infer<typeof manualItemSchema>

export const manualInvoiceSchema = z
  .object({
    companyId: z.string().uuid('Cliente inválido'),
    competence: competenceIso,
    dueDate: isoDay,
    useContractTerms: z.boolean(),
    items: z.array(manualItemSchema).max(20, 'Máximo de 20 itens').default([]),
    notes: optionalText(2000),
  })
  .refine((v) => v.useContractTerms || v.items.length > 0, {
    message: 'Inclua pelo menos um item ou use o pacote do contrato',
    path: ['items'],
  })
export type ManualInvoiceInput = z.infer<typeof manualInvoiceSchema>

export const payInvoiceSchema = z.object({
  paidAt: isoDay,
  amount: moneyUnsigned,
  method: z.enum(INVOICE_PAYMENT_METHODS as [InvoicePaymentMethod, ...InvoicePaymentMethod[]]),
  note: optionalText(500),
})
export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>

export const cancelInvoiceSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, 'Informe o motivo (mínimo de 3 caracteres)')
    .max(500, 'Máximo de 500 caracteres'),
})

export const updateInvoiceSchema = z
  .object({ nfNumber: optionalText(60).optional(), notes: optionalText(2000).optional() })
  .refine((v) => v.nfNumber !== undefined || v.notes !== undefined, 'Nada para alterar')
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>
