import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native'
import { useLocalSearchParams, Stack, useRouter } from 'expo-router'
import { ChevronRight, Phone } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import { useCliente } from '../../../src/hooks/useClientes'
import { useFieldVisible } from '../../../src/hooks/useFieldConfig'
import { LoadingState } from '../../../src/components/Skeleton'
import { Badge } from '../../../src/components/ui/Badge'
import { Card } from '../../../src/components/ui/Card'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { colors, spacing, typography } from '../../../src/theme'
import type { Order } from '@addere/types'
import { fmtMoeda, fmtData, formatDocument } from '../../../src/utils/format'
import { STATUS_LABEL, STATUS_BADGE } from '../../../src/utils/orderStatus'

// Remove caracteres não numéricos e adiciona +55 se necessário
function toDialable(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`
  return `+55${digits}`
}

function handlePhonePress(phone: string) {
  const dialable = toDialable(phone)
  const waUrl = `https://wa.me/${dialable.replace('+', '')}`

  Alert.alert(
    'Telefone',
    phone,
    [
      {
        text: 'Ligar',
        onPress: () => Linking.openURL(`tel:${dialable}`),
      },
      {
        text: 'WhatsApp',
        onPress: () => Linking.openURL(waUrl),
      },
      {
        text: 'Copiar número',
        onPress: () => Clipboard.setStringAsync(phone),
      },
      { text: 'Cancelar', style: 'cancel' },
    ],
    { cancelable: true }
  )
}

function PhoneRow({ phone }: { phone: string | null | undefined }) {
  if (!phone) {
    return (
      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Telefone</Text>
        <Text style={styles.infoValue}>Não informado</Text>
      </View>
    )
  }

  return (
    <TouchableOpacity
      style={styles.infoRow}
      onPress={() => handlePhonePress(phone)}
      activeOpacity={0.7}
    >
      <View style={styles.phoneLabel}>
        <Phone size={13} color={colors.brand.accent} strokeWidth={1.5} />
        <Text style={styles.infoLabel}>Telefone</Text>
      </View>
      <Text style={[styles.infoValue, styles.phoneValue]}>{phone}</Text>
    </TouchableOpacity>
  )
}

function formatUltcom(ultcom: string | null | undefined): string | null {
  if (!ultcom) return null
  return fmtData(ultcom)
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

function OrderCard({ order, onPress }: { order: Order; onPress: () => void }) {
  const variant = STATUS_BADGE[order.status] ?? 'neutral'
  return (
    <Card onPress={onPress} style={styles.orderCard}>
      <View style={{ flex: 1 }}>
        <View style={styles.orderHeader}>
          <Text style={styles.orderDate}>{fmtData(order.createdAt)}</Text>
          <Badge variant={variant}>{STATUS_LABEL[order.status] ?? order.status}</Badge>
        </View>
        <Text style={styles.orderTotal}>R$ {fmtMoeda(order.total)}</Text>
        <Text style={styles.orderItems}>{order.items.length} item(s)</Text>
      </View>
      <ChevronRight
        size={16}
        color={colors.neutral.placeholder}
        strokeWidth={1.5}
        style={{ marginLeft: spacing.sm }}
      />
    </Card>
  )
}

export default function ClienteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { data: customer, isLoading, error } = useCliente(id)
  const showDocument = useFieldVisible('customer.document')
  const showEmail = useFieldVisible('customer.email')
  const showPhone = useFieldVisible('customer.phone')
  const showAddress = useFieldVisible('customer.address')
  const showMunicipio = useFieldVisible('customer.municipio')
  const showUf = useFieldVisible('customer.uf')
  const showUltcom = useFieldVisible('customer.ultcom')
  const showTranspPadrao = useFieldVisible('customer.transpPadrao')
  const showCondPagPadrao = useFieldVisible('customer.condPagPadrao')
  const showTes = useFieldVisible('customer.tes')
  const showXcodemp = useFieldVisible('customer.xcodemp')

  if (isLoading) return <LoadingState style={styles.container} />
  if (error || !customer)
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.errorText}>Cliente não encontrado.</Text>
      </View>
    )

  const orders = customer.orders ?? []

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      <Stack.Screen options={{ title: customer.name }} />

      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Dados do cliente</Text>
        <InfoRow label="Nome" value={customer.name} />
        {showDocument && <InfoRow label="Documento" value={formatDocument(customer.document)} />}
        {showEmail && <InfoRow label="Email" value={customer.email} />}
        {showPhone && <PhoneRow phone={customer.phone} />}
        {showAddress && <InfoRow label="Endereço" value={customer.address} />}
        {showMunicipio && <InfoRow label="Cidade" value={customer.municipio} />}
        {showUf && <InfoRow label="Estado" value={customer.uf} />}
        {showUltcom && <InfoRow label="Última compra" value={formatUltcom(customer.ultcom)} />}
        {showTranspPadrao && (
          <InfoRow label="Transportadora padrão" value={customer.transpPadrao} />
        )}
        {showCondPagPadrao && (
          <InfoRow label="Cond. Pagamento padrão" value={customer.condPagPadrao} />
        )}
        {showTes && <InfoRow label="Código TES" value={customer.tes} />}
        {showXcodemp && <InfoRow label="Filial de faturamento" value={customer.xcodemp} />}
        {customer.protheusCode && <InfoRow label="Cód. Protheus" value={customer.protheusCode} />}
      </Card>

      <Text style={styles.sectionTitle}>Pedidos ({orders.length})</Text>
      {orders.length === 0 ? (
        <EmptyState
          illustration="orders"
          title="Nenhum pedido"
          subtitle="Nenhum pedido para este cliente."
        />
      ) : (
        orders.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            onPress={() => router.push(`/(app)/clientes/pedido/${o.id}`)}
          />
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  section: { marginBottom: spacing.md },
  sectionTitle: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.md,
    color: colors.brand.dark,
    marginBottom: spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.neutral.subtle,
  },
  infoLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  infoValue: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
    maxWidth: '60%',
    textAlign: 'right',
  },
  orderCard: { marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center' },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderDate: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  orderTotal: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.lg,
    color: colors.brand.dark,
    marginTop: spacing.xs,
  },
  orderItems: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
    marginTop: spacing.xs,
  },
  errorText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.semantic.danger,
  },
  phoneLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  phoneValue: { color: colors.brand.accent, textDecorationLine: 'underline' },
})
