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
})

export type LoginFormData = z.infer<typeof loginSchema>
export type CreateUserFormData = z.infer<typeof createUserSchema>
