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
import { useBranches } from '../../../src/hooks/useBranches'
import { submitOrder } from '../../../src/utils/createOrder'
import { useEffect } from 'react'
import { useTransportadoras } from '../../../src/hooks/useTransportadoras'
import { useCondPags } from '../../../src/hooks/useCondPags'
import { useFieldVisible } from '../../../src/hooks/useFieldConfig'
import type { Branch, Customer, Product, Transportadora, CondPag, CreateOrderItemInput } from '@addere/types'
import { fmtMoeda, formatDocument } from '../../../src/utils/format'

type Step = 1 | 2 | 3

interface CartItem {
  product:      Product
  quantity:     number
  discount:     number
  unitPrice:    number
  largura?:     number
  espessura?:   number
  encolhimento?: string
  xcrav?:       string
  tara?:        number
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

// ─── Step 1: Seleção de cliente e filial ─────────────────────────────────

function Step1({
  onComplete,
}: {
  onComplete: (customer: Customer, branch: Branch) => void
}) {
  const [search, setSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const { data: customers, isLoading: loadingCustomers } = useClientes(search || undefined)
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
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.listItem} onPress={() => onComplete(selectedCustomer, item)}>
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
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.listItem} onPress={() => setSelectedCustomer(item)}>
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
  const { data: products, isLoading } = useProdutos(search || undefined)

