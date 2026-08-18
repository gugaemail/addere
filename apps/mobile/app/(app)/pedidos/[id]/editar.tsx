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
import { useCatalog } from '../../../../src/hooks/useCatalog'
import { useDebouncedValue } from '../../../../src/hooks/useDebounce'
import { useTransportadoras } from '../../../../src/hooks/useTransportadoras'
import { useCondPags } from '../../../../src/hooks/useCondPags'
import { useFieldVisible, useFieldRequired } from '../../../../src/hooks/useFieldConfig'
import { useAuthStore } from '../../../../src/store/auth.store'
import { fmtMoeda } from '../../../../src/utils/format'
import { getApiErrorMessage } from '../../../../src/lib/errors'
import { colors } from '../../../../src/theme/colors'
import { PickerField } from '../../../../src/components/order-form/PickerField'
import { CartItemEditor } from '../../../../src/components/order-form/CartItemEditor'
import { useOrderValidation } from '../../../../src/components/order-form/validation'
import { orderFormStyles } from '../../../../src/components/order-form/styles'
import { cartItemFromOrderItem, cartItemFromProduct, cartTotal, cartToOrderItems } from '../../../../src/components/order-form/types'
import type { CartItem } from '../../../../src/components/order-form/types'
import type { Product, Transportadora, CondPag } from '@addere/types'

export default function EditarPedidoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const { data: order, isLoading: loadingOrder } = usePedido(id)
  const { mutate: atualizar, isPending: isSaving } = useAtualizarPedido()

  const [cart, setCart] = useState<CartItem[]>([])
  const [transportadora, setTransportadora] = useState<Transportadora | null>(null)
  const [condPag, setCondPag] = useState<CondPag | null>(null)
  const [mennota, setMennota] = useState('')
  const [notes, setNotes] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)

  const { data: transportadoras = [], isLoading: loadingTransp } = useTransportadoras()
  const { data: condPags = [], isLoading: loadingCond }          = useCondPags()
  const { data: products = [], isLoading: loadingProducts }      = useCatalog(debouncedSearch || undefined)

  const permissions = useAuthStore((s) => s.permissions)
  const canChangeCarrier = permissions.includes('orders.change_carrier')
  const canChangePaymentTerms = permissions.includes('orders.change_payment_terms')

  const showTransportadora = useFieldVisible('order.transportadora')
  const showCondPag        = useFieldVisible('order.condPag')
  const showMennota        = useFieldVisible('order.mennota')
  const showNotes          = useFieldVisible('order.notes')

  const reqTransportadora  = useFieldRequired('order.transportadora')
  const reqCondPag         = useFieldRequired('order.condPag')
  const reqMennota         = useFieldRequired('order.mennota')
  const reqNotes           = useFieldRequired('order.notes')

  const validate = useOrderValidation({
    emptyCart:      'Adicione pelo menos um produto antes de salvar.',
    transportadora: 'Selecione uma transportadora.',
    condPag:        'Selecione uma condição de pagamento.',
  })

  useEffect(() => {
    if (!order || initialized) return
    setCart(order.items.map(cartItemFromOrderItem))
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

  const total = cartTotal(cart)

  function addProduct(product: Product) {
    const existing = cart.find((i) => i.productId === product.id)
    if (existing) {
      setCart((prev) => prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setCart((prev) => [...prev, cartItemFromProduct(product)])
    }
    setSearch('')
  }

  function handleSave() {
    if (!validate({ cart, transportadora, condPag, mennota, notes })) return

    atualizar(
      {
        id,
        input: {
          transportId: transportadora?.id,
          condId:      condPag?.id,
          mennota:     mennota || undefined,
          notes:       notes   || undefined,
          items:       cartToOrderItems(cart),
        },
      },
      {
        onSuccess: () => {
          Alert.alert('Sucesso', 'Pedido atualizado com sucesso!', [
            { text: 'OK', onPress: () => router.back() },
          ])
        },
        onError: (err: unknown) => {
          Alert.alert('Erro', getApiErrorMessage(err, 'Não foi possível salvar as alterações.'))
        },
      }
    )
  }

  if (loadingOrder || !initialized) {
    return <ActivityIndicator style={{ flex: 1, marginTop: 40 }} color={colors.brand.primary} />
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
      <View style={orderFormStyles.fieldBox}>
        <Text style={orderFormStyles.fieldLabel}>Itens ({cart.length})</Text>

        {cart.length === 0 && (
          <Text style={s.emptyText}>Nenhum item. Adicione um produto abaixo.</Text>
        )}

        {cart.map((item) => (
          <CartItemEditor
            key={item.productId}
            item={item}
            onChange={(updated) => setCart((prev) => prev.map((i) => i.productId === item.productId ? updated : i))}
            onRemove={() => setCart((prev) => prev.filter((i) => i.productId !== item.productId))}
          />
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
        <View style={orderFormStyles.fieldBox}>
          <TextInput
            style={s.searchInput}
            placeholder="Buscar produto..."
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {loadingProducts ? (
            <ActivityIndicator style={{ marginTop: 8 }} color={colors.brand.primary} />
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
          disabled={!canChangeCarrier}
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
          disabled={!canChangePaymentTerms}
        />
      )}

      {/* Obs. Nota Fiscal */}
      {showMennota && (
        <View style={orderFormStyles.fieldBox}>
          <Text style={orderFormStyles.fieldLabel}>Obs. Nota Fiscal{reqMennota ? ' *' : ''}</Text>
          <TextInput
            style={orderFormStyles.notesInput}
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
        <View style={orderFormStyles.fieldBox}>
          <Text style={orderFormStyles.fieldLabel}>Obs. Interna{reqNotes ? ' *' : ''}</Text>
          <TextInput
            style={orderFormStyles.notesInput}
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
  container:  { flex: 1, backgroundColor: colors.neutral.bg },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText:  { color: colors.semantic.danger, fontFamily: 'Inter_400Regular' },
  emptyText:  { color: colors.neutral.textSub, fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  addProductBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.brand.primary,
    borderStyle: 'dashed',
    padding: 12,
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: colors.neutral.white,
  },
  addProductBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.brand.primary,
  },

  searchInput: {
    backgroundColor: colors.neutral.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: 10,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    marginBottom: 8,
    color: colors.brand.dark,
  },
  productItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.bg,
  },
  productItemName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: colors.brand.dark },
  productItemSub:  { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.neutral.textSub, marginTop: 2 },

  totalCard: {
    backgroundColor: colors.neutral.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.neutral.textSub },
  totalValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, color: colors.brand.dark },

  saveBtn: {
    backgroundColor: colors.brand.primary,
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  saveBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    color: colors.neutral.white,
  },
  cancelBtn: {
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  cancelBtnText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: colors.semantic.danger,
  },
})
