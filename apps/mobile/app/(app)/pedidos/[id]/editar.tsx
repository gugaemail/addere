import { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  FlatList,
} from 'react-native'
import { useLocalSearchParams, Stack, useRouter } from 'expo-router'
import { usePedido, useAtualizarPedido } from '../../../../src/hooks/usePedidos'
import { useProdutos } from '../../../../src/hooks/useProdutos'
import { useTransportadoras } from '../../../../src/hooks/useTransportadoras'
import { useCondPags } from '../../../../src/hooks/useCondPags'
import { useFieldVisible, useFieldRequired } from '../../../../src/hooks/useFieldConfig'
import { fmtMoeda } from '../../../../src/utils/format'
import type { Product, Transportadora, CondPag } from '@addere/types'

interface EditCartItem {
  productId:    string
  productName:  string
  productUnit:  string
  quantity:     number
  unitPrice:    number
  discount:     number
  descricao?:   string
  largura?:     number
  espessura?:   number
  encolhimento?: string
  xcrav?:       string
  tara?:        number
}

function PickerField({
  label,
  selected,
  items,
  onSelect,
  loading,
}: {
  label: string
  selected: { id: string; nome: string } | null
  items: { id: string; nome: string }[]
  onSelect: (item: { id: string; nome: string } | null) => void
  loading?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <View style={s.box}>
      <Text style={s.boxLabel}>{label}</Text>
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

export default function EditarPedidoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const { data: order, isLoading: loadingOrder } = usePedido(id)
  const { mutate: atualizar, isPending: isSaving } = useAtualizarPedido()

  const [cart, setCart] = useState<EditCartItem[]>([])
  const [transportadora, setTransportadora] = useState<Transportadora | null>(null)
  const [condPag, setCondPag] = useState<CondPag | null>(null)
  const [mennota, setMennota] = useState('')
  const [notes, setNotes] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')

  const { data: transportadoras = [], isLoading: loadingTransp } = useTransportadoras()
  const { data: condPags = [], isLoading: loadingCond }          = useCondPags()
  const { data: products = [], isLoading: loadingProducts }       = useProdutos(search || undefined)

  const showTransportadora  = useFieldVisible('order.transportadora')
  const showCondPag         = useFieldVisible('order.condPag')
  const showMennota         = useFieldVisible('order.mennota')
  const showNotes           = useFieldVisible('order.notes')
  const showUnitPrice       = useFieldVisible('orderItem.unitPrice')
  const showLargura         = useFieldVisible('orderItem.largura')
  const showEspessura       = useFieldVisible('orderItem.espessura')
  const showEncolhimento    = useFieldVisible('orderItem.encolhimento')
  const showXcrav           = useFieldVisible('orderItem.xcrav')
  const showTara            = useFieldVisible('orderItem.tara')
  const showDescricao       = useFieldVisible('orderItem.descricao')

  const reqTransportadora   = useFieldRequired('order.transportadora')
  const reqCondPag          = useFieldRequired('order.condPag')
  const reqMennota          = useFieldRequired('order.mennota')
  const reqNotes            = useFieldRequired('order.notes')
  const reqUnitPrice        = useFieldRequired('orderItem.unitPrice')
  const reqLargura          = useFieldRequired('orderItem.largura')
  const reqEspessura        = useFieldRequired('orderItem.espessura')
  const reqEncolhimento     = useFieldRequired('orderItem.encolhimento')
  const reqXcrav            = useFieldRequired('orderItem.xcrav')
  const reqTara             = useFieldRequired('orderItem.tara')
  const reqDescricao        = useFieldRequired('orderItem.descricao')

  useEffect(() => {
    if (!order || initialized) return
    setCart(order.items.map((item) => ({
      productId:    item.product.id,
      productName:  item.product.name,
      productUnit:  item.product.unit,
      quantity:     Number(item.quantity),
      unitPrice:    Number(item.unitPrice),
      discount:     Number(item.discount),
      descricao:    item.descricao ?? undefined,
      largura:      item.largura != null ? Number(item.largura) : undefined,
      espessura:    item.espessura != null ? Number(item.espessura) : undefined,
      encolhimento: item.encolhimento ?? undefined,
      xcrav:        item.xcrav ?? undefined,
      tara:         item.tara != null ? Number(item.tara) : undefined,
    })))
    setMennota(order.mennota ?? '')
    setNotes(order.notes ?? '')
    if (order.transportadora) {
      setTransportadora({ id: order.transportadora.id, nome: order.transportadora.nome, protheusCode: null })
    }
    if (order.condPag) {
      setCondPag({ id: order.condPag.id, nome: order.condPag.nome, protheusCode: null })
    }
    setInitialized(true)
  }, [order, initialized])

  const total = cart.reduce(
    (sum, i) => sum + i.unitPrice * i.quantity * (1 - i.discount / 100),
    0
  )

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId))
      return
    }
    setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, quantity: qty } : i))
  }

  function updatePrice(productId: string, raw: string) {
    const value = parseFloat(raw.replace(',', '.'))
    if (isNaN(value) || value < 0) return
    setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, unitPrice: value } : i))
  }

  function updateNumField(productId: string, field: 'largura' | 'espessura' | 'tara', raw: string) {
    const value = parseFloat(raw.replace(',', '.'))
    if (isNaN(value) || value < 0) return
    setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, [field]: value } : i))
  }

  function updateStrField(productId: string, field: 'encolhimento' | 'descricao', value: string) {
    setCart((prev) => prev.map((i) => i.productId === productId ? { ...i, [field]: value } : i))
  }

  function toggleXcrav(productId: string) {
    setCart((prev) => prev.map((i) =>
      i.productId === productId ? { ...i, xcrav: i.xcrav === '1' ? '2' : '1' } : i
    ))
  }

  function removeItem(productId: string) {
    setCart((prev) => prev.filter((i) => i.productId !== productId))
  }

  function addProduct(product: Product) {
    const existing = cart.find((i) => i.productId === product.id)
    if (existing) {
      setCart((prev) => prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setCart((prev) => [...prev, {
        productId:   product.id,
        productName: product.name,
        productUnit: product.unit,
        quantity:    1,
        unitPrice:   Number(product.price),
        discount:    0,
      }])
    }
    setSearch('')
  }

  function handleSave() {
    if (cart.length === 0) return
    atualizar(
      {
        id,
        input: {
          transportId: transportadora?.id,
          condId:      condPag?.id,
          mennota:     mennota || undefined,
          notes:       notes   || undefined,
          items: cart.map((i) => ({
            productId:    i.productId,
            quantity:     i.quantity,
            unitPrice:    i.unitPrice,
            discount:     i.discount,
            descricao:    i.descricao,
            largura:      i.largura,
            espessura:    i.espessura,
            encolhimento: i.encolhimento,
            xcrav:        i.xcrav as '1' | '2' | undefined,
            tara:         i.tara,
          })),
        },
      },
      {
        onSuccess: () => {
          Alert.alert('Sucesso', 'Pedido atualizado com sucesso!', [
            { text: 'OK', onPress: () => router.back() },
          ])
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
            ?? 'Não foi possível salvar as alterações.'
          Alert.alert('Erro', msg)
        },
      }
    )
  }

  if (loadingOrder || !initialized) {
    return <ActivityIndicator style={{ flex: 1, marginTop: 40 }} color="#1B4FA8" />
  }

  if (!order || order.status !== 'PENDING') {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Este pedido não pode ser editado.</Text>
      </View>
    )
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Stack.Screen options={{ title: 'Editar pedido' }} />

      {/* Itens */}
      <View style={s.box}>
        <Text style={s.boxLabel}>Itens ({cart.length})</Text>

        {cart.length === 0 && (
          <Text style={s.emptyText}>Nenhum item. Adicione um produto abaixo.</Text>
        )}

        {cart.map((item) => (
          <View key={item.productId} style={s.itemRow}>
            <View style={s.itemHeader}>
              <Text style={s.itemName} numberOfLines={2}>{item.productName}</Text>
              <TouchableOpacity onPress={() => removeItem(item.productId)} style={s.removeBtn}>
                <Text style={s.removeBtnText}>×</Text>
              </TouchableOpacity>
            </View>

            <View style={s.itemControls}>
              <View style={s.itemQty}>
                <Text style={s.controlLabel}>Qtd</Text>
                <View style={s.qtyRow}>
                  <TouchableOpacity onPress={() => updateQty(item.productId, item.quantity - 1)}>
                    <Text style={s.qtyBtn}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.qtyNum}>{item.quantity}</Text>
                  <TouchableOpacity onPress={() => updateQty(item.productId, item.quantity + 1)}>
                    <Text style={s.qtyBtn}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {showUnitPrice && (
                <View style={s.itemPrice}>
                  <Text style={s.controlLabel}>Preço unit. (R$){reqUnitPrice ? ' *' : ''}</Text>
                  <TextInput
                    style={s.priceInput}
                    keyboardType="decimal-pad"
                    defaultValue={item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    onEndEditing={(e) => updatePrice(item.productId, e.nativeEvent.text)}
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

            {showDescricao && (
              <View style={s.itemExtraFull}>
                <Text style={s.controlLabel}>Descrição{reqDescricao ? ' *' : ''}</Text>
                <TextInput
                  style={s.priceInput}
                  placeholder="Descrição do item"
                  defaultValue={item.descricao ?? ''}
                  onEndEditing={(e) => updateStrField(item.productId, 'descricao', e.nativeEvent.text)}
                />
              </View>
            )}

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
                      onEndEditing={(e) => updateNumField(item.productId, 'largura', e.nativeEvent.text)}
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
                      onEndEditing={(e) => updateNumField(item.productId, 'espessura', e.nativeEvent.text)}
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
                      onEndEditing={(e) => updateNumField(item.productId, 'tara', e.nativeEvent.text)}
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
                  onEndEditing={(e) => updateStrField(item.productId, 'encolhimento', e.nativeEvent.text)}
                />
              </View>
            )}

            {showXcrav && (
              <View style={s.itemExtraFull}>
                <Text style={s.controlLabel}>Largura Crav.{reqXcrav ? ' *' : ''}</Text>
                <TouchableOpacity
                  style={[s.xcravBtn, item.xcrav === '1' && s.xcravBtnActive]}
                  onPress={() => toggleXcrav(item.productId)}
                  activeOpacity={0.8}
                >
                  <Text style={[s.xcravBtnText, item.xcrav === '1' && s.xcravBtnTextActive]}>
                    {item.xcrav === '1' ? 'Sim' : 'Não'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Adicionar produto */}
      <TouchableOpacity
        style={s.addProductBtn}
        onPress={() => setShowSearch((v) => !v)}
        activeOpacity={0.8}
      >
        <Text style={s.addProductBtnText}>{showSearch ? '− Fechar busca' : '+ Adicionar produto'}</Text>
      </TouchableOpacity>

      {showSearch && (
        <View style={s.box}>
          <TextInput
            style={s.searchInput}
            placeholder="Buscar produto..."
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {loadingProducts ? (
            <ActivityIndicator style={{ marginTop: 8 }} color="#1B4FA8" />
          ) : (
            <FlatList
              data={products}
              keyExtractor={(p) => p.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.productItem} onPress={() => addProduct(item)}>
                  <Text style={s.productItemName}>{item.name}</Text>
                  <Text style={s.productItemSub}>R$ {fmtMoeda(item.price)} / {item.unit}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                search.length > 0 ? <Text style={s.emptyText}>Nenhum produto encontrado.</Text> : null
              }
            />
          )}
        </View>
      )}

      {/* Transportadora */}
      {showTransportadora && (
        <PickerField
          label={reqTransportadora ? 'Transportadora *' : 'Transportadora'}
          selected={transportadora ? { id: transportadora.id, nome: transportadora.nome } : null}
          items={transportadoras.map((t) => ({ id: t.id, nome: t.nome }))}
          onSelect={(item) => setTransportadora(item ? (transportadoras.find((t) => t.id === item.id) ?? null) : null)}
          loading={loadingTransp}
        />
      )}

      {/* Cond. Pagamento */}
      {showCondPag && (
        <PickerField
          label={reqCondPag ? 'Cond. Pagamento *' : 'Cond. Pagamento'}
          selected={condPag ? { id: condPag.id, nome: condPag.nome } : null}
          items={condPags.map((c) => ({ id: c.id, nome: c.nome }))}
          onSelect={(item) => setCondPag(item ? (condPags.find((c) => c.id === item.id) ?? null) : null)}
          loading={loadingCond}
        />
      )}

      {/* Obs. Nota Fiscal */}
      {showMennota && (
        <View style={s.box}>
          <Text style={s.boxLabel}>Obs. Nota Fiscal{reqMennota ? ' *' : ''}</Text>
          <TextInput
            style={s.notesInput}
            placeholder="Mensagem para a nota fiscal (opcional)..."
            value={mennota}
            onChangeText={setMennota}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      )}

      {/* Obs. Interna */}
      {showNotes && (
        <View style={s.box}>
          <Text style={s.boxLabel}>Obs. Interna{reqNotes ? ' *' : ''}</Text>
          <TextInput
            style={s.notesInput}
            placeholder="Observação interna (não sai na nota)..."
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      )}

      {/* Total */}
      <View style={s.totalCard}>
        <Text style={s.totalLabel}>Total do pedido</Text>
        <Text style={s.totalValue}>R$ {fmtMoeda(total)}</Text>
      </View>

      {/* Salvar */}
      <TouchableOpacity
        style={[s.saveBtn, (isSaving || cart.length === 0) && { opacity: 0.5 }]}
        onPress={handleSave}
        disabled={isSaving || cart.length === 0}
        activeOpacity={0.8}
      >
        {isSaving
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.saveBtnText}>Salvar alterações</Text>
        }
      </TouchableOpacity>

      <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()} disabled={isSaving}>
        <Text style={s.cancelBtnText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#F8FAFC' },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText:  { color: '#EF4444', fontFamily: 'Inter_400Regular' },
  emptyText:  { color: '#94A3B8', fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  box: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 10,
  },
  boxLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    color: '#64748B',
    marginBottom: 10,
  },

  itemRow: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    marginTop: 6,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  itemName: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#0D2045',
    marginRight: 8,
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeBtnText: { color: '#DC2626', fontSize: 18, fontWeight: '700', lineHeight: 22 },

  itemControls:  { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemQty:       { alignItems: 'center' },
  itemPrice:     { flex: 1, alignItems: 'flex-start' },
  itemSubtotal:  { alignItems: 'flex-end' },
  controlLabel:  { fontFamily: 'Inter_400Regular', fontSize: 10, color: '#94A3B8', marginBottom: 4 },
  qtyRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn:        { fontSize: 20, color: '#1B4FA8', paddingHorizontal: 4 },
  qtyNum:        { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, minWidth: 20, textAlign: 'center', color: '#0D2045' },
  priceInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    padding: 6,
    fontSize: 13,
    minWidth: 80,
    backgroundColor: '#F8FAFC',
    fontFamily: 'Inter_400Regular',
    color: '#0D2045',
  },
  subtotalValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: '#0D2045' },

  itemExtraRow:   { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  itemExtraField: { flex: 1, minWidth: 80 },
  itemExtraFull:  { marginTop: 8 },
  xcravBtn: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#F8FAFC',
  },
  xcravBtnActive:     { backgroundColor: '#1B4FA8', borderColor: '#1B4FA8' },
  xcravBtnText:       { fontFamily: 'Inter_400Regular', fontSize: 13, color: '#475569' },
  xcravBtnTextActive: { color: '#FFFFFF' },

  addProductBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1B4FA8',
    borderStyle: 'dashed',
    padding: 12,
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
  },
  addProductBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: '#1B4FA8',
  },

  searchInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 8,
    color: '#0D2045',
  },
  productItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  productItemName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: '#0D2045' },
  productItemSub:  { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#64748B', marginTop: 2 },

  pickerBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#F8FAFC',
  },
  pickerBtnText:        { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#0D2045' },
  pickerBtnPlaceholder: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#94A3B8' },
  pickerBtnIcon:        { fontSize: 12, color: '#64748B' },
  pickerList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  pickerItem:         { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pickerItemText:     { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#475569' },
  pickerItemSelected: { fontFamily: 'PlusJakartaSans_600SemiBold', color: '#1B4FA8' },

  notesInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    minHeight: 80,
    backgroundColor: '#F8FAFC',
    color: '#0D2045',
  },

  totalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: '#64748B' },
  totalValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, color: '#0D2045' },

  saveBtn: {
    backgroundColor: '#1B4FA8',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  saveBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  cancelBtn: {
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  cancelBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: '#EF4444',
  },
})
