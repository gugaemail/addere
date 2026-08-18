import { useState, useCallback, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native'
import { useRouter, Stack } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { useClientes } from '../../../src/hooks/useClientes'
import { useCatalog } from '../../../src/hooks/useCatalog'
import { useBranches } from '../../../src/hooks/useBranches'
import { useDebouncedValue } from '../../../src/hooks/useDebounce'
import { submitOrder, startOrderSession } from '../../../src/utils/createOrder'
import { useTransportadoras } from '../../../src/hooks/useTransportadoras'
import { useCondPags } from '../../../src/hooks/useCondPags'
import { useFieldVisible, useFieldRequired } from '../../../src/hooks/useFieldConfig'
import { useAuthStore } from '../../../src/store/auth.store'
import { colors } from '../../../src/theme/colors'
import { PickerField } from '../../../src/components/order-form/PickerField'
import { CartItemEditor } from '../../../src/components/order-form/CartItemEditor'
import { useOrderValidation } from '../../../src/components/order-form/validation'
import { orderFormStyles } from '../../../src/components/order-form/styles'
import { cartItemFromProduct, cartTotal, cartToOrderItems } from '../../../src/components/order-form/types'
import type { CartItem } from '../../../src/components/order-form/types'
import type { Branch, Customer, Product, Transportadora, CondPag, CreateOrderItemInput } from '@addere/types'
import { fmtMoeda, formatDocument } from '../../../src/utils/format'
import { getApiErrorMessage } from '../../../src/lib/errors'

type Step = 1 | 2 | 3

function StepIndicator({ current }: { current: Step }) {
  return (
    <View style={styles.steps}>
      {([1, 2, 3] as Step[]).map((s) => (
        <View key={s} style={[styles.step, current >= s && styles.stepActive]}>
          <Text style={[styles.stepText, current >= s && styles.stepTextActive]}>{s}</Text>
        </View>
      ))}
    </View>
  )
}

// ─── Step 1: Seleção de cliente e filial ─────────────────────────────────

function Step1({
  onComplete,
}: {
  onComplete: (customer: Customer, branch: Branch) => void
}) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const { data: customers, isLoading: loadingCustomers } = useClientes(debouncedSearch || undefined)
  const { data: branches, isLoading: loadingBranches } = useBranches()

  if (selectedCustomer) {
    return (
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={styles.selectedCard} onPress={() => setSelectedCustomer(null)}>
          <Text style={styles.selectedCardLabel}>Cliente selecionado</Text>
          <Text style={styles.selectedCardValue}>{selectedCustomer.name}</Text>
          <Text style={styles.selectedCardChange}>Trocar →</Text>
        </TouchableOpacity>

        <Text style={[styles.stepTitle, { marginTop: 16 }]}>Selecione a filial</Text>

        {loadingBranches ? (
          <ActivityIndicator style={{ marginTop: 16 }} />
        ) : (
          <FlatList
            data={branches}
            keyExtractor={(b) => b.id}
            renderItem={({ item, index }) => (
              <TouchableOpacity
                testID={`btn-adicionar-produto-${index}`}
                style={styles.listItem}
                onPress={() => onComplete(selectedCustomer, item)}
              >
                <Text style={styles.listItemTitle}>{item.name}</Text>
                {item.cnpj && <Text style={styles.listItemSub}>{formatDocument(item.cnpj)}</Text>}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Nenhuma filial encontrada.</Text>}
          />
        )}
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.stepTitle}>Selecione o cliente</Text>
      <TextInput
        testID="input-busca-cliente"
        style={styles.input}
        placeholder="Buscar cliente..."
        value={search}
        onChangeText={setSearch}
      />
      {loadingCustomers ? (
        <ActivityIndicator style={{ marginTop: 16 }} />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c.id}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              testID={`resultado-cliente-${index}`}
              style={styles.listItem}
              onPress={() => setSelectedCustomer(item)}
            >
              <Text style={styles.listItemTitle}>{item.name}</Text>
              {item.document && <Text style={styles.listItemSub}>{formatDocument(item.document)}</Text>}
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum cliente encontrado.</Text>}
        />
      )}
    </View>
  )
}

