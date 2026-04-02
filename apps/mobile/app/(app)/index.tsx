import { View, Text, FlatList, ActivityIndicator, StyleSheet, ScrollView } from 'react-native'
import { useDashboardStats, usePedidos } from '../../src/hooks/usePedidos'
import { useAuthStore } from '../../src/store/auth.store'
import { useLogout } from '../../src/hooks/useAuth'
import { TouchableOpacity } from 'react-native'
import type { Order } from '@addere/types'

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  SYNCED: 'Sincronizado',
  CANCELLED: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  PENDING: '#f59e0b',
  SYNCED: '#16a34a',
  CANCELLED: '#dc2626',
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function OrderRow({ order }: { order: Order }) {
  return (
    <View style={styles.orderRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.orderCustomer}>{order.customer.name}</Text>
        <Text style={styles.orderDate}>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.orderTotal}>R$ {Number(order.total).toFixed(2)}</Text>
        <Text style={[styles.orderStatus, { color: STATUS_COLOR[order.status] }]}>
          {STATUS_LABEL[order.status]}
        </Text>
      </View>
    </View>
  )
}

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user)
  const { data: stats, isLoading: loadingStats } = useDashboardStats()
  const { data: recentOrders, isLoading: loadingOrders } = usePedidos(5)
  const { mutate: logout } = useLogout()

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.header}>
        <Text style={styles.greeting}>Olá, {user?.name?.split(' ')[0]}</Text>
        <TouchableOpacity onPress={() => logout()}>
          <Text style={styles.logoutBtn}>Sair</Text>
        </TouchableOpacity>
      </View>

      {loadingStats ? (
        <ActivityIndicator style={{ marginVertical: 16 }} />
      ) : (
        <View style={styles.statsGrid}>
          <StatCard label="Total de pedidos" value={stats?.totalOrders ?? 0} color="#2563eb" />
          <StatCard label="Pendentes" value={stats?.pendingOrders ?? 0} color="#f59e0b" />
          <StatCard label="Sincronizados" value={stats?.syncedOrders ?? 0} color="#16a34a" />
          <StatCard
            label="Receita total"
            value={`R$ ${Number(stats?.totalRevenue ?? 0).toFixed(2)}`}
            color="#7c3aed"
          />
        </View>
      )}

      <Text style={styles.sectionTitle}>Últimos pedidos</Text>

      {loadingOrders ? (
        <ActivityIndicator style={{ marginVertical: 16 }} />
      ) : (
        <FlatList
          data={recentOrders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <OrderRow order={item} />}
          scrollEnabled={false}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum pedido ainda.</Text>}
        />
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  greeting: { fontSize: 20, fontWeight: '700', color: '#111827' },
  logoutBtn: { color: '#dc2626', fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    flex: 1,
    minWidth: '45%',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: { fontSize: 20, fontWeight: '700', color: '#111827' },
  statLabel: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 8 },
  orderRow: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    elevation: 1,
  },
  orderCustomer: { fontWeight: '600', color: '#111827' },
  orderDate: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  orderTotal: { fontWeight: '700', color: '#111827' },
  orderStatus: { fontSize: 12, marginTop: 2, fontWeight: '600' },
  empty: { color: '#9ca3af', textAlign: 'center', padding: 24 },
})
