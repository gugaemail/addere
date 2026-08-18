import { View, Text, TextInput, TouchableOpacity } from 'react-native'
import { useFieldVisible, useFieldRequired } from '../../hooks/useFieldConfig'
import { colors } from '../../theme/colors'
import { fmtMoeda } from '../../utils/format'
import { orderFormStyles as s } from './styles'
import type { CartItem } from './types'

// Editor de um item do carrinho: quantidade, preço e campos extras
// (descrição, largura, espessura, encolhimento, xcrav, tara).
// Antes duplicado no wizard de novo pedido e na tela de edição.
export function CartItemEditor({
  item,
  onChange,
  onRemove,
}: {
  item: CartItem
  onChange: (updated: CartItem) => void
  onRemove: () => void
}) {
  const showUnitPrice    = useFieldVisible('orderItem.unitPrice')
  const showLargura      = useFieldVisible('orderItem.largura')
  const showEspessura    = useFieldVisible('orderItem.espessura')
  const showEncolhimento = useFieldVisible('orderItem.encolhimento')
  const showXcrav        = useFieldVisible('orderItem.xcrav')
  const showTara         = useFieldVisible('orderItem.tara')
  const showDescricao    = useFieldVisible('orderItem.descricao')

  const reqUnitPrice    = useFieldRequired('orderItem.unitPrice')
  const reqLargura      = useFieldRequired('orderItem.largura')
  const reqEspessura    = useFieldRequired('orderItem.espessura')
  const reqEncolhimento = useFieldRequired('orderItem.encolhimento')
  const reqXcrav        = useFieldRequired('orderItem.xcrav')
  const reqTara         = useFieldRequired('orderItem.tara')
  const reqDescricao    = useFieldRequired('orderItem.descricao')

  function updateQty(qty: number) {
    if (qty <= 0) {
      onRemove()
      return
    }
    onChange({ ...item, quantity: qty })
  }

  function updatePrice(raw: string) {
    const value = parseFloat(raw.replace(',', '.'))
    if (isNaN(value) || value < 0) return
    onChange({ ...item, unitPrice: value })
  }

  function updateNumField(field: 'largura' | 'espessura' | 'tara', raw: string) {
    const value = parseFloat(raw.replace(',', '.'))
    if (isNaN(value) || value < 0) return
    onChange({ ...item, [field]: value })
  }

  function updateStrField(field: 'encolhimento' | 'descricao', value: string) {
    onChange({ ...item, [field]: value })
  }

  function toggleXcrav() {
    onChange({ ...item, xcrav: item.xcrav === '1' ? '2' : '1' })
  }

  return (
    <View style={s.itemRow}>
      {showDescricao ? (
        <View style={s.itemExtraFull}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={s.controlLabel}>Descrição{reqDescricao ? ' *' : ''}</Text>
            <TouchableOpacity onPress={onRemove} style={s.removeBtn}>
              <Text style={s.removeBtnText}>×</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={s.priceInput}
            placeholder="Descrição do item"
            defaultValue={item.descricao ?? ''}
            onEndEditing={(e) => updateStrField('descricao', e.nativeEvent.text)}
            placeholderTextColor={colors.neutral.textSub}
          />
        </View>
      ) : (
        <View style={s.itemHeader}>
          <Text style={s.itemName} numberOfLines={2}>{item.productName}</Text>
          <TouchableOpacity onPress={onRemove} style={s.removeBtn}>
            <Text style={s.removeBtnText}>×</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[s.itemControls, { marginTop: 8 }]}>
        <View style={s.itemQty}>
          <Text style={s.controlLabel}>Qtd</Text>
          <TextInput
            style={s.priceInput}
            keyboardType="decimal-pad"
            defaultValue={item.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
            onEndEditing={(e) => {
              const raw = parseFloat(e.nativeEvent.text.replace(',', '.'))
              updateQty(isNaN(raw) ? 1 : raw)
            }}
            placeholderTextColor={colors.neutral.textSub}
          />
        </View>

        {showUnitPrice && (
          <View style={s.itemPrice}>
            <Text style={s.controlLabel}>Preço unit. (R$){reqUnitPrice ? ' *' : ''}</Text>
            <TextInput
              style={s.priceInput}
              keyboardType="decimal-pad"
              defaultValue={item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              onEndEditing={(e) => updatePrice(e.nativeEvent.text)}
              placeholderTextColor={colors.neutral.textSub}
            />
          </View>
        )}

        <View style={s.itemSubtotal}>
          <Text style={s.controlLabel}>Subtotal</Text>
          <Text style={s.subtotalValue}>
            R$ {fmtMoeda(item.unitPrice * item.quantity * (1 - item.discount / 100))}
          </Text>
        </View>
      </View>

      {(showLargura || showEspessura || showTara) && (
        <View style={s.itemExtraRow}>
          {showLargura && (
            <View style={s.itemExtraField}>
              <Text style={s.controlLabel}>Largura{reqLargura ? ' *' : ''}</Text>
              <TextInput
                style={s.priceInput}
                keyboardType="decimal-pad"
                placeholder="0"
                defaultValue={item.largura != null ? String(item.largura) : ''}
                onEndEditing={(e) => updateNumField('largura', e.nativeEvent.text)}
              />
            </View>
          )}
          {showEspessura && (
            <View style={s.itemExtraField}>
              <Text style={s.controlLabel}>Espessura{reqEspessura ? ' *' : ''}</Text>
              <TextInput
                style={s.priceInput}
                keyboardType="decimal-pad"
                placeholder="0"
                defaultValue={item.espessura != null ? String(item.espessura) : ''}
                onEndEditing={(e) => updateNumField('espessura', e.nativeEvent.text)}
              />
            </View>
          )}
          {showTara && (
            <View style={s.itemExtraField}>
              <Text style={s.controlLabel}>Tara{reqTara ? ' *' : ''}</Text>
              <TextInput
                style={s.priceInput}
                keyboardType="decimal-pad"
                placeholder="0"
                defaultValue={item.tara != null ? String(item.tara) : ''}
                onEndEditing={(e) => updateNumField('tara', e.nativeEvent.text)}
              />
            </View>
          )}
        </View>
      )}

      {showEncolhimento && (
        <View style={s.itemExtraFull}>
          <Text style={s.controlLabel}>Encolhimento{reqEncolhimento ? ' *' : ''}</Text>
          <TextInput
            style={s.priceInput}
            placeholder="Texto"
            defaultValue={item.encolhimento ?? ''}
            onEndEditing={(e) => updateStrField('encolhimento', e.nativeEvent.text)}
          />
        </View>
      )}

      {showXcrav && (
        <View style={s.itemExtraFull}>
          <Text style={s.controlLabel}>Largura Crav.{reqXcrav ? ' *' : ''}</Text>
          <TouchableOpacity
            style={[s.xcravBtn, item.xcrav === '1' && s.xcravBtnActive]}
            onPress={toggleXcrav}
            activeOpacity={0.8}
          >
            <Text style={[s.xcravBtnText, item.xcrav === '1' && s.xcravBtnTextActive]}>
              {item.xcrav === '1' ? 'Sim' : 'Não'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}
