import { useState, useEffect } from 'react'
import { View, Text, FlatList, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useDashboardStats, usePedidos, useMetaVendedor } from '../../src/hooks/usePedidos'
import { useAuthStore } from '../../src/store/auth.store'
import { useLogout } from '../../src/hooks/useAuth'
import { useTheme } from '../../src/theme'
import { StatGridSkeleton, OrderRowSkeleton, EmptyState } from '../../src/components/Skeleton'
import { Ionicons } from '@expo/vector-icons'
import { LogOut } from 'lucide-react-native'
import type { Order, DashboardStats } from '@addere/types'

const META_CACHE_KEY   = 'addere_meta_cache'
const STATS_CACHE_KEY  = 'addere_stats_cache'
const ORDERS_CACHE_KEY = 'addere_orders_cache'

type MetaData = { periodo: string; vendido: string; meta: string }

function useStatsComCache(): DashboardStats | null {
  const [cached, setCached] = useState<DashboardStats | null>(null)
  const query = useDashboardStats()

  useEffect(() => {
    AsyncStorage.getItem(STATS_CACHE_KEY).then((v) => {
      if (v) setCached(JSON.parse(v) as DashboardStats)
    })
  }, [])

  useEffect(() => {
    if (query.data) {
      AsyncStorage.setItem(STATS_CACHE_KEY, JSON.stringify(query.data))
      setCached(query.data)
    }
  }, [query.data])

  return query.data ?? cached
}

function usePedidosComCache(): Order[] | null {
  const [cached, setCached] = useState<Order[] | null>(null)
  const query = usePedidos(5)

  useEffect(() => {
    AsyncStorage.getItem(ORDERS_CACHE_KEY).then((v) => {
      if (v) setCached(JSON.parse(v) as Order[])
    })
  }, [])

  useEffect(() => {
    if (query.data) {
      AsyncStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(query.data))
      setCached(query.data)
    }
  }, [query.data])

  return query.data ?? cached
}

function useMetaComCache(): MetaData | null {
  const [cached, setCached] = useState<MetaData | null>(null)
  const query = useMetaVendedor()

  useEffect(() => {
    AsyncStorage.getItem(META_CACHE_KEY).then((v) => {
      if (v) setCached(JSON.parse(v) as MetaData)
    })
  }, [])

  useEffect(() => {
    if (query.data) {
      AsyncStorage.setItem(META_CACHE_KEY, JSON.stringify(query.data))
      setCached(query.data)
    }
  }, [query.data])

  return query.data ?? cached
}

const STATUS_LABEL: Record<string, string> = {
  PENDING:   'Pendente',
  SYNCED:    'Sincronizado',
  CANCELLED: 'Cancelado',
}
const STATUS_COLOR: Record<string, string> = {
  PENDING:   '#F59E0B',
  SYNCED:    '#22C55E',
  CANCELLED: '#EF4444',
}
const STAT_ACCENT = ['#1B4FA8', '#F59E0B', '#22C55E', '#29BEFF']

function fmtMoeda(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function MetaProgress({ vendido, meta, periodo }: { vendido: number; meta: number; periodo: string }) {
  const pct      = meta > 0 ? Math.min((vendido / meta) * 100, 100) : 0
  const pctStr   = pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const barColor = pct >= 80 ? '#22C55E' : pct >= 50 ? '#F59E0B' : '#1B4FA8'
  const mes      = periodo.length === 6
    ? `${periodo.slice(4)}/${periodo.slice(0, 4)}`
    : '—'

  return (
    <View style={[s.metaCard, { borderTopColor: barColor }]}>
      <View style={s.metaHeader}>
        <Text style={s.metaTitulo}>Meta do mês — {mes}</Text>
        <Text style={[s.metaPct, { color: barColor }]}>{pctStr}%</Text>
      </View>

      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: barColor }]} />
      </View>

      <View style={s.metaFooter}>
        <Text style={s.metaFooterText}>
          Vendido{' '}
          <Text style={s.metaFooterBold}>R$ {fmtMoeda(vendido)}</Text>
        </Text>
        <Text style={s.metaFooterText}>
          Meta{' '}
          <Text style={s.metaFooterBold}>R$ {fmtMoeda(meta)}</Text>
        </Text>
      </View>
    </View>
  )
}

export default function DashboardScreen() {
  const user    = useAuthStore((s) => s.user)
  const theme   = useTheme()
  const stats        = useStatsComCache()
  const recentOrders = usePedidosComCache()
  const loadingStats   = stats === null
  const loadingOrders  = recentOrders === null
  const metaData                                         = useMetaComCache()
  const { mutate: logout } = useLogout()

  const totalRevenue = Number(stats?.totalRevenue ?? 0)

  const statItems = [
    { label: 'Total de pedidos', value: String(stats?.totalOrders  ?? 0) },
    { label: 'Pendentes',        value: String(stats?.pendingOrders ?? 0) },
    { label: 'Sincronizados',    value: String(stats?.syncedOrders  ?? 0) },
    { label: 'Receita total',    value: `R$ ${fmtMoeda(totalRevenue)}` },
  ]

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.greeting}>Olá, {user?.name?.split(' ')[0]}</Text>
        <TouchableOpacity
          onPress={() => Alert.alert('Conta', 'Deseja encerrar a sessão?', [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Sair', style: 'destructive', onPress: () => logout() },
          ])}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
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

      {/* Barra de meta — sempre visível, usa cache offline quando API indisponível */}
      <MetaProgress
        vendido={Number(metaData?.vendido ?? 0)}
        meta={Number(metaData?.meta ?? 0)}
        periodo={metaData?.periodo ?? ''}
      />

      {/* Últimos pedidos */}
      <Text style={s.sectionTitle}>Últimos pedidos</Text>

      {loadingOrders ? (
        <View>
          {[0, 1, 2].map((i) => <OrderRowSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={recentOrders?.slice(0, 5)}
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
        <Text style={s.orderDate}>{new Date(order.createdAt).toLocaleDateString('pt-BR')}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.orderTotal}>R$ {fmtMoeda(Number(order.total))}</Text>
        <Text style={[s.orderStatus, { color: STATUS_COLOR[order.status] }]}>
          {STATUS_LABEL[order.status]}
        </Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  scroll:   { flex: 1, backgroundColor: '#F8FAFC' },
  content:  { padding: 16 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greeting: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#0D2045',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
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
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    color: '#0D2045',
  },
  statLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 2,
    color: '#64748B',
  },
  // ── Barra de meta ──────────────────────────────────────────
  metaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopWidth: 3,
    borderTopColor: '#1B4FA8',
    padding: 16,
    marginBottom: 20,
    shadowColor: '#0D2045',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 2,
  },
  metaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  metaTitulo: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: '#64748B',
  },
  metaPct: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
  },
  barTrack: {
    height: 8,
    backgroundColor: '#E8F4FF',
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 8,
  },
  barFill: {
    height: 8,
    borderRadius: 999,
  },
  metaFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaFooterText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#64748B',
  },
  metaFooterBold: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: '#0D2045',
  },
  // ── Últimos pedidos ─────────────────────────────────────────
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
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
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    color: '#0D2045',
  },
  orderDate: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 2,
    color: '#64748B',
  },
  orderTotal: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#0D2045',
  },
  orderStatus: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
})
