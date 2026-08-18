import { useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { ChevronDown, ChevronUp } from 'lucide-react-native'
import { colors } from '../../theme/colors'
import { orderFormStyles as s } from './styles'

interface PickerItem {
  id: string
  nome: string
}

// Seletor dropdown simples usado para transportadora e condição de pagamento.
// Antes duplicado identicamente no wizard de novo pedido e na tela de edição.
// `error` exibe borda vermelha + mensagem inline (mesmo visual do Input).
export function PickerField({
  label,
  selected,
  items,
  onSelect,
  loading,
  disabled,
  error,
}: {
  label: string
  selected: PickerItem | null
  items: PickerItem[]
  onSelect: (item: PickerItem | null) => void
  loading?: boolean
  disabled?: boolean
  error?: string
}) {
  const [open, setOpen] = useState(false)

  if (disabled) {
    return (
      <View style={s.fieldBox}>
        <Text style={s.fieldLabel}>{label}</Text>
        <View style={[s.pickerBtn, s.pickerBtnDisabled, error && s.pickerBtnError]}>
          <Text style={selected ? s.pickerBtnText : s.pickerBtnPlaceholder}>
            {selected ? selected.nome : '— Nenhum —'}
          </Text>
        </View>
        {error && <Text style={s.fieldError}>{error}</Text>}
      </View>
    )
  }

  return (
    <View style={s.fieldBox}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TouchableOpacity
        style={[s.pickerBtn, error && s.pickerBtnError]}
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={selected ? s.pickerBtnText : s.pickerBtnPlaceholder}>
          {loading
            ? 'Carregando...'
            : selected
              ? selected.nome
              : `Selecionar ${label.toLowerCase().replace(' *', '')}...`}
        </Text>
        {open ? (
          <ChevronUp size={16} color={colors.neutral.textSub} strokeWidth={1.5} />
        ) : (
          <ChevronDown size={16} color={colors.neutral.textSub} strokeWidth={1.5} />
        )}
      </TouchableOpacity>
      {error && <Text style={s.fieldError}>{error}</Text>}
      {open && (
        <View style={s.pickerList}>
          <TouchableOpacity
            style={s.pickerItem}
            onPress={() => {
              onSelect(null)
              setOpen(false)
            }}
          >
            <Text style={s.pickerItemText}>— Nenhum —</Text>
          </TouchableOpacity>
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={s.pickerItem}
              onPress={() => {
                onSelect(item)
                setOpen(false)
              }}
            >
              <Text style={[s.pickerItemText, selected?.id === item.id && s.pickerItemSelected]}>
                {item.nome}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}
