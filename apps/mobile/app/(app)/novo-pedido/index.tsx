import { useState, useCallback, useEffect } from 'react'
import { View, Text, FlatList, StyleSheet, Alert, ScrollView } from 'react-native'
import { useRouter, Stack } from 'expo-router'
import { ArrowLeft, ArrowRight, Minus, Plus, Search } from 'lucide-react-native'
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
import { colors, spacing, radius, typography } from '../../../src/theme'
import { Badge } from '../../../src/components/ui/Badge'
import { Button, buttonForeground } from '../../../src/components/ui/Button'
import { Card } from '../../../src/components/ui/Card'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { Input } from '../../../src/components/ui/Input'
import { LoadingState } from '../../../src/components/Skeleton'
import { PickerField } from '../../../src/components/order-form/PickerField'
import { CartItemEditor } from '../../../src/components/order-form/CartItemEditor'
import {
  useOrderValidation,
  useOrderFormErrors,
  changedItemFields,
} from '../../../src/components/order-form/validation'
import { orderFormStyles } from '../../../src/components/order-form/styles'
import {
  cartItemFromProduct,
  cartTotal,
  cartToOrderItems,
} from '../../../src/components/order-form/types'
import type { CartItem } from '../../../src/components/order-form/types'
import type {
  Branch,
  Customer,
  Product,
  Transportadora,
  CondPag,
  CreateOrderItemInput,
} from '@addere/types'
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

