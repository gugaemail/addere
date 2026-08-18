import { Alert } from 'react-native'
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

// Validação compartilhada dos campos obrigatórios do pedido.
// Exibe o Alert do primeiro campo inválido e retorna false; true se tudo ok.
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

  return function validate({ cart, transportadora, condPag, mennota, notes }: ValidationInput): boolean {
    if (cart.length === 0) {
      Alert.alert('Pedido inválido', messages.emptyCart)
      return false
    }
    if (reqTransportadora && !transportadora) {
      Alert.alert('Campo obrigatório', messages.transportadora)
      return false
    }
    if (reqCondPag && !condPag) {
      Alert.alert('Campo obrigatório', messages.condPag)
      return false
    }
    if (reqMennota && !mennota.trim()) {
      Alert.alert('Campo obrigatório', 'Preencha a observação da nota fiscal.')
      return false
    }
    if (reqNotes && !notes.trim()) {
      Alert.alert('Campo obrigatório', 'Preencha a observação interna.')
      return false
    }
    for (const item of cart) {
      if (reqUnitPrice && (!item.unitPrice || item.unitPrice <= 0)) {
        Alert.alert('Campo obrigatório', `Informe o preço unitário de "${item.productName}".`)
        return false
      }
      if (reqDescricao && !item.descricao?.trim()) {
        Alert.alert('Campo obrigatório', `Informe a descrição de "${item.productName}".`)
        return false
      }
      if (reqLargura && item.largura == null) {
        Alert.alert('Campo obrigatório', `Informe a largura de "${item.productName}".`)
        return false
      }
      if (reqEspessura && item.espessura == null) {
        Alert.alert('Campo obrigatório', `Informe a espessura de "${item.productName}".`)
        return false
      }
      if (reqEncolhimento && !item.encolhimento?.trim()) {
        Alert.alert('Campo obrigatório', `Informe o encolhimento de "${item.productName}".`)
        return false
      }
      if (reqTara && item.tara == null) {
        Alert.alert('Campo obrigatório', `Informe a tara de "${item.productName}".`)
        return false
      }
    }
    return true
  }
}
