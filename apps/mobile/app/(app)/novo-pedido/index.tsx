import { useState } from 'react'
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
import { useClientes } from '../../../src/hooks/useClientes'
import { useProdutos } from '../../../src/hooks/useProdutos'
import { useCriarPedido } from '../../../src/hooks/usePedidos'
import type { Customer, Product, CreateOrderItemInput } from '@addere/types'

type Step = 1 | 2 | 3

interface CartItem {
  product: Product
  quantity: number
  discount: number
}

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

// ─── Step 1: Seleção de cliente ───────────────────────────────────────────

function Step1({
  onSelect,
}: {
  onSelect: (c: Customer) => void
}) {
  const [search, setSearch] = useState('')
  const { data: customers, isLoading } = useClientes(search || undefined)

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.stepTitle}>Selecione o cliente</Text>
      <TextInput
        style={styles.input}
        placeholder="Buscar cliente..."
        value={search}
        onChangeText={setSearch}
      />
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 16 }} />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.listItem} onPress={() => onSelect(item)}>
              <Text style={styles.listItemTitle}>{item.name}</Text>
              {item.document && <Text style={styles.listItemSub}>{item.document}</Text>}
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
}: {
  cart: CartItem[]
  onCartChange: (cart: CartItem[]) => void
}) {
  const [search, setSearch] = useState('')
  const { data: products, isLoading } = useProdutos(search || undefined)

  function addToCart(product: Product) {
    const existing = cart.find((i) => i.product.id === product.id)
    if (existing) {
      onCartChange(cart.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      onCartChange([...cart, { product, quantity: 1, discount: 0 }])
    }
  }

  function removeFromCart(productId: string) {
    onCartChange(cart.filter((i) => i.product.id !== productId))
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) { removeFromCart(productId); return }
    onCartChange(cart.map((i) => i.product.id === productId ? { ...i, quantity: qty } : i))
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.stepTitle}>Adicionar produtos</Text>
      <TextInput style={styles.input} placeholder="Buscar produto..." value={search} onChangeText={setSearch} />

      {cart.length > 0 && (
        <View style={styles.cartBox}>
          <Text style={styles.cartTitle}>Carrinho ({cart.length})</Text>
          {cart.map((item) => (
            <View key={item.product.id} style={styles.cartRow}>
              <Text style={styles.cartName} numberOfLines={1}>{item.product.name}</Text>
              <View style={styles.qtyRow}>
                <TouchableOpacity onPress={() => updateQty(item.product.id, item.quantity - 1)}>
                  <Text style={styles.qtyBtn}>−</Text>
                </TouchableOpacity>
                <Text style={styles.qtyNum}>{item.quantity}</Text>
                <TouchableOpacity onPress={() => updateQty(item.product.id, item.quantity + 1)}>
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
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.listItem} onPress={() => addToCart(item)}>
              <Text style={styles.listItemTitle}>{item.name}</Text>
              <Text style={styles.listItemSub}>R$ {Number(item.price).toFixed(2)} / {item.unit}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum produto encontrado.</Text>}
        />
      )}
    </View>
  )
}

// ─── Step 3: Resumo e confirmação ─────────────────────────────────────────

function Step3({
  customer,
  cart,
  onConfirm,
  isLoading,
}: {
  customer: Customer
  cart: CartItem[]
  onConfirm: () => void
  isLoading: boolean
}) {
  const total = cart.reduce(
    (sum, i) => sum + Number(i.product.price) * i.quantity * (1 - i.discount / 100),
    0
  )

  return (
    <ScrollView>
      <Text style={styles.stepTitle}>Resumo do pedido</Text>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryLabel}>Cliente</Text>
        <Text style={styles.summaryValue}>{customer.name}</Text>
      </View>

      <View style={styles.summaryBox}>
        <Text style={styles.summaryLabel}>Itens</Text>
        {cart.map((item) => (
          <View key={item.product.id} style={styles.summaryRow}>
            <Text style={styles.summaryItem}>
              {item.product.name} × {item.quantity}
            </Text>
            <Text style={styles.summaryItem}>
              R$ {(Number(item.product.price) * item.quantity).toFixed(2)}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.summaryBox, { flexDirection: 'row', justifyContent: 'space-between' }]}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>R$ {total.toFixed(2)}</Text>
      </View>

      <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm} disabled={isLoading}>
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Confirmar pedido</Text>}
      </TouchableOpacity>
    </ScrollView>
  )
}