  function addToCart(product: Product) {
    const existing = cart.find((i) => i.product.id === product.id)
    if (existing) {
      onCartChange(cart.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      onCartChange([...cart, { product, quantity: 1, discount: 0, unitPrice: Number(product.price) }])
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
    <View style={styles.summaryBox}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <TouchableOpacity style={styles.pickerBtn} onPress={() => setOpen((v) => !v)}>
        <Text style={selected ? styles.pickerBtnText : styles.pickerBtnPlaceholder}>
          {loading ? 'Carregando...' : selected ? selected.nome : `Selecionar ${label.toLowerCase()}...`}
        </Text>
        <Text style={styles.pickerBtnIcon}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={styles.pickerList}>
          <TouchableOpacity style={styles.pickerItem} onPress={() => { onSelect(null); setOpen(false) }}>
            <Text style={styles.pickerItemText}>— Nenhum —</Text>
          </TouchableOpacity>
          {items.map((item) => (
            <TouchableOpacity key={item.id} style={styles.pickerItem} onPress={() => { onSelect(item); setOpen(false) }}>
              <Text style={[styles.pickerItemText, selected?.id === item.id && styles.pickerItemSelected]}>
                {item.nome}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

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
  const showTransportadora = useFieldVisible('order.transportadora')
  const showCondPag        = useFieldVisible('order.condPag')
  const showMennota        = useFieldVisible('order.mennota')
  const showNotes          = useFieldVisible('order.notes')
  const showUnitPrice      = useFieldVisible('orderItem.unitPrice')
  const showLargura        = useFieldVisible('orderItem.largura')
  const showEspessura      = useFieldVisible('orderItem.espessura')
  const showEncolhimento   = useFieldVisible('orderItem.encolhimento')
  const showXcrav          = useFieldVisible('orderItem.xcrav')
  const showTara           = useFieldVisible('orderItem.tara')

  const total = cart.reduce(
    (sum, i) => sum + i.unitPrice * i.quantity * (1 - i.discount / 100),
    0
  )

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      onCartChange(cart.filter((i) => i.product.id !== productId))
      return
    }
    onCartChange(cart.map((i) => i.product.id === productId ? { ...i, quantity: qty } : i))
  }

  function updatePrice(productId: string, raw: string) {
    const value = parseFloat(raw.replace(',', '.'))
    if (isNaN(value) || value < 0) return
    onCartChange(cart.map((i) => i.product.id === productId ? { ...i, unitPrice: value } : i))
  }

  function removeItem(productId: string) {
    onCartChange(cart.filter((i) => i.product.id !== productId))
  }

  function updateNumField(productId: string, field: 'largura' | 'espessura' | 'tara', raw: string) {
    const value = parseFloat(raw.replace(',', '.'))
    if (isNaN(value) || value < 0) return
    onCartChange(cart.map((i) => i.product.id === productId ? { ...i, [field]: value } : i))
  }

  function updateStrField(productId: string, field: 'encolhimento', value: string) {
    onCartChange(cart.map((i) => i.product.id === productId ? { ...i, [field]: value } : i))
  }

  function toggleXcrav(productId: string) {
    onCartChange(cart.map((i) => i.product.id === productId
      ? { ...i, xcrav: i.xcrav === '1' ? '2' : '1' }
      : i
    ))
  }

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
          <View key={item.product.id} style={styles.itemEditRow}>
            <View style={styles.itemEditHeader}>
              <Text style={styles.itemEditName} numberOfLines={2}>{item.product.name}</Text>
              <TouchableOpacity onPress={() => removeItem(item.product.id)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>×</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.itemEditControls}>
              <View style={styles.itemEditQty}>
                <Text style={styles.itemControlLabel}>Qtd</Text>
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
              {showUnitPrice && (
                <View style={styles.itemEditPrice}>
                  <Text style={styles.itemControlLabel}>Preço unit. (R$)</Text>
                  <TextInput
                    style={styles.priceInput}
                    keyboardType="decimal-pad"
                    defaultValue={item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    onEndEditing={(e) => updatePrice(item.product.id, e.nativeEvent.text)}
                  />
                </View>
              )}
              <View style={styles.itemEditSubtotal}>
                <Text style={styles.itemControlLabel}>Subtotal</Text>
                <Text style={styles.itemSubtotalValue}>
                  R$ {fmtMoeda(item.unitPrice * item.quantity * (1 - item.discount / 100))}
                </Text>
              </View>
            </View>

            {/* Campos extras por item */}
            {(showLargura || showEspessura || showTara) && (
              <View style={styles.itemExtraRow}>
                {showLargura && (
                  <View style={styles.itemExtraField}>
                    <Text style={styles.itemControlLabel}>Largura</Text>
                    <TextInput
                      style={styles.priceInput}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      defaultValue={item.largura != null ? String(item.largura) : ''}
                      onEndEditing={(e) => updateNumField(item.product.id, 'largura', e.nativeEvent.text)}
                    />
                  </View>
                )}
                {showEspessura && (
                  <View style={styles.itemExtraField}>
                    <Text style={styles.itemControlLabel}>Espessura</Text>
                    <TextInput
                      style={styles.priceInput}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      defaultValue={item.espessura != null ? String(item.espessura) : ''}
                      onEndEditing={(e) => updateNumField(item.product.id, 'espessura', e.nativeEvent.text)}
                    />
                  </View>
                )}
                {showTara && (
                  <View style={styles.itemExtraField}>
                    <Text style={styles.itemControlLabel}>Tara</Text>
                    <TextInput
                      style={styles.priceInput}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      defaultValue={item.tara != null ? String(item.tara) : ''}
                      onEndEditing={(e) => updateNumField(item.product.id, 'tara', e.nativeEvent.text)}
                    />
                  </View>
                )}
              </View>
            )}
            {showEncolhimento && (
              <View style={styles.itemExtraFull}>
                <Text style={styles.itemControlLabel}>Encolhimento</Text>
                <TextInput
                  style={styles.priceInput}
                  placeholder="Texto"
                  defaultValue={item.encolhimento ?? ''}
                  onEndEditing={(e) => updateStrField(item.product.id, 'encolhimento', e.nativeEvent.text)}
                />
              </View>
            )}
            {showXcrav && (
              <View style={styles.itemExtraFull}>
                <Text style={styles.itemControlLabel}>Largura Crav.</Text>
                <TouchableOpacity
                  style={[styles.xcravBtn, item.xcrav === '1' && styles.xcravBtnActive]}
                  onPress={() => toggleXcrav(item.product.id)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.xcravBtnText, item.xcrav === '1' && styles.xcravBtnTextActive]}>
                    {item.xcrav === '1' ? 'Sim' : 'Não'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}
      </View>

      {showTransportadora && (
        <PickerField
          label="Transportadora"
          selected={transportadora ? { id: transportadora.id, nome: transportadora.nome } : null}
          items={transportadoras.map((t) => ({ id: t.id, nome: t.nome }))}
          onSelect={(item) => onTransportChange(item ? (transportadoras.find((t) => t.id === item.id) ?? null) : null)}
          loading={loadingTransp}
        />
      )}

      {showCondPag && (
        <PickerField
          label="Cond. Pagamento"
          selected={condPag ? { id: condPag.id, nome: condPag.nome } : null}
          items={condPags.map((c) => ({ id: c.id, nome: c.nome }))}
          onSelect={(item) => onCondChange(item ? (condPags.find((c) => c.id === item.id) ?? null) : null)}
          loading={loadingCond}
        />
      )}

      {showMennota && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Obs. Nota Fiscal</Text>
          <TextInput
            style={styles.notesInput}
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
          <Text style={styles.summaryLabel}>Obs. Interna</Text>
          <TextInput
            style={styles.notesInput}
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
        style={[styles.confirmBtn, cart.length === 0 && { opacity: 0.4 }]}
        onPress={onConfirm}
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

    const items: CreateOrderItemInput[] = cart.map((i) => ({
      productId:    i.product.id,
      quantity:     i.quantity,
      discount:     i.discount,
      unitPrice:    i.unitPrice,
      largura:      i.largura,
      espessura:    i.espessura,
      encolhimento: i.encolhimento,
      xcrav:        i.xcrav,
      tara:         i.tara,
    }))

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
  }

  const stepLabel = ['Selecionar cliente / filial', 'Adicionar produtos', 'Confirmar']

  return (
    <View style={{ flex: 1, backgroundColor: '#f3f4f6' }}>
      <Stack.Screen options={{ title: `Novo pedido — ${stepLabel[step - 1]}` }} />
      <StepIndicator current={step} />

      <View style={{ flex: 1, padding: 16 }}>
        {step === 1 && <Step1 onComplete={handleStep1Complete} />}
        {step === 2 && (
          <View style={{ flex: 1 }}>
            <Step2 cart={cart} onCartChange={setCart} onBack={() => setStep(1)} />
            <TouchableOpacity
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
  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 8, marginBottom: 4 },
  summaryBox: { backgroundColor: '#fff', borderRadius: 8, padding: 14, marginBottom: 8 },
  summaryLabel: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  summaryValue: { fontSize: 15, fontWeight: '600', color: '#111827' },
  totalLabel: { fontSize: 16, fontWeight: '700', color: '#111827' },
  totalValue: { fontSize: 20, fontWeight: '700', color: '#2563eb' },
  confirmBtn: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 12 },
  confirmBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  backBtn: { borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db', padding: 14, alignItems: 'center', marginTop: 8, backgroundColor: '#fff' },
  backBtnText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  cancelBtn: { padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 24 },
  cancelBtnText: { color: '#dc2626', fontWeight: '600', fontSize: 14 },
  selectedCard: { backgroundColor: '#eff6ff', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#bfdbfe' },
  selectedCardLabel: { fontSize: 11, color: '#6b7280', marginBottom: 2 },
  selectedCardValue: { fontSize: 15, fontWeight: '700', color: '#111827' },
  selectedCardChange: { fontSize: 12, color: '#2563eb', marginTop: 4 },
  // Item editável no Step 3
  itemEditRow: { borderTopWidth: 1, borderTopColor: '#f3f4f6', paddingTop: 10, marginTop: 6 },
  itemEditHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  itemEditName: { flex: 1, fontSize: 13, fontWeight: '600', color: '#111827', marginRight: 8 },
  removeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center' },
  removeBtnText: { color: '#dc2626', fontSize: 18, fontWeight: '700', lineHeight: 22 },
  itemEditControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemEditQty: { alignItems: 'center' },
  itemEditPrice: { flex: 1, alignItems: 'flex-start' },
  itemEditSubtotal: { alignItems: 'flex-end' },
  itemControlLabel: { fontSize: 10, color: '#9ca3af', marginBottom: 4 },
  priceInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, padding: 6, fontSize: 13, minWidth: 80, backgroundColor: '#f9fafb' },
  itemSubtotalValue: { fontSize: 13, fontWeight: '700', color: '#111827' },
  itemExtraRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  itemExtraField: { flex: 1, minWidth: 80 },
  itemExtraFull: { marginTop: 8 },
  xcravBtn: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 6, paddingHorizontal: 16, paddingVertical: 6, alignSelf: 'flex-start', backgroundColor: '#f9fafb' },
  xcravBtnActive: { backgroundColor: '#1B4FA8', borderColor: '#1B4FA8' },
  xcravBtnText: { fontSize: 13, color: '#374151', fontFamily: 'Inter_400Regular' },
  xcravBtnTextActive: { color: '#FFFFFF' },
  notesInput: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, fontSize: 14, minHeight: 80, backgroundColor: '#f9fafb' },
  pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 10, backgroundColor: '#f9fafb' },
  pickerBtnText: { fontSize: 14, color: '#111827' },
  pickerBtnPlaceholder: { fontSize: 14, color: '#9ca3af' },
  pickerBtnIcon: { fontSize: 12, color: '#6b7280' },
  pickerList: { marginTop: 4, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, backgroundColor: '#fff', overflow: 'hidden' },
  pickerItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  pickerItemText: { fontSize: 14, color: '#374151' },
  pickerItemSelected: { color: '#2563eb', fontWeight: '700' },
})
