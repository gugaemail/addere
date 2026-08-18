import { View, Text, FlatList, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native'
import { useDashboardStats, usePedidos, useMetaVendedor } from '../../src/hooks/usePedidos'
import { useAuthStore } from '../../src/store/auth.store'
import { useLogout } from '../../src/hooks/useAuth'
import { StatGridSkeleton, OrderRowSkeleton } from '../../src/components/Skeleton'
import { Card } from '../../src/components/ui/Card'
import { EmptyState } from '../../src/components/ui/EmptyState'
import { LogOut } from 'lucide-react-native'
import { colors, spacing, radius, typography } from '../../src/theme'
import { STATUS_LABEL, STATUS_COLOR } from '../../src/utils/orderStatus'
import { fmtMoeda, fmtData } from '../../src/utils/format'
import type { Order } from '@addere/types'

const STAT_ACCENT = [
  colors.brand.primary,
  colors.semantic.warning,
  colors.semantic.success,
  colors.brand.accent,
]

function MetaProgress({
  vendido,
  meta,
  periodo,
}: {
  vendido: number
  meta: number
  periodo: string
}) {
  const pct = meta > 0 ? Math.min((vendido / meta) * 100, 100) : 0
  const pctStr = pct.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const barColor =
    pct >= 80 ? colors.semantic.success : pct >= 50 ? colors.semantic.warning : colors.brand.primary
  const mes = periodo.length === 6 ? `${periodo.slice(4)}/${periodo.slice(0, 4)}` : '—'

  return (
    <Card style={[s.metaCard, { borderTopColor: barColor }]}>
      <View style={s.metaHeader}>
        <Text style={s.metaTitulo}>Meta do mês — {mes}</Text>
        <Text style={[s.metaPct, { color: barColor }]}>{pctStr}%</Text>
      </View>

      <View style={s.barTrack}>
        <View
          style={[s.barFill, { width: `${pct}%` as `${number}%`, backgroundColor: barColor }]}
        />
      </View>

      <View style={s.metaFooter}>
        <Text style={s.metaFooterText}>
          Vendido <Text style={s.metaFooterBold}>R$ {fmtMoeda(vendido)}</Text>
        </Text>
        <Text style={s.metaFooterText}>
          Meta <Text style={s.metaFooterBold}>R$ {fmtMoeda(meta)}</Text>
        </Text>
      </View>
    </Card>
  )
}

export default function DashboardScreen() {
  const user = useAuthStore((s) => s.user)
  // O PersistQueryClientProvider restaura estas queries do AsyncStorage,
  // então o dado cacheado aparece imediatamente mesmo offline
  const { data: stats, isLoading: loadingStats } = useDashboardStats()
  const { data: recentOrders, isLoading: loadingOrders } = usePedidos(5)
  const { data: metaData } = useMetaVendedor()
  const { mutate: logout } = useLogout()

  const totalRevenue = Number(stats?.totalRevenue ?? 0)

  const statItems = [
    { label: 'Total de pedidos', value: String(stats?.totalOrders ?? 0) },
    { label: 'Pendentes', value: String(stats?.pendingOrders ?? 0) },
    { label: 'Sincronizados', value: String(stats?.syncedOrders ?? 0) },
    { label: 'Receita total', value: `R$ ${fmtMoeda(totalRevenue)}` },
  ]

  return (
    <ScrollView testID="screen-home" style={s.scroll} contentContainerStyle={s.content}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.greeting}>Olá, {user?.name?.split(' ')[0]}</Text>
        <TouchableOpacity
          onPress={() =>
            Alert.alert('Conta', 'Deseja encerrar a sessão?', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Sair', style: 'destructive', onPress: () => logout() },
            ])
          }
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <LogOut size={20} color={colors.semantic.muted} strokeWidth={1.5} />
        </TouchableOpacity>
      </View>

      {/* Stats */}
      {loadingStats ? (
        <StatGridSkeleton />
      ) : (
        <View style={s.statsGrid}>
          {statItems.map((item, i) => (
            <Card key={item.label} style={[s.statCard, { borderTopColor: STAT_ACCENT[i] }]}>
              <Text style={s.statValue}>{item.value}</Text>
              <Text style={s.statLabel}>{item.label}</Text>
            </Card>
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
          {[0, 1, 2].map((i) => (
            <OrderRowSkeleton key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={recentOrders?.slice(0, 5)}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <OrderRow order={item} />}
          scrollEnabled={false}
          ListEmptyComponent={
            <EmptyState
              illustration="orders"
              title="Nenhum pedido ainda"
              subtitle="Seus pedidos mais recentes aparecerão aqui."
            />
          }
        />
      )}
    </ScrollView>
  )
}

function OrderRow({ order }: { order: Order }) {
  return (
    <Card style={s.orderRow}>
      <View style={{ flex: 1 }}>
        <Text style={s.orderCustomer}>{order.customer.name}</Text>
        <Text style={s.orderDate}>{fmtData(order.createdAt)}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={s.orderTotal}>R$ {fmtMoeda(Number(order.total))}</Text>
        <Text style={[s.orderStatus, { color: STATUS_COLOR[order.status] }]}>
          {STATUS_LABEL[order.status]}
        </Text>
      </View>
    </Card>
  )
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.neutral.bg },
  content: { padding: spacing.md },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  greeting: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 20,
    color: colors.brand.dark,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    borderTopWidth: 3,
  },
  statValue: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 20,
    color: colors.brand.dark,
  },
  statLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: 12,
    marginTop: spacing.xs,
    color: colors.neutral.textSub,
  },
  // ── Barra de meta ──────────────────────────────────────────
  metaCard: {
    borderTopWidth: 3,
    borderTopColor: colors.brand.primary,
    marginBottom: spacing.lg,
  },
  metaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.sm,
  },
  metaTitulo: {
    fontFamily: typography.fontFamily.body,
    fontSize: 12,
    color: colors.neutral.textSub,
  },
  metaPct: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 22,
  },
  barTrack: {
    height: 8,
    backgroundColor: colors.brand.tint,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  barFill: {
    height: 8,
    borderRadius: radius.full,
  },
  metaFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaFooterText: {
    fontFamily: typography.fontFamily.body,
    fontSize: 11,
    color: colors.neutral.textSub,
  },
  metaFooterBold: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: 11,
    color: colors.brand.dark,
  },
  // ── Últimos pedidos ─────────────────────────────────────────
  sectionTitle: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: 15,
    marginBottom: spacing.sm,
    color: colors.brand.dark,
  },
  orderRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  orderCustomer: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: 14,
    color: colors.brand.dark,
  },
  orderDate: {
    fontFamily: typography.fontFamily.body,
    fontSize: 12,
    marginTop: spacing.xs,
    color: colors.neutral.textSub,
  },
  orderTotal: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: 14,
    color: colors.brand.dark,
  },
  orderStatus: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: 12,
    marginTop: spacing.xs,
  },
})
