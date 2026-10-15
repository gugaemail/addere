import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email({ message: 'Email inválido' }),
  password: z.string().min(8, { message: 'Senha deve ter no mínimo 8 caracteres' }),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email({ message: 'Email inválido' }),
})

// Resposta de quem pediu a redefinição quando o e-mail não sai (o app a exibe)
export const RESET_EMAIL_FAILED_MESSAGE =
  'Não conseguimos enviar o e-mail de redefinição de senha. Entre em contato com o suporte: suporte@addere.com.br.'

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, { message: 'Senha deve ter no mínimo 8 caracteres' }),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
