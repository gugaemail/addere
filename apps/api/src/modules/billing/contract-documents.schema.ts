import { z } from 'zod'
import { effectiveInstantOfDay } from '@addere/types'
import { contractDraftSchema } from './billing.schema'

// Documentos para aceite e aditivo (plano 014).

export const documentIdParam = z.object({ id: z.string().uuid() })

export const designatedAdminSchema = z.object({ userId: z.string().uuid('Usuário inválido') })

// Corpo opcional: o painel pode mandar o POST sem corpo
export const documentSendSchema = z
  .object({ carryConditions: z.boolean().default(false) })
  .default({ carryConditions: false })

export const documentCancelSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .max(500, 'Máximo de 500 caracteres')
      .nullish()
      .transform((v) => (v ? v : null)),
  })
  .default({ reason: null })

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')
  .refine((v) => {
    try {
      effectiveInstantOfDay(v)
      return true
    } catch {
      return false
    }
  }, 'Data inválida')

// Os termos do aditivo seguem as regras do rascunho do 013 (as mesmas peças)
export const amendmentSchema = contractDraftSchema
  .pick({
    packageId: true,
    licenseType: true,
    includedSeats: true,
    extraSeats: true,
    packagePrice: true,
    extraSeatPrice: true,
  })
  .extend({
    proposedEffectiveFrom: ymd.nullish().transform((v) => v ?? null),
    reason: z
      .string()
      .trim()
      .min(1, 'Informe o motivo do aditivo')
      .max(500, 'Máximo de 500 caracteres'),
    requestedByClient: z.boolean().default(false),
    // Só para conferir a antecedência cedo; o envio recebe de novo
    carryConditions: z.boolean().default(false),
  })

export type AmendmentData = z.infer<typeof amendmentSchema>
