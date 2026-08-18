import { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  FlatList,
} from 'react-native'
import { useLocalSearchParams, Stack, useRouter } from 'expo-router'
import { Plus, Minus, Search } from 'lucide-react-native'
import { usePedido, useAtualizarPedido } from '../../../../src/hooks/usePedidos'
import { useCatalog } from '../../../../src/hooks/useCatalog'
import { useDebouncedValue } from '../../../../src/hooks/useDebounce'
import { useTransportadoras } from '../../../../src/hooks/useTransportadoras'
import { useCondPags } from '../../../../src/hooks/useCondPags'
import { useFieldVisible, useFieldRequired } from '../../../../src/hooks/useFieldConfig'
import { useAuthStore } from '../../../../src/store/auth.store'
import { fmtMoeda } from '../../../../src/utils/format'
import { getApiErrorMessage } from '../../../../src/lib/errors'
import { colors, spacing, radius } from '../../../../src/theme'
import { Button } from '../../../../src/components/ui/Button'
import { Card } from '../../../../src/components/ui/Card'
import { EmptyState } from '../../../../src/components/ui/EmptyState'
import { Input } from '../../../../src/components/ui/Input'
import { LoadingState } from '../../../../src/components/Skeleton'
import { PickerField } from '../../../../src/components/order-form/PickerField'
import { CartItemEditor } from '../../../../src/components/order-form/CartItemEditor'
import {
  useOrderValidation,
  useOrderFormErrors,
  changedItemFields,
} from '../../../../src/components/order-form/validation'
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

  // Erros de validação exibidos inline (limpos campo a campo conforme o usuário edita)
  const { errors, setErrors, clearError, clearItemErrors, hasErrors: showErrorSummary } = useOrderFormErrors()

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
    clearError('form')
    const existing = cart.find((i) => i.productId === product.id)
    if (existing) {
      setCart((prev) => prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setCart((prev) => [...prev, cartItemFromProduct(product)])
    }
    setSearch('')
  }

  function handleSave() {
    const result = validate({ cart, transportadora, condPag, mennota, notes })
    setErrors(result.errors)
    if (!result.ok) return

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
    return <LoadingState />
  }

  if (!order || order.status !== 'PENDING') {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Este pedido não pode ser editado.</Text>
      </View>
    )
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}>
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
            errors={errors.items[item.productId]}
            onChange={(updated) => {
              clearItemErrors(item.productId, changedItemFields(item, updated))
              setCart((prev) => prev.map((i) => i.productId === item.productId ? updated : i))
            }}
            onRemove={() => {
              clearItemErrors(item.productId)
              setCart((prev) => prev.filter((i) => i.productId !== item.productId))
            }}
          />
        ))}
      </View>

      {/* Adicionar produto */}
      <Button
        variant="secondary"
        style={s.addProductBtn}
        onPress={() => setShowSearch((v) => !v)}
        icon={showSearch
          ? <Minus size={16} color={colors.brand.primary} strokeWidth={1.5} />
          : <Plus  size={16} color={colors.brand.primary} strokeWidth={1.5} />}
      >
        {showSearch ? 'Fechar busca' : 'Adicionar produto'}
      </Button>

      {showSearch && (
        <View style={orderFormStyles.fieldBox}>
          <Input
            placeholder="Buscar produto..."
            value={search}
            onChangeText={setSearch}
            onClear={() => setSearch('')}
            leftElement={<Search size={16} color={colors.neutral.placeholder} strokeWidth={1.5} />}
            containerStyle={s.searchInput}
            autoFocus
          />
          {loadingProducts ? (
            <LoadingState style={s.searchLoading} />
          ) : (
            <FlatList
              data={products}
              keyExtractor={(p) => p.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <Card padding="sm" style={s.productItem} onPress={() => addProduct(item)}>
                  <Text style={s.productItemName}>{item.name}</Text>
                  <Text style={s.productItemSub}>R$ {fmtMoeda(item.price)} / {item.unit}</Text>
                </Card>
              )}
              ListEmptyComponent={
                search.length > 0 ? (
                  <EmptyState
                    illustration="products"
                    title="Nenhum produto encontrado"
                    subtitle={`Não encontramos produtos para "${search}".`}
                  />
                ) : null
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
          onSelect={(item) => {
            clearError('transportadora')
            setTransportadora(item ? (transportadoras.find((t) => t.id === item.id) ?? null) : null)
          }}
          loading={loadingTransp}
          disabled={!canChangeCarrier}
          error={errors.transportadora}
        />
      )}

      {/* Cond. Pagamento */}
      {showCondPag && (
        <PickerField
          label={reqCondPag ? 'Cond. Pagamento *' : 'Cond. Pagamento'}
          selected={condPag ? { id: condPag.id, nome: condPag.nome } : null}
          items={condPags.map((c) => ({ id: c.id, nome: c.nome }))}
          onSelect={(item) => {
            clearError('condPag')
            setCondPag(item ? (condPags.find((c) => c.id === item.id) ?? null) : null)
          }}
          loading={loadingCond}
          disabled={!canChangePaymentTerms}
          error={errors.condPag}
        />
      )}

      {/* Obs. Nota Fiscal */}
      {showMennota && (
        <View style={orderFormStyles.fieldBox}>
          <Text style={orderFormStyles.fieldLabel}>Obs. Nota Fiscal{reqMennota ? ' *' : ''}</Text>
          <Input
            containerStyle={orderFormStyles.notesField}
            style={orderFormStyles.notesInput}
            placeholder="Mensagem para a nota fiscal (opcional)..."
            value={mennota}
            onChangeText={(text) => { clearError('mennota'); setMennota(text) }}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            error={errors.mennota}
          />
        </View>
      )}

      {/* Obs. Interna */}
      {showNotes && (
        <View style={orderFormStyles.fieldBox}>
          <Text style={orderFormStyles.fieldLabel}>Obs. Interna{reqNotes ? ' *' : ''}</Text>
          <Input
            containerStyle={orderFormStyles.notesField}
            style={orderFormStyles.notesInput}
            placeholder="Observação interna (não sai na nota)..."
            value={notes}
            onChangeText={(text) => { clearError('notes'); setNotes(text) }}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            error={errors.notes}
          />
        </View>
      )}

      {/* Total */}
      <Card style={s.totalCard}>
        <Text style={s.totalLabel}>Total do pedido</Text>
        <Text style={s.totalValue}>R$ {fmtMoeda(total)}</Text>
      </Card>

      {showErrorSummary && (
        <Text style={orderFormStyles.formError} accessibilityLiveRegion="polite">
          {errors.form ?? 'Corrija os campos destacados antes de salvar.'}
        </Text>
      )}

      {/* Salvar */}
      <Button
        size="lg"
        style={s.saveBtn}
        onPress={handleSave}
        loading={isSaving}
        disabled={cart.length === 0}
      >
        Salvar alterações
      </Button>

      <Button variant="ghostDanger" style={s.cancelBtn} onPress={() => router.back()} disabled={isSaving}>
        Cancelar
      </Button>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.neutral.bg },
  center:     { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText:  { color: colors.semantic.danger, fontFamily: 'Inter_400Regular' },
  emptyText:  { color: colors.neutral.textSub, fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', paddingVertical: spacing.sm },

  addProductBtn: {
    marginBottom: spacing.sm,
    backgroundColor: colors.neutral.white,
  },

  searchInput: {
    backgroundColor: colors.neutral.bg,
    marginBottom: spacing.sm,
  },
  searchLoading: {
    paddingVertical: spacing.md,
  },
  productItem: {
    marginBottom: spacing.sm,
  },
  productItemName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: colors.brand.dark },
  productItemSub:  { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.neutral.textSub, marginTop: spacing.xs },

  totalCard: {
    borderRadius: radius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  totalLabel: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.neutral.textSub },
  totalValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, color: colors.brand.dark },

  saveBtn: {
    marginBottom: spacing.sm,
  },
  cancelBtn: {
    marginBottom: spacing.sm,
  },
})
