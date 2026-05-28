import { View, Text, ScrollView, ActivityIndicator, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native'
import { useLocalSearchParams, Stack, useRouter } from 'expo-router'
import { ChevronRight, Phone } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import { useCliente } from '../../../src/hooks/useClientes'
import { useFieldVisible } from '../../../src/hooks/useFieldConfig'
import type { Order } from '@addere/types'
import { fmtMoeda, formatDocument } from '../../../src/utils/format'

// Remove caracteres não numéricos e adiciona +55 se necessário
function toDialable(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('55') && digits.length >= 12) return `+${digits}`
  return `+55${digits}`
}

function handlePhonePress(phone: string) {
  const dialable = toDialable(phone)
  const waUrl = `https://wa.me/${dialable.replace('+', '')}`

  Alert.alert('Telefone', phone, [
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
  ])
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
        <Phone size={13} color="#29BEFF" strokeWidth={1.5} />
        <Text style={styles.infoLabel}>Telefone</Text>
      </View>
      <Text style={[styles.infoValue, styles.phoneValue]}>{phone}</Text>
    </TouchableOpacity>
  )
}

function formatUltcom(ultcom: string | null | undefined): string | null {
  if (!ultcom) return null
  return new Date(ultcom).toLocaleDateString('pt-BR')
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: '#f59e0b',
  SYNCED: '#16a34a',
  CANCELLED: '#dc2626',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  SYNCED: 'Sincronizado',
  CANCELLED: 'Cancelado',
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
  return (
    <TouchableOpacity style={styles.orderCard} onPress={onPress} activeOpacity={0.75}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.orderDate}>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</Text>
          <Text style={[styles.orderStatus, { color: STATUS_COLOR[order.status] }]}>
            {STATUS_LABEL[order.status]}
          </Text>
        </View>
        <Text style={styles.orderTotal}>R$ {fmtMoeda(order.total)}</Text>
        <Text style={styles.orderItems}>{order.items.length} item(s)</Text>
      </View>
      <ChevronRight size={16} color="#94A3B8" style={{ marginLeft: 8 }} />
    </TouchableOpacity>
  )
}

export default function ClienteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { data: customer, isLoading, error } = useCliente(id)
  const showDocument  = useFieldVisible('customer.document')
  const showEmail     = useFieldVisible('customer.email')
  const showPhone     = useFieldVisible('customer.phone')
  const showAddress   = useFieldVisible('customer.address')
  const showMunicipio = useFieldVisible('customer.municipio')
  const showUf           = useFieldVisible('customer.uf')
  const showUltcom       = useFieldVisible('customer.ultcom')
  const showTranspPadrao = useFieldVisible('customer.transpPadrao')
  const showCondPagPadrao= useFieldVisible('customer.condPagPadrao')
  const showTes          = useFieldVisible('customer.tes')
  const showXcodemp      = useFieldVisible('customer.xcodemp')

  if (isLoading) return <ActivityIndicator style={{ flex: 1, marginTop: 40 }} />
  if (error || !customer) return (
    <View style={styles.center}>
      <Text style={styles.errorText}>Cliente não encontrado.</Text>
    </View>
  )

  const orders = customer.orders ?? []

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: customer.name }} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dados do cliente</Text>
        <InfoRow label="Nome" value={customer.name} />
        {showDocument  && <InfoRow label="Documento"     value={formatDocument(customer.document)} />}
        {showEmail     && <InfoRow label="Email"          value={customer.email} />}
        {showPhone     && <PhoneRow phone={customer.phone} />}
        {showAddress   && <InfoRow label="Endereço"       value={customer.address} />}
        {showMunicipio && <InfoRow label="Cidade"         value={customer.municipio} />}
        {showUf        && <InfoRow label="Estado"         value={customer.uf} />}
        {showUltcom        && <InfoRow label="Última compra"        value={formatUltcom(customer.ultcom)} />}
        {showTranspPadrao  && <InfoRow label="Transportadora padrão" value={customer.transpPadrao} />}
        {showCondPagPadrao && <InfoRow label="Cond. Pagamento padrão" value={customer.condPagPadrao} />}
        {showTes           && <InfoRow label="Código TES"            value={customer.tes} />}
        {showXcodemp       && <InfoRow label="Filial de faturamento"  value={customer.xcodemp} />}
        {customer.protheusCode && <InfoRow label="Cód. Protheus" value={customer.protheusCode} />}
      </View>

      <Text style={styles.sectionTitle}>Pedidos ({orders.length})</Text>
      {orders.length === 0 ? (
        <Text style={styles.empty}>Nenhum pedido para este cliente.</Text>
      ) : (
        orders.map((o) => (
          <OrderCard key={o.id} order={o} onPress={() => router.push(`/(app)/clientes/pedido/${o.id}`)} />
        ))
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  section: { backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.05, elevation: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  infoLabel: { color: '#6b7280', fontSize: 13 },
  infoValue: { color: '#111827', fontSize: 13, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  orderCard: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, elevation: 1, flexDirection: 'row', alignItems: 'center' },
  orderDate: { color: '#6b7280', fontSize: 13 },
  orderStatus: { fontSize: 12, fontWeight: '600' },
  orderTotal: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 4 },
  orderItems: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  empty: { color: '#9ca3af', textAlign: 'center', padding: 24 },
  errorText: { color: '#dc2626' },
  phoneLabel: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  phoneValue: { color: '#29BEFF', textDecorationLine: 'underline' },
})