// ─── Tela principal ───────────────────────────────────────────────────────

export default function NovoPedidoScreen() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [cart, setCart] = useState<CartItem[]>([])

  const { mutate: criarPedido, isPending } = useCriarPedido()

  function handleSelectCustomer(c: Customer) {
    setCustomer(c)
    setStep(2)
  }

  function handleConfirm() {
    if (!customer || cart.length === 0) return

    const items: CreateOrderItemInput[] = cart.map((i) => ({
      productId: i.product.id,
      quantity: i.quantity,
      discount: i.discount,
    }))

    criarPedido(
      { customerId: customer.id, items },
      {
        onSuccess: () => {
          Alert.alert('Pedido criado', 'Pedido salvo com sucesso!', [
            { text: 'OK', onPress: () => router.replace('/(app)/pedidos') },
          ])
        },
        onError: () => {
          Alert.alert('Erro', 'Não foi possível criar o pedido. Tente novamente.')
        },
      }
    )
  }

  const stepLabel = ['Selecionar cliente', 'Adicionar produtos', 'Confirmar']

  return (
    <View style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
      <Stack.Screen options={{ title: `Novo pedido — ${stepLabel[step - 1]}` }} />
      <StepIndicator current={step} />

      <View style={{ flex: 1, padding: 16 }}>
        {step === 1 && <Step1 onSelect={handleSelectCustomer} />}
        {step === 2 && (
          <View style={{ flex: 1 }}>
            <Step2 cart={cart} onCartChange={setCart} />
            <TouchableOpacity
              style={[styles.confirmBtn, cart.length === 0 && { opacity: 0.4 }]}
              disabled={cart.length === 0}
              onPress={() => setStep(3)}
            >
              <Text style={styles.confirmBtnText}>Próximo →</Text>
            </TouchableOpacity>
          </View>
        )}
        {step === 3 && customer && (
          <Step3 customer={customer} cart={cart} onConfirm={handleConfirm} isLoading={isPending} />
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  steps: { flexDirection: 'row', justifyContent: 'center', gap: 12, padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  step: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  stepActive: { backgroundColor: '#2563eb' },
  stepText: { color: '#6b7280', fontWeight: '700' },
  stepTextActive: { color: '#fff' },
  stepTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 },
  input: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', padding: 12, fontSize: 14, marginBottom: 8 },
  listItem: { backgroundColor: '#fff', borderRadius: 8, padding: 14, marginBottom: 6, shadowColor: '#000', shadowOpacity: 0.03, elevation: 1 },
  listItemTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  listItemSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  cartBox: { backgroundColor: '#eff6ff', borderRadius: 8, padding: 12, marginBottom: 8 },
  cartTitle: { fontSize: 13, fontWeight: '700', color: '#2563eb', marginBottom: 6 },
  cartRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  cartName: { flex: 1, fontSize: 13, color: '#111827' },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: { fontSize: 20, color: '#2563eb', paddingHorizontal: 4 },
  qtyNum: { fontSize: 14, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 24 },
  summaryBox: { backgroundColor: '#fff', borderRadius: 8, padding: 14, marginBottom: 8 },
  summaryLabel: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  summaryValue: { fontSize: 15, fontWeight: '600', color: '#111827' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  summaryItem: { fontSize: 13, color: '#374151' },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#111827' },
  totalValue: { fontSize: 20, fontWeight: '700', color: '#2563eb' },
  confirmBtn: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