// ─── Step 2: Adicionar produtos ───────────────────────────────────────────

function Step2({
  cart,
  onCartChange,
  onBack,
}: {
  cart: CartItem[]
  onCartChange: (cart: CartItem[]) => void
  onBack: () => void
}) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const { data: products, isLoading, isFromCache } = useCatalog(debouncedSearch || undefined)

  function addToCart(product: Product) {
    const existing = cart.find((i) => i.productId === product.id)
    if (existing) {
      onCartChange(cart.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      onCartChange([...cart, cartItemFromProduct(product)])
    }
  }

  function removeFromCart(productId: string) {
    onCartChange(cart.filter((i) => i.productId !== productId))
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) { removeFromCart(productId); return }
    onCartChange(cart.map((i) => i.productId === productId ? { ...i, quantity: qty } : i))
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={styles.stepTitle}>Adicionar produtos</Text>
        {isFromCache && (
          <View testID="cache-badge" style={{ marginLeft: 8, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: colors.semantic.warning, borderRadius: 6 }}>
            <Text style={{ fontSize: 10, color: '#fff', fontFamily: 'Inter_400Regular' }}>cache</Text>
          </View>
        )}
      </View>
      <TextInput style={styles.input} placeholder="Buscar produto..." value={search} onChangeText={setSearch} />

      {cart.length > 0 && (
        <View style={styles.cartBox}>
          <Text style={styles.cartTitle}>Carrinho ({cart.length})</Text>
          {cart.map((item) => (
            <View key={item.productId} style={styles.cartRow}>
              <Text style={styles.cartName} numberOfLines={1}>{item.productName}</Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity onPress={() => updateQty(item.productId, item.quantity - 1)}>
                  <Text style={styles.qtyBtn}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyNum}>{item.quantity}</Text>
                <TouchableOpacity onPress={() => updateQty(item.productId, item.quantity + 1)}>
                  <Text style={styles.qtyBtn}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 8 }} />
      ) : (
        <FlatList
          testID="produto-lista"
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              testID={`produto-${index}`}
              style={styles.listItem}
              onPress={() => addToCart(item)}
            >
              <Text style={styles.listItemTitle}>{item.name}</Text>
              <Text style={styles.listItemSub}>R$ {fmtMoeda(item.price)} / {item.unit}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum produto encontrado.</Text>}
        />
      )}

      <TouchableOpacity style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>← Voltar</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Step 3: Resumo e confirmação (editável) ──────────────────────────────

