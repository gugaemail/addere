import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { useLocalSearchParams, Stack } from 'expo-router'
import { useCliente } from '../../../src/hooks/useClientes'
import type { Order } from '@addere/types'

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

function OrderCard({ order }: { order: Order }) {
  return (
    <View style={styles.orderCard}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={styles.orderDate}>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</Text>
        <Text style={[styles.orderStatus, { color: STATUS_COLOR[order.status] }]}>
          {STATUS_LABEL[order.status]}
        </Text>
      </View>
      <Text style={styles.orderTotal}>R$ {Number(order.total).toFixed(2)}</Text>
      <Text style={styles.orderItems}>{order.items.length} item(s)</Text>
    </View>
  )
}

export default function ClienteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: customer, isLoading, error } = useCliente(id)

  if (isLoading) return <ActivityIndicator style={{ flex: 1, marginTop: 40 }} />
  if (error || !customer) return (
    <View style={styles.center}>
      <Text style={styles.errorText}>Cliente não encontrado.</Text>
    </View>
  )

  const orders = (customer as any).orders as Order[] ?? []

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Stack.Screen options={{ title: customer.name }} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dados do cliente</Text>
        <InfoRow label="Nome" value={customer.name} />
        <InfoRow label="Documento" value={customer.document} />
        <InfoRow label="Email" value={customer.email} />
        <InfoRow label="Telefone" value={customer.phone} />
        <InfoRow label="Endereço" value={customer.address} />
        {customer.protheusCode && <InfoRow label="Cód. Protheus" value={customer.protheusCode} />}
      </View>

      <Text style={styles.sectionTitle}>Pedidos ({orders.length})</Text>
      {orders.length === 0 ? (
        <Text style={styles.empty}>Nenhum pedido para este cliente.</Text>
      ) : (
        orders.map((o) => <OrderCard key={o.id} order={o} />)
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
  orderCard: { backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, elevation: 1 },
  orderDate: { color: '#6b7280', fontSize: 13 },
  orderStatus: { fontSize: 12, fontWeight: '600' },
  orderTotal: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 4 },
  orderItems: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  empty: { color: '#9ca3af', textAlign: 'center', padding: 24 },
  errorText: { color: '#dc2626' },
})
