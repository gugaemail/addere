import { z } from 'zod'

export const createOrderSchema = z.object({
  customerId:  z.string().min(1, { message: 'Cliente inválido' }),
  branchId:    z.string().min(1, { message: 'Filial inválida' }),
  transportId: z.string().min(1).optional(),
  condId:      z.string().min(1).optional(),
  emissao:     z.string().datetime({ offset: true }).optional(),
  mennota:     z.string().optional(),
  notes:       z.string().optional(),
  items: z
    .array(
      z.object({
        productId:    z.string().min(1, { message: 'Produto inválido' }),
        quantity:     z.number().positive({ message: 'Quantidade deve ser positiva' }),
        discount:     z.number().min(0).max(100).optional().default(0),
        descricao:    z.string().optional(),
        unitPrice:    z.number().nonnegative().optional(),
        largura:      z.number().nonnegative().optional(),
        espessura:    z.number().nonnegative().optional(),
        encolhimento: z.string().optional(),
        xcrav:        z.enum(['1', '2']).optional(),
        tara:         z.number().nonnegative().optional(),
      })
    )
    .min(1, { message: 'O pedido deve ter ao menos um item' }),
})

export type CreateOrderInput = z.infer<typeof createOrderSchema>

export const updateOrderSchema = z.object({
  transportId: z.string().min(1).optional(),
  condId:      z.string().min(1).optional(),
  emissao:     z.string().datetime({ offset: true }).optional(),
  mennota:     z.string().optional(),
  notes:       z.string().optional(),
  items: z
    .array(
      z.object({
        productId:    z.string().min(1, { message: 'Produto inválido' }),
        quantity:     z.number().positive({ message: 'Quantidade deve ser positiva' }),
        discount:     z.number().min(0).max(100).optional().default(0),
        descricao:    z.string().optional(),
        unitPrice:    z.number().nonnegative().optional(),
        largura:      z.number().nonnegative().optional(),
        espessura:    z.number().nonnegative().optional(),
        encolhimento: z.string().optional(),
        xcrav:        z.enum(['1', '2']).optional(),
        tara:         z.number().nonnegative().optional(),
      })
    )
    .min(1, { message: 'O pedido deve ter ao menos um item' }),
})

export type UpdateOrderInput = z.infer<typeof updateOrderSchema>