function Step3({
  customer,
  branch,
  cart,
  mennota,
  notes,
  transportadora,
  condPag,
  onCartChange,
  onMennotaChange,
  onNotesChange,
  onTransportChange,
  onCondChange,
  onConfirm,
  onBack,
  onCancel,
  isLoading,
}: {
  customer: Customer
  branch: Branch
  cart: CartItem[]
  mennota: string
  notes: string
  transportadora: Transportadora | null
  condPag: CondPag | null
  onCartChange: (cart: CartItem[]) => void
  onMennotaChange: (mennota: string) => void
  onNotesChange: (notes: string) => void
  onTransportChange: (t: Transportadora | null) => void
  onCondChange: (c: CondPag | null) => void
  onConfirm: () => void
  onBack: () => void
  onCancel: () => void
  isLoading: boolean
}) {
  const { data: transportadoras = [], isLoading: loadingTransp } = useTransportadoras()
  const { data: condPags = [], isLoading: loadingCond } = useCondPags()
  const permissions = useAuthStore((s) => s.permissions)
  const canChangeCarrier = permissions.includes('orders.change_carrier')
  const canChangePaymentTerms = permissions.includes('orders.change_payment_terms')
  const showTransportadora = useFieldVisible('order.transportadora')
  const showCondPag        = useFieldVisible('order.condPag')
  const showMennota        = useFieldVisible('order.mennota')
  const showNotes          = useFieldVisible('order.notes')

  const reqTransportadora = useFieldRequired('order.transportadora')
  const reqCondPag        = useFieldRequired('order.condPag')
  const reqMennota        = useFieldRequired('order.mennota')
  const reqNotes          = useFieldRequired('order.notes')

  const validate = useOrderValidation({
    emptyCart:      'Adicione pelo menos um produto antes de confirmar.',
    transportadora: 'Selecione uma transportadora antes de confirmar.',
    condPag:        'Selecione uma condição de pagamento antes de confirmar.',
  })

  const total = cartTotal(cart)

  function handleCancel() {
    Alert.alert(
      'Cancelar pedido',
      'Tem certeza que deseja cancelar? Os dados serão perdidos.',
      [
        { text: 'Não', style: 'cancel' },
        { text: 'Sim, cancelar', style: 'destructive', onPress: onCancel },
      ]
    )
  }

  function handleConfirmWithValidation() {
    if (!validate({ cart, transportadora, condPag, mennota, notes })) return
    onConfirm()
  }

  return (
    <ScrollView>
      <Text style={styles.stepTitle}>Resumo do pedido</Text>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryLabel}>Cliente</Text>
        <Text style={styles.summaryValue}>{customer.name}</Text>
      </View>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryLabel}>Filial</Text>
        <Text style={styles.summaryValue}>{branch.name}</Text>
      </View>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryLabel}>Itens</Text>
        {cart.length === 0 && (
          <Text style={styles.empty}>Nenhum item. Volte e adicione produtos.</Text>
        )}
        {cart.map((item) => (
          <CartItemEditor
            key={item.productId}
            item={item}
            onChange={(updated) => onCartChange(cart.map((i) => i.productId === item.productId ? updated : i))}
            onRemove={() => onCartChange(cart.filter((i) => i.productId !== item.productId))}
          />
        ))}
      </View>

      {showTransportadora && (
        <PickerField
          label={reqTransportadora ? 'Transportadora *' : 'Transportadora'}
          selected={transportadora ? { id: transportadora.id, nome: transportadora.nome } : null}
          items={transportadoras.map((t) => ({ id: t.id, nome: t.nome }))}
          onSelect={(item) => onTransportChange(item ? (transportadoras.find((t) => t.id === item.id) ?? null) : null)}
          loading={loadingTransp}
          disabled={!canChangeCarrier}
        />
      )}

      {showCondPag && (
        <PickerField
          label={reqCondPag ? 'Cond. Pagamento *' : 'Cond. Pagamento'}
          selected={condPag ? { id: condPag.id, nome: condPag.nome } : null}
          items={condPags.map((c) => ({ id: c.id, nome: c.nome }))}
          onSelect={(item) => onCondChange(item ? (condPags.find((c) => c.id === item.id) ?? null) : null)}
          loading={loadingCond}
          disabled={!canChangePaymentTerms}
        />
      )}

      {showMennota && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Obs. Nota Fiscal{reqMennota ? ' *' : ''}</Text>
          <TextInput
            style={orderFormStyles.notesInput}
            placeholder="Mensagem para a nota fiscal (opcional)..."
            value={mennota}
            onChangeText={onMennotaChange}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      )}

      {showNotes && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Obs. Interna{reqNotes ? ' *' : ''}</Text>
          <TextInput
            style={orderFormStyles.notesInput}
            placeholder="Observação interna (não sai na nota)..."
            value={notes}
            onChangeText={onNotesChange}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>
      )}

      <View style={[styles.summaryBox, { flexDirection: 'row', justifyContent: 'space-between' }]}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>R$ {fmtMoeda(total)}</Text>
      </View>

      <TouchableOpacity
        testID="btn-confirmar-pedido"
        style={[styles.confirmBtn, cart.length === 0 && { opacity: 0.4 }]}
        onPress={handleConfirmWithValidation}
        disabled={isLoading || cart.length === 0}
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Confirmar pedido</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={onBack} disabled={isLoading}>
        <Text style={styles.backBtnText}>← Voltar</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} disabled={isLoading}>
        <Text style={styles.cancelBtnText}>Cancelar</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

