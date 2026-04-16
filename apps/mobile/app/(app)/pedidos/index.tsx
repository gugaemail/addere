import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { usePedidos } from '../../../src/hooks/usePedidos'
import { useTheme } from '../../../src/theme'
import { OrderRowSkeleton, EmptyState } from '../../../src/components/Skeleton'
import type { Order } from '@addere/types'

const STATUS_COLOR: Record<string, string> = {
  PENDING:   '#f59e0b',
  SYNCED:    '#16a34a',
  CANCELLED: '#dc2626',
}
const STATUS_LABEL: Record<string, string> = {
  PENDING:   'Pendente',
  SYNCED:    'Sincronizado',
  CANCELLED: 'Cancelado',
}

function OrderCard({ order, theme }: { order: Order; theme: ReturnType<typeof useTheme> }) {
  const statusColor = STATUS_COLOR[order.status] ?? '#6b7280'
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.customer, { color: theme.text }]}>{order.customer.name}</Text>
        <Text style={[styles.date, { color: theme.textMuted }]}>
          {new Date(order.createdAt).toLocaleDateString('pt-BR')}
        </Text>
        <Text style={[styles.items, { color: theme.textMuted }]}>{order.items.length} item(s)</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.total, { color: theme.text }]}>R$ {Number(order.total).toFixed(2)}</Text>
        <View style={[styles.badge, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.badgeText, { color: statusColor }]}>
            {STATUS_LABEL[order.status]}
          </Text>
        </View>
      </View>
    </View>
  )
}

export default function PedidosScreen() {
  const router = useRouter()
  const theme  = useTheme()
  const { data: orders, isLoading, refetch } = usePedidos()

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {isLoading ? (
        <View style={{ padding: 16 }}>
          {[0, 1, 2, 3].map((i) => <OrderRowSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <OrderCard order={item} theme={theme} />}
          onRefresh={refetch}
          refreshing={false}
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="receipt-outline" size={28} color={theme.textMuted} />}
              title="Nenhum pedido ainda"
              description="Toque no botão + para criar seu primeiro pedido."
            />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        />
      )}

      {/* FAB — Novo Pedido */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: theme.brand }]}
        onPress={() => router.push('/(app)/novo-pedido')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  card: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    elevation: 1,
  },
  customer:   { fontSize: 14, fontWeight: '600' },
  date:       { fontSize: 12, marginTop: 2 },
  items:      { fontSize: 12, marginTop: 2 },
  total:      { fontSize: 16, fontWeight: '700' },
  badge:      { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  badgeText:  { fontSize: 11, fontWeight: '700' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
})
