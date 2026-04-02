import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { usePedidos } from '../../../src/hooks/usePedidos'
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

function OrderCard({ order }: { order: Order }) {
  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.customer}>{order.customer.name}</Text>
        <Text style={styles.date}>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</Text>
        <Text style={styles.items}>{order.items.length} item(s)</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.total}>R$ {Number(order.total).toFixed(2)}</Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[order.status] + '22' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[order.status] }]}>
            {STATUS_LABEL[order.status]}
          </Text>
        </View>
      </View>
    </View>
  )
}

export default function PedidosScreen() {
  const router = useRouter()
  const { data: orders, isLoading, refetch } = usePedidos()

  return (
    <View style={styles.container}>
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <OrderCard order={item} />}
          onRefresh={refetch}
          refreshing={isLoading}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum pedido ainda.</Text>}
          contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
        />
      )}

      {/* Botão flutuante — Novo Pedido */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(app)/novo-pedido')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    elevation: 1,
  },
  customer: { fontSize: 14, fontWeight: '600', color: '#111827' },
  date: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  items: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  total: { fontSize: 16, fontWeight: '700', color: '#111827' },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  empty: { color: '#9ca3af', textAlign: 'center', marginTop: 60 },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
})
