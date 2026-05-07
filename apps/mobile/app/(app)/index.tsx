import { View, Text, FlatList, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useDashboardStats, usePedidos, useMetaVendedor } from '../../src/hooks/usePedidos'
import { useAuthStore } from '../../src/store/auth.store'
import { useLogout } from '../../src/hooks/useAuth'
import { useTheme } from '../../src/theme'
import { StatGridSkeleton, OrderRowSkeleton, EmptyState } from '../../src/components/Skeleton'
import { Ionicons } from '@expo/vector-icons'
import { LogOut } from 'lucide-react-native'
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
const STAT_ACCENT = ['#1B4FA8', '#f59e0b', '#16a34a', '#29BEFF']

export default function DashboardScreen() {
  const user    = useAuthStore((s) => s.user)
  const theme   = useTheme()
  const { data: stats, isLoading: loadingStats }         = useDashboardStats()
  const { data: recentOrders, isLoading: loadingOrders } = usePedidos(5)
  const { data: meta }                                   = useMetaVendedor()
  const { mutate: logout } = useLogout()

  const statItems = [
    { label: 'Total de pedidos', value: stats?.totalOrders  ?? 0 },
    { label: 'Pendentes',        value: stats?.pendingOrders ?? 0 },
    { label: 'Sincronizados',    value: stats?.syncedOrders  ?? 0 },
    { label: 'Receita total',    value: `R$ ${Number(stats?.totalRevenue ?? 0).toFixed(2)}` },
  ]

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.greeting}>
          Olá, {user?.name?.split(' ')[0]}
        </Text>
        <TouchableOpacity onPress={() => logout()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <LogOut size={20} color="#64748B" />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      {loadingStats ? (
        <StatGridSkeleton />
      ) : (
        <View style={s.statsGrid}>
          {statItems.map((item, i) => (
            <View key={item.label} style={[s.statCard, { borderTopColor: STAT_ACCENT[i] }]}>
              <Text style={s.statValue}>{item.value}</Text>
              <Text style={s.statLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Meta do mês */}
      {meta && (
        <View style={s.metaCard}>
          <View>
            <Text style={s.metaLabel}>Meta do mês</Text>
            <Text style={s.metaPeriodo}>{meta.periodo.slice(0, 4)}/{meta.periodo.slice(4)}</Text>
          </View>
          <Text style={s.metaValue}>
            R$ {Number(meta.meta).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </Text>
        </View>
      )}

      {/* Últimos pedidos */}
      <Text style={s.sectionTitle}>Últimos pedidos</Text>

      {loadingOrders ? (
        <View>
          {[0, 1, 2].map((i) => <OrderRowSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={recentOrders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <OrderRow order={item} />}
          scrollEnabled={false}
          ListEmptyComponent={
            <EmptyState
              icon={<Ionicons name="receipt-outline" size={28} color="#64748B" />}
              title="Nenhum pedido ainda"
              description="Seus pedidos mais recentes aparecerão aqui."
            />
          }
        />
      )}
    </ScrollView>
  )
}

function OrderRow({ order }: { order: Order }) {
  return (
    <View style={s.orderRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.orderCustomer}>{order.customer.name}</Text>
        <Text style={s.orderDate}>
          {new Date(order.createdAt).toLocaleDateString('pt-BR')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.orderTotal}>R$ {Number(order.total).toFixed(2)}</Text>
        <Text style={[s.orderStatus, { color: STATUS_COLOR[order.status] }]}>
          {STATUS_LABEL[order.status]}
        </Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greeting: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0D2045',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    borderRadius: 12,
    padding: 14,
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopWidth: 3,
    shadowColor: '#0D2045',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0D2045',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 2,
    color: '#64748B',
  },
  metaCard: {
    backgroundColor: '#0D2045',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  metaLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#29BEFF',
    marginBottom: 2,
  },
  metaPeriodo: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#94A3B8',
  },
  metaValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#FFFFFF',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
    color: '#0D2045',
  },
  orderRow: {
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0D2045',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  orderCustomer: {
    fontWeight: '600',
    fontSize: 14,
    color: '#0D2045',
  },
  orderDate: {
    fontSize: 12,
    marginTop: 2,
    color: '#64748B',
  },
  orderTotal: {
    fontWeight: '700',
    fontSize: 14,
    color: '#0D2045',
  },
  orderStatus: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
})
