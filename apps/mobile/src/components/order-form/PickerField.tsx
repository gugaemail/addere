import { useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { orderFormStyles as s } from './styles'

interface PickerItem {
  id: string
  nome: string
}

// Seletor dropdown simples usado para transportadora e condição de pagamento.
// Antes duplicado identicamente no wizard de novo pedido e na tela de edição.
export function PickerField({
  label,
  selected,
  items,
  onSelect,
  loading,
  disabled,
}: {
  label: string
  selected: PickerItem | null
  items: PickerItem[]
  onSelect: (item: PickerItem | null) => void
  loading?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)

  if (disabled) {
    return (
      <View style={s.fieldBox}>
        <Text style={s.fieldLabel}>{label}</Text>
        <View style={[s.pickerBtn, s.pickerBtnDisabled]}>
          <Text style={selected ? s.pickerBtnText : s.pickerBtnPlaceholder}>
            {selected ? selected.nome : '— Nenhum —'}
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={s.fieldBox}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TouchableOpacity style={s.pickerBtn} onPress={() => setOpen((v) => !v)}>
        <Text style={selected ? s.pickerBtnText : s.pickerBtnPlaceholder}>
          {loading ? 'Carregando...' : selected ? selected.nome : `Selecionar ${label.toLowerCase().replace(' *', '')}...`}
        </Text>
        <Text style={s.pickerBtnIcon}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={s.pickerList}>
          <TouchableOpacity style={s.pickerItem} onPress={() => { onSelect(null); setOpen(false) }}>
            <Text style={s.pickerItemText}>— Nenhum —</Text>
          </TouchableOpacity>
          {items.map((item) => (
            <TouchableOpacity key={item.id} style={s.pickerItem} onPress={() => { onSelect(item); setOpen(false) }}>
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
