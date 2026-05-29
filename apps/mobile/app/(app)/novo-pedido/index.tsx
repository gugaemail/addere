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
import { useCatalog } from '../../../src/hooks/useCatalog'
import { useBranches } from '../../../src/hooks/useBranches'
import { submitOrder } from '../../../src/utils/createOrder'
import { useEffect } from 'react'
import { useTransportadoras } from '../../../src/hooks/useTransportadoras'
import { useCondPags } from '../../../src/hooks/useCondPags'
import { useFieldVisible, useFieldRequired } from '../../../src/hooks/useFieldConfig'
import { colors } from '../../../src/theme/colors'
import type { Branch, Customer, Product, Transportadora, CondPag, CreateOrderItemInput } from '@addere/types'
import { fmtMoeda, formatDocument } from '../../../src/utils/format'

type Step = 1 | 2 | 3

interface CartItem {
  product:      Product
  quantity:     number
  discount:     number
  unitPrice:    number
  descricao?:   string
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
  const { data: products, isLoading, isFromCache } = useCatalog(search || undefined)

  function addToCart(product: Product) {
    const existing = cart.find((i) => i.product.id === product.id)
    if (existing) {
      onCartChange(cart.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      onCartChange([...cart, { product, quantity: 1, discount: 0, unitPrice: Number(product.price), descricao: product.name }])
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
  const showDescricao      = useFieldVisible('orderItem.descricao')

  const reqTransportadora = useFieldRequired('order.transportadora')
  const reqCondPag        = useFieldRequired('order.condPag')
  const reqMennota        = useFieldRequired('order.mennota')
  const reqNotes          = useFieldRequired('order.notes')
  const reqUnitPrice      = useFieldRequired('orderItem.unitPrice')
  const reqLargura        = useFieldRequired('orderItem.largura')
  const reqEspessura      = useFieldRequired('orderItem.espessura')
  const reqEncolhimento   = useFieldRequired('orderItem.encolhimento')
  const reqXcrav          = useFieldRequired('orderItem.xcrav')
  const reqTara           = useFieldRequired('orderItem.tara')
  const reqDescricao      = useFieldRequired('orderItem.descricao')

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

  function updateStrField(productId: string, field: 'encolhimento' | 'descricao', value: string) {
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

  function handleConfirmWithValidation() {
    if (cart.length === 0) {
      Alert.alert('Pedido inválido', 'Adicione pelo menos um produto antes de confirmar.')
      return
    }
    if (reqTransportadora && !transportadora) {
      Alert.alert('Campo obrigatório', 'Selecione uma transportadora antes de confirmar.')
      return
    }
    if (reqCondPag && !condPag) {
      Alert.alert('Campo obrigatório', 'Selecione uma condição de pagamento antes de confirmar.')
      return
    }
    if (reqMennota && !mennota.trim()) {
      Alert.alert('Campo obrigatório', 'Preencha a observação da nota fiscal.')
      return
    }
    if (reqNotes && !notes.trim()) {
      Alert.alert('Campo obrigatório', 'Preencha a observação interna.')
      return
    }
    for (const item of cart) {
      if (reqUnitPrice && (!item.unitPrice || item.unitPrice <= 0)) {
        Alert.alert('Campo obrigatório', `Informe o preço unitário de "${item.product.name}".`)
        return
      }
      if (reqDescricao && !item.descricao?.trim()) {
        Alert.alert('Campo obrigatório', `Informe a descrição de "${item.product.name}".`)
        return
      }
      if (reqLargura && item.largura == null) {
        Alert.alert('Campo obrigatório', `Informe a largura de "${item.product.name}".`)
        return
      }
      if (reqEspessura && item.espessura == null) {
        Alert.alert('Campo obrigatório', `Informe a espessura de "${item.product.name}".`)
        return
      }
      if (reqEncolhimento && !item.encolhimento?.trim()) {
        Alert.alert('Campo obrigatório', `Informe o encolhimento de "${item.product.name}".`)
        return
      }
      if (reqTara && item.tara == null) {
        Alert.alert('Campo obrigatório', `Informe a tara de "${item.product.name}".`)
        return
      }
    }
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
          <View key={item.product.id} style={styles.itemEditRow}>
            {showDescricao ? (
              <View style={styles.itemExtraFull}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={styles.itemControlLabel}>Descrição{reqDescricao ? ' *' : ''}</Text>
                  <TouchableOpacity onPress={() => removeItem(item.product.id)} style={styles.removeBtn}>
                    <Text style={styles.removeBtnText}>×</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.priceInput}
                  placeholder="Descrição do item"
                  defaultValue={item.descricao ?? ''}
                  onEndEditing={(e) => updateStrField(item.product.id, 'descricao', e.nativeEvent.text)}
                  placeholderTextColor={colors.neutral.textSub}
                />
              </View>
            ) : (
              <View style={styles.itemEditHeader}>
                <Text style={styles.itemEditName} numberOfLines={2}>{item.product.name}</Text>
                <TouchableOpacity onPress={() => removeItem(item.product.id)} style={styles.removeBtn}>
                  <Text style={styles.removeBtnText}>×</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={[styles.itemEditControls, { marginTop: 8 }]}>
              <View style={styles.itemEditQty}>
                <Text style={styles.itemControlLabel}>Qtd</Text>
                <TextInput
                  style={styles.priceInput}
                  keyboardType="decimal-pad"
                  defaultValue={item.quantity.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
                  onEndEditing={(e) => {
                    const raw = parseFloat(e.nativeEvent.text.replace(',', '.'))
                    updateQty(item.product.id, isNaN(raw) ? 1 : raw)
                  }}
                  placeholderTextColor={colors.neutral.textSub}
                />
              </View>
              {showUnitPrice && (
                <View style={styles.itemEditPrice}>
                  <Text style={styles.itemControlLabel}>Preço unit. (R$){reqUnitPrice ? ' *' : ''}</Text>
                  <TextInput
                    style={styles.priceInput}
                    keyboardType="decimal-pad"
                    defaultValue={item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    onEndEditing={(e) => updatePrice(item.product.id, e.nativeEvent.text)}
                    placeholderTextColor={colors.neutral.textSub}
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
            {(showLargura || showEspessura || showTara) && (
              <View style={styles.itemExtraRow}>
                {showLargura && (
                  <View style={styles.itemExtraField}>
                    <Text style={styles.itemControlLabel}>Largura{reqLargura ? ' *' : ''}</Text>
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
                    <Text style={styles.itemControlLabel}>Espessura{reqEspessura ? ' *' : ''}</Text>
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
                    <Text style={styles.itemControlLabel}>Tara{reqTara ? ' *' : ''}</Text>
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
                <Text style={styles.itemControlLabel}>Encolhimento{reqEncolhimento ? ' *' : ''}</Text>
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
                <Text style={styles.itemControlLabel}>Largura Crav.{reqXcrav ? ' *' : ''}</Text>
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
          label={reqTransportadora ? 'Transportadora *' : 'Transportadora'}
          selected={transportadora ? { id: transportadora.id, nome: transportadora.nome } : null}
          items={transportadoras.map((t) => ({ id: t.id, nome: t.nome }))}
          onSelect={(item) => onTransportChange(item ? (transportadoras.find((t) => t.id === item.id) ?? null) : null)}
          loading={loadingTransp}
        />
      )}

      {showCondPag && (
        <PickerField
          label={reqCondPag ? 'Cond. Pagamento *' : 'Cond. Pagamento'}
          selected={condPag ? { id: condPag.id, nome: condPag.nome } : null}
          items={condPags.map((c) => ({ id: c.id, nome: c.nome }))}
          onSelect={(item) => onCondChange(item ? (condPags.find((c) => c.id === item.id) ?? null) : null)}
          loading={loadingCond}
        />
      )}

      {showMennota && (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Obs. Nota Fiscal{reqMennota ? ' *' : ''}</Text>
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
          <Text style={styles.summaryLabel}>Obs. Interna{reqNotes ? ' *' : ''}</Text>
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
      descricao:    i.descricao,
      largura:      i.largura,
      espessura:    i.espessura,
      encolhimento: i.encolhimento,
      xcrav:        i.xcrav,
      tara:         i.tara,
    }))

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
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Verifique os dados e tente novamente.'
      Alert.alert('Erro ao criar pedido', msg)
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
  itemEditRow: { borderTopWidth: 1, borderTopColor: colors.neutral.bg, paddingTop: 10, marginTop: 6 },
  itemEditHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  itemEditName: { flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13, color: colors.brand.dark, marginRight: 8 },
  removeBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.semantic.dangerLight, justifyContent: 'center', alignItems: 'center' },
  removeBtnText: { fontFamily: 'Inter_400Regular', color: colors.semantic.danger, fontSize: 18, fontWeight: '700', lineHeight: 22 },
  itemEditControls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemEditQty: { alignItems: 'center' },
  itemEditPrice: { flex: 1, alignItems: 'flex-start' },
  itemEditSubtotal: { alignItems: 'flex-end' },
  itemControlLabel: { fontFamily: 'Inter_400Regular', fontSize: 10, color: colors.neutral.textSub, marginBottom: 4 },
  priceInput: { borderWidth: 1, borderColor: colors.neutral.border, borderRadius: 6, padding: 6, fontFamily: 'Inter_400Regular', fontSize: 13, minWidth: 80, backgroundColor: colors.neutral.bg, color: colors.brand.dark },
  itemSubtotalValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, color: colors.brand.dark },
  itemExtraRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  itemExtraField: { flex: 1, minWidth: 80 },
  itemExtraFull: { marginTop: 8 },
  xcravBtn: { borderWidth: 1, borderColor: colors.neutral.border, borderRadius: 6, paddingHorizontal: 16, paddingVertical: 6, alignSelf: 'flex-start', backgroundColor: colors.neutral.bg },
  xcravBtnActive: { backgroundColor: colors.brand.primary, borderColor: colors.brand.primary },
  xcravBtnText: { fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.neutral.text },
  xcravBtnTextActive: { color: colors.neutral.white },
  notesInput: { borderWidth: 1, borderColor: colors.neutral.border, borderRadius: 8, padding: 10, fontFamily: 'Inter_400Regular', fontSize: 14, minHeight: 80, backgroundColor: colors.neutral.bg, color: colors.brand.dark },
  pickerBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: colors.neutral.border, borderRadius: 8, padding: 10, backgroundColor: colors.neutral.bg },
  pickerBtnText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.brand.dark },
  pickerBtnPlaceholder: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.neutral.textSub },
  pickerBtnIcon: { fontFamily: 'Inter_400Regular', fontSize: 12, color: colors.neutral.textSub },
  pickerList: { marginTop: 4, borderWidth: 1, borderColor: colors.neutral.border, borderRadius: 8, backgroundColor: colors.neutral.white, overflow: 'hidden' },
  pickerItem: { paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.neutral.bg },
  pickerItemText: { fontFamily: 'Inter_400Regular', fontSize: 14, color: colors.neutral.text },
  pickerItemSelected: { fontFamily: 'PlusJakartaSans_600SemiBold', color: colors.brand.primary },
})