function Step1({ onComplete }: { onComplete: (customer: Customer, branch: Branch) => void }) {
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const { data: customers, isLoading: loadingCustomers } = useClientes(debouncedSearch || undefined)
  const { data: branches, isLoading: loadingBranches } = useBranches()

  if (selectedCustomer) {
    return (
      <View style={{ flex: 1 }}>
        <Card style={styles.selectedCard} onPress={() => setSelectedCustomer(null)}>
          <Text style={styles.selectedCardLabel}>Cliente selecionado</Text>
          <Text style={styles.selectedCardValue}>{selectedCustomer.name}</Text>
          <View style={styles.selectedCardChange}>
            <Text style={styles.selectedCardChangeText}>Trocar</Text>
            <ArrowRight size={14} color={colors.brand.primary} strokeWidth={1.5} />
          </View>
        </Card>

        <Text style={[styles.stepTitle, { marginTop: spacing.md }]}>Selecione a filial</Text>

        {loadingBranches ? (
          <LoadingState />
        ) : (
          <FlatList
            data={branches}
            keyExtractor={(b) => b.id}
            renderItem={({ item, index }) => (
              <Card
                testID={`btn-adicionar-produto-${index}`}
                style={styles.listItem}
                onPress={() => onComplete(selectedCustomer, item)}
              >
                <Text style={styles.listItemTitle}>{item.name}</Text>
                {item.cnpj && <Text style={styles.listItemSub}>{formatDocument(item.cnpj)}</Text>}
              </Card>
            )}
            ListEmptyComponent={
              <EmptyState illustration="orders" title="Nenhuma filial encontrada" />
            }
          />
        )}
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.stepTitle}>Selecione o cliente</Text>
      <Input
        testID="input-busca-cliente"
        containerStyle={styles.input}
        placeholder="Buscar cliente..."
        value={search}
        onChangeText={setSearch}
        onClear={() => setSearch('')}
        leftElement={<Search size={16} color={colors.neutral.placeholder} strokeWidth={1.5} />}
      />
      {loadingCustomers ? (
        <LoadingState />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c.id}
          renderItem={({ item, index }) => (
            <Card
              testID={`resultado-cliente-${index}`}
              style={styles.listItem}
              onPress={() => setSelectedCustomer(item)}
            >
              <Text style={styles.listItemTitle}>{item.name}</Text>
              {item.document && (
                <Text style={styles.listItemSub}>{formatDocument(item.document)}</Text>
              )}
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              illustration="clients"
              title="Nenhum cliente encontrado"
              subtitle={search ? `Não encontramos clientes para "${search}".` : undefined}
            />
          }
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
      onCartChange(
        cart.map((i) => (i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
      )
    } else {
      onCartChange([...cart, cartItemFromProduct(product)])
    }
  }

  function removeFromCart(productId: string) {
    onCartChange(cart.filter((i) => i.productId !== productId))
  }

  function updateQty(productId: string, qty: number) {
    if (qty <= 0) {
      removeFromCart(productId)
      return
    }
    onCartChange(cart.map((i) => (i.productId === productId ? { ...i, quantity: qty } : i)))
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={styles.stepTitle}>Adicionar produtos</Text>
        {isFromCache && (
          <View style={styles.cacheBadge}>
            <Badge testID="cache-badge" variant="warning">
              cache
            </Badge>
          </View>
        )}
      </View>
      <Input
        containerStyle={styles.input}
        placeholder="Buscar produto..."
        value={search}
        onChangeText={setSearch}
        onClear={() => setSearch('')}
        leftElement={<Search size={16} color={colors.neutral.placeholder} strokeWidth={1.5} />}
      />

      {cart.length > 0 && (
        <View style={styles.cartBox}>
          <Text style={styles.cartTitle}>Carrinho ({cart.length})</Text>
          {cart.map((item) => (
            <View key={item.productId} style={styles.cartRow}>
              <Text style={styles.cartName} numberOfLines={1}>
                {item.productName}
              </Text>
              <View style={styles.qtyRow}>
                <Button
                  variant="ghost"
                  size="xs"
                  onPress={() => updateQty(item.productId, item.quantity - 1)}
                  icon={<Minus size={16} color={buttonForeground.ghost} strokeWidth={1.5} />}
                  accessibilityLabel="Diminuir quantidade"
                />
                <Text style={styles.qtyNum}>{item.quantity}</Text>
                <Button
                  variant="ghost"
                  size="xs"
                  onPress={() => updateQty(item.productId, item.quantity + 1)}
                  icon={<Plus size={16} color={buttonForeground.ghost} strokeWidth={1.5} />}
                  accessibilityLabel="Aumentar quantidade"
                />
              </View>
            </View>
          ))}
        </View>
      )}

      {isLoading ? (
        <LoadingState />
      ) : (
        <FlatList
          testID="produto-lista"
          data={products}
          keyExtractor={(p) => p.id}
          renderItem={({ item, index }) => (
            <Card
              testID={`produto-${index}`}
              style={styles.listItem}
              onPress={() => addToCart(item)}
            >
              <Text style={styles.listItemTitle}>{item.name}</Text>
              <Text style={styles.listItemSub}>
                R$ {fmtMoeda(item.price)} / {item.unit}
              </Text>
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              illustration="products"
              title="Nenhum produto encontrado"
              subtitle={search ? `Não encontramos produtos para "${search}".` : undefined}
            />
          }
        />
      )}

      <Button
        variant="secondary"
        style={styles.backBtn}
        onPress={onBack}
        icon={<ArrowLeft size={16} color={buttonForeground.secondary} strokeWidth={1.5} />}
      >
        Voltar
      </Button>
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
  const showCondPag = useFieldVisible('order.condPag')
  const showMennota = useFieldVisible('order.mennota')
  const showNotes = useFieldVisible('order.notes')

  const reqTransportadora = useFieldRequired('order.transportadora')
  const reqCondPag = useFieldRequired('order.condPag')
  const reqMennota = useFieldRequired('order.mennota')
  const reqNotes = useFieldRequired('order.notes')

  const validate = useOrderValidation({
    emptyCart: 'Adicione pelo menos um produto antes de confirmar.',
    transportadora: 'Selecione uma transportadora antes de confirmar.',
    condPag: 'Selecione uma condição de pagamento antes de confirmar.',
  })

  // Erros de validação exibidos inline (limpos campo a campo conforme o usuário edita)
  const {
    errors,
    setErrors,
    clearError,
    clearItemErrors,
    hasErrors: showErrorSummary,
  } = useOrderFormErrors()

  const total = cartTotal(cart)

  function handleCancel() {
    Alert.alert('Cancelar pedido', 'Tem certeza que deseja cancelar? Os dados serão perdidos.', [
      { text: 'Não', style: 'cancel' },
      { text: 'Sim, cancelar', style: 'destructive', onPress: onCancel },
    ])
  }

  function handleConfirmWithValidation() {
    const result = validate({ cart, transportadora, condPag, mennota, notes })
    setErrors(result.errors)
    if (!result.ok) return
    onConfirm()
  }

  return (
    <ScrollView>
      <Text style={styles.stepTitle}>Resumo do pedido</Text>

      <Card style={styles.summaryBox}>
        <Text style={styles.summaryLabel}>Cliente</Text>
        <Text style={styles.summaryValue}>{customer.name}</Text>
      </Card>

      <Card style={styles.summaryBox}>
        <Text style={styles.summaryLabel}>Filial</Text>
        <Text style={styles.summaryValue}>{branch.name}</Text>
      </Card>

      <Card style={styles.summaryBox}>
        <Text style={styles.summaryLabel}>Itens</Text>
        {cart.length === 0 && (
          <Text style={styles.empty}>Nenhum item. Volte e adicione produtos.</Text>
        )}
        {cart.map((item) => (
          <CartItemEditor
            key={item.productId}
            item={item}
            errors={errors.items[item.productId]}
            onChange={(updated) => {
              clearItemErrors(item.productId, changedItemFields(item, updated))
              onCartChange(cart.map((i) => (i.productId === item.productId ? updated : i)))
            }}
            onRemove={() => {
              clearItemErrors(item.productId)
              onCartChange(cart.filter((i) => i.productId !== item.productId))
            }}
          />
        ))}
      </Card>

      {showTransportadora && (
        <PickerField
          label={reqTransportadora ? 'Transportadora *' : 'Transportadora'}
          selected={transportadora ? { id: transportadora.id, nome: transportadora.nome } : null}
          items={transportadoras.map((t) => ({ id: t.id, nome: t.nome }))}
          onSelect={(item) => {
            clearError('transportadora')
            onTransportChange(item ? (transportadoras.find((t) => t.id === item.id) ?? null) : null)
          }}
          loading={loadingTransp}
          disabled={!canChangeCarrier}
          error={errors.transportadora}
        />
      )}

      {showCondPag && (
        <PickerField
          label={reqCondPag ? 'Cond. Pagamento *' : 'Cond. Pagamento'}
          selected={condPag ? { id: condPag.id, nome: condPag.nome } : null}
          items={condPags.map((c) => ({ id: c.id, nome: c.nome }))}
          onSelect={(item) => {
            clearError('condPag')
            onCondChange(item ? (condPags.find((c) => c.id === item.id) ?? null) : null)
          }}
          loading={loadingCond}
          disabled={!canChangePaymentTerms}
          error={errors.condPag}
        />
      )}

      {showMennota && (
        <Card style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Obs. Nota Fiscal{reqMennota ? ' *' : ''}</Text>
          <Input
            containerStyle={orderFormStyles.notesField}
            style={orderFormStyles.notesInput}
            placeholder="Mensagem para a nota fiscal (opcional)..."
            value={mennota}
            onChangeText={(text) => {
              clearError('mennota')
              onMennotaChange(text)
            }}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            error={errors.mennota}
          />
        </Card>
      )}

      {showNotes && (
        <Card style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>Obs. Interna{reqNotes ? ' *' : ''}</Text>
          <Input
            containerStyle={orderFormStyles.notesField}
            style={orderFormStyles.notesInput}
            placeholder="Observação interna (não sai na nota)..."
            value={notes}
            onChangeText={(text) => {
              clearError('notes')
              onNotesChange(text)
            }}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            error={errors.notes}
          />
        </Card>
      )}

      <Card style={[styles.summaryBox, { flexDirection: 'row', justifyContent: 'space-between' }]}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>R$ {fmtMoeda(total)}</Text>
      </Card>

      {showErrorSummary && (
        <Text style={orderFormStyles.formError} accessibilityLiveRegion="polite">
          {errors.form ?? 'Corrija os campos destacados antes de confirmar.'}
        </Text>
      )}

      <Button
        testID="btn-confirmar-pedido"
        size="lg"
        style={styles.confirmBtn}
        onPress={handleConfirmWithValidation}
        loading={isLoading}
        disabled={cart.length === 0}
      >
        Confirmar pedido
      </Button>

      <Button
        variant="secondary"
        style={styles.backBtn}
        onPress={onBack}
        disabled={isLoading}
        icon={<ArrowLeft size={16} color={buttonForeground.secondary} strokeWidth={1.5} />}
      >
        Voltar
      </Button>

      <Button
        variant="ghostDanger"
        style={styles.cancelBtn}
        onPress={handleCancel}
        disabled={isLoading}
      >
        Cancelar
      </Button>
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
  const { data: condPags = [] } = useCondPags()

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
      ? (transportadoras.find((x) => x.protheusCode === customer.transpPadrao) ?? null)
      : null
    const c = customer.condPagPadrao
      ? (condPags.find((x) => x.protheusCode === customer.condPagPadrao) ?? null)
      : null
    setTransportadora(t)
    setCondPag(c)
  }, [customer, transportadoras, condPags])

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
        customerId: customer.id,
        branchId: branch.id,
        items,
        mennota: mennota || undefined,
        notes: notes || undefined,
        transportId: transportadora?.id,
        condId: condPag?.id,
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
          [{ text: 'OK', onPress: () => router.replace('/(app)/pedidos') }]
        )
      }
    } catch (err: unknown) {
      setIsPending(false)
      Alert.alert(
        'Erro ao criar pedido',
        getApiErrorMessage(err, 'Verifique os dados e tente novamente.')
      )
    }
  }

  const stepLabel = ['Selecionar cliente / filial', 'Adicionar produtos', 'Confirmar']

  return (
    <View style={{ flex: 1, backgroundColor: colors.neutral.bg }}>
      <Stack.Screen options={{ title: `Novo pedido — ${stepLabel[step - 1]}` }} />
      <StepIndicator current={step} />

      <View style={{ flex: 1, padding: spacing.md }}>
        {step === 1 && <Step1 onComplete={handleStep1Complete} />}
        {step === 2 && (
          <View style={{ flex: 1 }}>
            <Step2 cart={cart} onCartChange={setCart} onBack={() => setStep(1)} />
            <Button
              testID="btn-proximo-step"
              size="lg"
              style={styles.confirmBtn}
              disabled={cart.length === 0}
              onPress={() => setStep(3)}
              iconPosition="right"
              icon={<ArrowRight size={16} color={buttonForeground.primary} strokeWidth={1.5} />}
            >
              Próximo
            </Button>
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
  steps: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.neutral.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.border,
  },
  step: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.neutral.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepActive: { backgroundColor: colors.brand.primary },
  stepText: { fontFamily: typography.fontFamily.bodyBold, color: colors.neutral.textSub },
  stepTextActive: { color: colors.neutral.white },
  stepTitle: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 16,
    color: colors.brand.dark,
    marginBottom: spacing.md,
  },
  cacheBadge: { marginBottom: spacing.md },
  input: { marginBottom: spacing.sm },
  listItem: { marginBottom: spacing.sm },
  listItemTitle: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: 14,
    color: colors.brand.dark,
  },
  listItemSub: {
    fontFamily: typography.fontFamily.body,
    fontSize: 12,
    color: colors.neutral.textSub,
    marginTop: spacing.xs,
  },
  cartBox: {
    backgroundColor: colors.brand.tint,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cartTitle: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 13,
    color: colors.brand.primary,
    marginBottom: spacing.sm,
  },
  cartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  cartName: {
    flex: 1,
    fontFamily: typography.fontFamily.body,
    fontSize: 13,
    color: colors.brand.dark,
  },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  qtyNum: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 14,
    minWidth: 20,
    textAlign: 'center',
    color: colors.brand.dark,
  },
  empty: {
    fontFamily: typography.fontFamily.body,
    color: colors.neutral.textSub,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  summaryBox: { borderRadius: radius.md, marginBottom: spacing.sm },
  summaryLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: 12,
    color: colors.neutral.textSub,
    marginBottom: spacing.sm,
  },
  summaryValue: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: 15,
    color: colors.brand.dark,
  },
  totalLabel: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 16,
    color: colors.brand.dark,
  },
  totalValue: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 20,
    color: colors.brand.primary,
  },
  confirmBtn: { marginTop: spacing.md },
  backBtn: { marginTop: spacing.sm, backgroundColor: colors.neutral.white },
  cancelBtn: { marginTop: spacing.xs, marginBottom: spacing.lg },
  selectedCard: {
    backgroundColor: colors.brand.tint,
    borderColor: colors.brand.tint,
    borderRadius: radius.md,
  },
  selectedCardLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: 11,
    color: colors.neutral.textSub,
    marginBottom: spacing.xs,
  },
  selectedCardValue: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 15,
    color: colors.brand.dark,
  },
  selectedCardChange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  selectedCardChangeText: {
    fontFamily: typography.fontFamily.body,
    fontSize: 12,
    color: colors.brand.primary,
  },
})
