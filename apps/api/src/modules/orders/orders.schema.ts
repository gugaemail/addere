import { z } from 'zod'

export const createOrderSchema = z.object({
  customerId:  z.string().uuid({ message: 'Cliente inválido' }),
  branchId:    z.string().uuid({ message: 'Filial inválida' }),
  transportId: z.string().uuid({ message: 'Transportadora inválida' }).optional(),
  condId:      z.string().uuid({ message: 'Condição de pagamento inválida' }).optional(),
  emissao:     z.string().datetime({ offset: true }).optional(),
  mennota:     z.string().optional(),
  notes:       z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid({ message: 'Produto inválido' }),
        quantity:  z.number().positive({ message: 'Quantidade deve ser positiva' }),
        discount:  z.number().min(0).max(100).optional().default(0),
        descricao: z.string().optional(),
        unitPrice: z.number().nonnegative().optional(),
      })
    )
    .min(1, { message: 'O pedido deve ter ao menos um item' }),
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>
