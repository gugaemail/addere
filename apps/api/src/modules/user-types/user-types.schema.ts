import { z } from 'zod'

export const createUserTypeSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
})

export const updateUserTypeSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
})

export type CreateUserTypeInput = z.infer<typeof createUserTypeSchema>
export type UpdateUserTypeInput = z.infer<typeof updateUserTypeSchema>
