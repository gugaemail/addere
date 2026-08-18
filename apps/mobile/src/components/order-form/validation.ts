import { useCallback, useState } from 'react'
import { useFieldRequired } from '../../hooks/useFieldConfig'
import type { Transportadora, CondPag } from '@addere/types'
import type { CartItem } from './types'

interface ValidationInput {
  cart: CartItem[]
  transportadora: Transportadora | null
  condPag: CondPag | null
  mennota: string
  notes: string
}

// Mensagens que diferem entre as telas (confirmar × salvar)
interface ValidationMessages {
  emptyCart: string
  transportadora: string
  condPag: string
}

// Erros por campo de um item do carrinho (exibidos inline pelo CartItemEditor)
export interface CartItemErrors {
  unitPrice?: string
  descricao?: string
  largura?: string
  espessura?: string
  encolhimento?: string
  tara?: string
}

// Erros do formulário de pedido, por campo. `items` é indexado por productId.
export interface OrderFormErrors {
  form?: string
  transportadora?: string
  condPag?: string
  mennota?: string
  notes?: string
  items: Record<string, CartItemErrors>
}

export interface ValidationResult {
  ok: boolean
  errors: OrderFormErrors
}

// Campos do formulário (fora dos itens) que podem ter erro
export type OrderFormField = keyof Omit<OrderFormErrors, 'items'>

const ITEM_ERROR_FIELDS: (keyof CartItemErrors)[] = [
  'unitPrice', 'descricao', 'largura', 'espessura', 'encolhimento', 'tara',
]

export const EMPTY_ORDER_FORM_ERRORS: Readonly<OrderFormErrors> = Object.freeze({ items: {} })

export function hasOrderFormErrors(errors: OrderFormErrors): boolean {
  return Boolean(
    errors.form ||
    errors.transportadora ||
    errors.condPag ||
    errors.mennota ||
    errors.notes ||
    Object.keys(errors.items).length > 0,
  )
}

// Validação compartilhada dos campos obrigatórios do pedido.
// Não exibe Alert: devolve os erros por campo para as telas mostrarem inline
// (prop `error` do Input/PickerField e `errors` do CartItemEditor).
export function useOrderValidation(messages: ValidationMessages) {
  const reqTransportadora = useFieldRequired('order.transportadora')
  const reqCondPag        = useFieldRequired('order.condPag')
  const reqMennota        = useFieldRequired('order.mennota')
  const reqNotes          = useFieldRequired('order.notes')
  const reqUnitPrice      = useFieldRequired('orderItem.unitPrice')
  const reqLargura        = useFieldRequired('orderItem.largura')
  const reqEspessura      = useFieldRequired('orderItem.espessura')
  const reqEncolhimento   = useFieldRequired('orderItem.encolhimento')
  const reqTara           = useFieldRequired('orderItem.tara')
  const reqDescricao      = useFieldRequired('orderItem.descricao')

  return function validate({ cart, transportadora, condPag, mennota, notes }: ValidationInput): ValidationResult {
    const errors: OrderFormErrors = { items: {} }

    if (cart.length === 0) {
      errors.form = messages.emptyCart
    }
    if (reqTransportadora && !transportadora) {
      errors.transportadora = messages.transportadora
    }
    if (reqCondPag && !condPag) {
      errors.condPag = messages.condPag
    }
    if (reqMennota && !mennota.trim()) {
      errors.mennota = 'Preencha a observação da nota fiscal.'
    }
    if (reqNotes && !notes.trim()) {
      errors.notes = 'Preencha a observação interna.'
    }
    for (const item of cart) {
      const itemErrors: CartItemErrors = {}
      if (reqUnitPrice && (!item.unitPrice || item.unitPrice <= 0)) {
        itemErrors.unitPrice = 'Informe o preço unitário.'
      }
      if (reqDescricao && !item.descricao?.trim()) {
        itemErrors.descricao = 'Informe a descrição.'
      }
      if (reqLargura && item.largura == null) {
        itemErrors.largura = 'Informe a largura.'
      }
      if (reqEspessura && item.espessura == null) {
        itemErrors.espessura = 'Informe a espessura.'
      }
      if (reqEncolhimento && !item.encolhimento?.trim()) {
        itemErrors.encolhimento = 'Informe o encolhimento.'
      }
      if (reqTara && item.tara == null) {
        itemErrors.tara = 'Informe a tara.'
      }
      if (Object.keys(itemErrors).length > 0) {
        errors.items[item.productId] = itemErrors
      }
    }

    return { ok: !hasOrderFormErrors(errors), errors }
  }
}

// Campos validáveis de um item que mudaram entre duas versões (usado para
// limpar apenas o erro do campo editado quando o CartItemEditor dispara onChange).
export function changedItemFields(prev: CartItem, next: CartItem): (keyof CartItemErrors)[] {
  return ITEM_ERROR_FIELDS.filter((f) => prev[f] !== next[f])
}

// Estado dos erros do formulário de pedido, compartilhado pelo wizard de novo
// pedido e pela tela de edição: guarda o resultado da validação e limpa erros
// campo a campo conforme o usuário edita.
export function useOrderFormErrors() {
  const [errors, setErrors] = useState<OrderFormErrors>(() => ({ items: {} }))

  const clearError = useCallback((field: OrderFormField) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev))
  }, [])

  // Sem `fields`, remove todos os erros do item (ex.: item removido do carrinho).
  const clearItemErrors = useCallback((productId: string, fields?: (keyof CartItemErrors)[]) => {
    setErrors((prev) => {
      const current = prev.items[productId]
      if (!current) return prev
      const items = { ...prev.items }
      if (!fields) {
        delete items[productId]
      } else {
        const next = { ...current }
        let changed = false
        for (const f of fields) {
          if (next[f]) { delete next[f]; changed = true }
        }
        if (!changed) return prev
        if (Object.keys(next).length > 0) items[productId] = next
        else delete items[productId]
      }
      return { ...prev, items }
    })
  }, [])

  return { errors, setErrors, clearError, clearItemErrors, hasErrors: hasOrderFormErrors(errors) }
}
