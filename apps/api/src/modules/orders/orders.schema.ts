import { z } from 'zod'

export const createOrderSchema = z.object({
  customerId: z.string().uuid({ message: 'Cliente inválido' }),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid({ message: 'Produto inválido' }),
        quantity: z.number().positive({ message: 'Quantidade deve ser positiva' }),
        discount: z.number().min(0).max(100).optional().default(0),
      })
    )
    .min(1, { message: 'O pedido deve ter ao menos um item' }),
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>
