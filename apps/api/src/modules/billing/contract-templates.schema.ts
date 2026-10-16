import { z } from 'zod'

// Modelos de contrato (plano 014). O corpo é normalizado no serviço
// (normalizeTemplateBody), não aqui: o limite vale para o que chega.

export const TEMPLATE_BODY_MAX = 200_000

export const documentKindSchema = z.enum(['CONTRACT', 'AMENDMENT'])

export const templateCreateSchema = z.object({
  kind: documentKindSchema,
  fromTemplateId: z.string().uuid().optional(),
})

export const templateUpdateSchema = z.object({
  body: z.string().max(TEMPLATE_BODY_MAX, `Máximo de ${TEMPLATE_BODY_MAX} caracteres`),
  changeNote: z
    .string()
    .trim()
    .max(500, 'Máximo de 500 caracteres')
    .nullish()
    .transform((v) => (v ? v : null)),
})

export const templatePreviewSchema = z.object({ companyId: z.string().uuid() })

export const templateIdParam = z.object({ id: z.string().uuid() })

export type TemplateCreateData = z.infer<typeof templateCreateSchema>
export type TemplateUpdateData = z.infer<typeof templateUpdateSchema>
