import { View, Text, FlatList, ActivityIndicator, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useDashboardStats, usePedidos } from '../../src/hooks/usePedidos'
import { useAuthStore } from '../../src/store/auth.store'
import { useLogout } from '../../src/hooks/useAuth'
import { useTheme } from '../../src/theme'
import type { Order } from '@addere/types'

const STATUS_LABEL: Record<string, string> = {
  PENDING:   'Pendente',
  SYNCED:    'Sincronizado',
  CANCELLED: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  PENDING:   '#f59e0b',
  SYNCED:    '#16a34a',
  CANCELLED: '#dc2626',
}
const STAT_ACCENT = ['#2563eb', '#f59e0b', '#16a34a', '#7c3aed']

export default function DashboardScreen() {
  const user    = useAuthStore((s) => s.user)
  const theme   = useTheme()
  const { data: stats, isLoading: loadingStats }   = useDashboardStats()
  const { data: recentOrders, isLoading: loadingOrders } = usePedidos(5)
  const { mutate: logout } = useLogout()

  const statItems = [
    { label: 'Total de pedidos',  value: stats?.totalOrders  ?? 0 },
    { label: 'Pendentes',         value: stats?.pendingOrders ?? 0 },
    { label: 'Sincronizados',     value: stats?.syncedOrders  ?? 0 },
    { label: 'Receita total',     value: `R$ ${Number(stats?.totalRevenue ?? 0).toFixed(2)}` },
  ]

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: 16 }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.greeting, { color: theme.text }]}>
          Olá, {user?.name?.split(' ')[0]}
        </Text>
        <TouchableOpacity onPress={() => logout()}>
          <Text style={styles.logoutBtn}>Sair</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      {loadingStats ? (
        <ActivityIndicator color={theme.brand} style={{ marginVertical: 16 }} />
      ) : (
        <View style={styles.statsGrid}>
          {statItems.map((s, i) => (
            <View key={s.label} style={[styles.statCard, { backgroundColor: theme.surface, borderLeftColor: STAT_ACCENT[i] }]}>
              <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Últimos pedidos */}
      <Text style={[styles.sectionTitle, { color: theme.text }]}>Últimos pedidos</Text>

      {loadingOrders ? (
        <ActivityIndicator color={theme.brand} style={{ marginVertical: 16 }} />
      ) : (
        <FlatList
          data={recentOrders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <OrderRow order={item} theme={theme} />}
          scrollEnabled={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>Nenhum pedido ainda.</Text>
            </View>
          }
        />
      )}
    </ScrollView>
  )
}

function OrderRow({ order, theme }: { order: Order; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={[styles.orderRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.orderCustomer, { color: theme.text }]}>{order.customer.name}</Text>
        <Text style={[styles.orderDate, { color: theme.textMuted }]}>
          {new Date(order.createdAt).toLocaleDateString('pt-BR')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.orderTotal, { color: theme.text }]}>
          R$ {Number(order.total).toFixed(2)}
        </Text>
        <Text style={[styles.orderStatus, { color: STATUS_COLOR[order.status] }]}>
          {STATUS_LABEL[order.status]}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  greeting:      { fontSize: 20, fontWeight: '700' },
  logoutBtn:     { color: '#dc2626', fontWeight: '600' },
  statsGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard: {
    borderRadius: 10,
    padding: 14,
    flex: 1,
    minWidth: '45%',
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statValue:     { fontSize: 20, fontWeight: '700' },
  statLabel:     { fontSize: 12, marginTop: 2 },
  sectionTitle:  { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  orderRow: {
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    elevation: 1,
  },
  orderCustomer: { fontWeight: '600', fontSize: 14 },
  orderDate:     { fontSize: 12, marginTop: 2 },
  orderTotal:    { fontWeight: '700', fontSize: 14 },
  orderStatus:   { fontSize: 12, marginTop: 2, fontWeight: '600' },
  emptyContainer:{ alignItems: 'center', paddingVertical: 32 },
  emptyText:     { textAlign: 'center' },
})