// ─── Tela principal ───────────────────────────────────────────────────────

export default function NovoPedidoScreen() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [branch, setBranch] = useState<Branch | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])
  const [mennota, setMennota] = useState('')
  const [notes, setNotes] = useState('')
  const [transportadora, setTransportadora] = useState<Transportadora | null>(null)
  const [condPag, setCondPag] = useState<CondPag | null>(null)

  const [isPending, setIsPending] = useState(false)
  const { data: transportadoras = [] } = useTransportadoras()
  const { data: condPags = [] }        = useCondPags()

  // Reseta o formulário toda vez que a tela ganha foco.
  // Necessário porque o Tab Navigator mantém a tela montada em memória
  // mesmo quando não está visível (href: null no _layout).
  useFocusEffect(
    useCallback(() => {
      setStep(1)
      setCustomer(null)
      setBranch(null)
      setCart([])
      setMennota('')
      setNotes('')
      setTransportadora(null)
      setCondPag(null)
      setIsPending(false)
      // Marca o início da sessão de pedido para medir a duração no tracking
      startOrderSession()
    }, [])
  )

  // Auto-preenche transportadora e condPag a partir dos padrões do cliente
  useEffect(() => {
    if (!customer) return
    const t = customer.transpPadrao
      ? transportadoras.find((x) => x.protheusCode === customer.transpPadrao) ?? null
      : null
    const c = customer.condPagPadrao
      ? condPags.find((x) => x.protheusCode === customer.condPagPadrao) ?? null
      : null
    setTransportadora(t)
    setCondPag(c)
  }, [customer?.id, transportadoras, condPags])

  function handleStep1Complete(c: Customer, b: Branch) {
    setCustomer(c)
    setBranch(b)
    setStep(2)
  }

  async function handleConfirm() {
    if (!customer || !branch || cart.length === 0) return

    setIsPending(true)

    const items: CreateOrderItemInput[] = cartToOrderItems(cart)

    try {
      const result = await submitOrder({
        customerId:  customer.id,
        branchId:    branch.id,
        items,
        mennota:     mennota      || undefined,
        notes:       notes        || undefined,
        transportId: transportadora?.id,
        condId:      condPag?.id,
      })

      setIsPending(false)

      if (result.synced) {
        Alert.alert('Pedido criado', 'Pedido salvo com sucesso!', [
          { text: 'OK', onPress: () => router.replace('/(app)/pedidos') },
        ])
      } else {
        Alert.alert(
          'Pedido salvo offline',
          'Sem conexão. O pedido foi salvo e será enviado automaticamente ao reconectar.',
          [{ text: 'OK', onPress: () => router.replace('/(app)/pedidos') }],
        )
      }
    } catch (err: unknown) {
      setIsPending(false)
      Alert.alert('Erro ao criar pedido', getApiErrorMessage(err, 'Verifique os dados e tente novamente.'))
    }
  }

  const stepLabel = ['Selecionar cliente / filial', 'Adicionar produtos', 'Confirmar']

  return (
    <View style={{ flex: 1, backgroundColor: colors.neutral.bg }}>
      <Stack.Screen options={{ title: `Novo pedido — ${stepLabel[step - 1]}` }} />
      <StepIndicator current={step} />

      <View style={{ flex: 1, padding: 16 }}>
        {step === 1 && <Step1 onComplete={handleStep1Complete} />}
        {step === 2 && (
          <View style={{ flex: 1 }}>
            <Step2 cart={cart} onCartChange={setCart} onBack={() => setStep(1)} />
            <TouchableOpacity
              testID="btn-proximo-step"
              style={[styles.confirmBtn, cart.length === 0 && { opacity: 0.4 }]}
              disabled={cart.length === 0}
              onPress={() => setStep(3)}
            >
              <Text style={styles.confirmBtnText}>Próximo →</Text>
            </TouchableOpacity>
          </View>
        )}
        {step === 3 && customer && branch && (
          <Step3
            customer={customer}
            branch={branch}
            cart={cart}
            mennota={mennota}
            notes={notes}
            transportadora={transportadora}
            condPag={condPag}
            onCartChange={setCart}
            onMennotaChange={setMennota}
            onNotesChange={setNotes}
            onTransportChange={setTransportadora}
            onCondChange={setCondPag}
            onConfirm={handleConfirm}
            onBack={() => setStep(2)}
            onCancel={() => router.back()}
            isLoading={isPending}
          />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', justifyContent: 'center', gap: 12, padding: 16, backgroundColor: colors.neutral.white, borderBottomWidth: 1, borderBottomColor: colors.neutral.border },
  step: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.neutral.border, justifyContent: 'center', alignItems: 'center' },
  stepActive: { backgroundColor: colors.brand.primary },
  stepText: { fontFamily: 'Inter_400Regular', color: colors.neutral.textSub, fontWeight: '700' },
  stepTextActive: { color: colors.neutral.white },
  stepTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: colors.brand.dark, marginBottom: 12 },
  input: { backgroundColor: colors.neutral.white, borderRadius: 8, borderWidth: 1, borderColor: colors.neutral.border, padding: 12, fontFamily: 'Inter_400Regular', fontSize: 14, marginBottom: 8, color: colors.brand.dark },
  listItem: { backgroundColor: colors.neutral.white, borderRadius: 8, padding: 14, marginBottom: 6, shadowColor: '#000', shadowOpacity: 0.03, elevation: 1 },
  listItemTitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14, color: colors.brand.dark },
  listItemSub: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.neutral.textSub, marginTop: 2 },
  cartBox: { backgroundColor: colors.brand.tint, borderRadius: 8, padding: 12, marginBottom: 8 },
  cartTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.brand.primary, marginBottom: 6 },
  cartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  cartName: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.brand.dark },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { fontFamily: 'Inter_400Regular', fontSize: 20, color: colors.brand.primary, paddingHorizontal: 4 },
  qtyNum: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, minWidth: 20, textAlign: 'center' },
  empty: { fontFamily: 'Inter_400Regular', color: colors.neutral.textSub, textAlign: 'center', marginTop: 8, marginBottom: 4 },
  summaryBox: { backgroundColor: colors.neutral.white, borderRadius: 8, padding: 14, marginBottom: 8 },
  summaryLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.neutral.textSub, marginBottom: 6 },
  summaryValue: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15, color: colors.brand.dark },
  totalLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16, color: colors.brand.dark },
  totalValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 20, color: colors.brand.primary },
  confirmBtn: { backgroundColor: colors.brand.primary, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12 },
  confirmBtnText: { fontFamily: 'PlusJakartaSans_700Bold', color: colors.neutral.white, fontSize: 15 },
  backBtn: { borderRadius: 8, borderWidth: 1, borderColor: colors.neutral.border, padding: 14, alignItems: 'center', marginTop: 8, backgroundColor: colors.neutral.white },
  backBtnText: { fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.neutral.text, fontSize: 15 },
  cancelBtn: { padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 24 },
  cancelBtnText: { fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.semantic.danger, fontSize: 14 },
  selectedCard: { backgroundColor: colors.brand.tint, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: colors.brand.tint },
  selectedCardLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, color: colors.neutral.textSub, marginBottom: 2 },
  selectedCardValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, color: colors.brand.dark },
  selectedCardChange: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.brand.primary, marginTop: 4 },
})
