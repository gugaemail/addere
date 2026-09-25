// Home do gerente no app (decisão 1 do teste geral): meta do mês da equipe —
// a soma das metas dos vendedores associados a ele — e as visitas de hoje,
// vendedor por vendedor. Clientes/Pedidos mostram os da equipe (recorte na API).
// O gerente que também vende com o próprio código entra na própria equipe e
// ganha os atalhos do vendedor: plano do dia, semana e carteira.
import { View, Text, ScrollView, StyleSheet, RefreshControl, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { CalendarDays, ChevronRight, Map as MapIcon, Users } from 'lucide-react-native'
import type { ManagerHomeSellerDto } from '@addere/types'
import { useAuthStore } from '../store/auth.store'
import { useManagerHome } from '../hooks/useManager'
import { useHasVendorCode } from '../hooks/useProfile'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { FreshnessFooter } from '../components/intel/FreshnessFooter'
import { colors, spacing, radius, typography } from '../theme'

function todayLabel(): string {
  const label = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const fmtBRL = (value: string | null | undefined): string => {
  const n = Number(value)
  return Number.isFinite(n) && value !== null && value !== undefined
    ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
    : '—'
}

function GoalBar({ pct }: { pct: number | null }) {
  if (pct === null) return null
  return (
    <View style={s.goalTrack}>
      <View style={[s.goalFill, { width: `${pct}%` }]} />
    </View>
  )
}

function SellerCard({ seller }: { seller: ManagerHomeSellerDto }) {
  return (
    <Card testID={`seller-${seller.vendorCode}`}>
      <View style={s.rowBetween}>
        <View style={{ flex: 1 }}>
          <Text style={s.sellerName}>{seller.name}</Text>
          <Text style={s.sellerCode}>Cód. {seller.vendorCode}</Text>
        </View>
        {seller.pct !== null && <Text style={s.goalPct}>{seller.pct}%</Text>}
      </View>
      <GoalBar pct={seller.pct} />
      <Text style={s.goalDetail}>
        {seller.goalAmount
          ? `${fmtBRL(seller.soldAmount)} de ${fmtBRL(seller.goalAmount)}`
          : 'Sem meta capturada neste mês'}
        {` · ${seller.done}/${seller.planned} visitas hoje`}
      </Text>
    </Card>
  )
}

export function ManagerHomeScreen() {
  const user = useAuthStore((s) => s.user)
  const { data, isLoading, isError, refetch, isRefetching } = useManagerHome()
  const router = useRouter()
  const hasVendorCode = useHasVendorCode()

  const firstName = user?.name?.split(' ')[0] ?? ''
  const goal = data?.goal
  const sellers = data?.sellers ?? []
  const withoutGoal = goal ? sellers.length - goal.sellersWithGoal : 0

  return (
    <ScrollView
      testID="screen-equipe"
      style={s.scroll}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.brand.primary}
        />
      }
    >
      <View>
        <Text style={s.greeting}>Olá, {firstName}</Text>
        <Text style={s.date}>
          {todayLabel()}
          {data ? ` · ${sellers.length} ${sellers.length === 1 ? 'vendedor' : 'vendedores'}` : ''}
        </Text>
      </View>

      {/* Meta do mês da equipe — some quando nenhum vendedor tem meta capturada */}
      {goal && goal.sellersWithGoal > 0 && (
        <Card testID="card-meta-equipe">
          <View style={s.rowBetween}>
            <Text style={s.cardTitle}>Meta do mês da equipe</Text>
            {goal.pct !== null && <Text style={s.goalPctLarge}>{goal.pct}%</Text>}
          </View>
          <GoalBar pct={goal.pct} />
          <Text style={s.goalDetail}>
            Vendido {fmtBRL(goal.soldAmount)} de {fmtBRL(goal.goalAmount)}
            {goal.gap && Number(goal.gap) > 0 ? ` · faltam ${fmtBRL(goal.gap)}` : ' · meta batida'}
          </Text>
          {withoutGoal > 0 && (
            <Text style={s.goalHint}>
              {withoutGoal === 1
                ? '1 vendedor sem meta capturada neste mês.'
                : `${withoutGoal} vendedores sem meta capturada neste mês.`}
            </Text>
          )}
        </Card>
      )}

      <View style={s.smallRow}>
        <View style={s.smallCard}>
          <Text style={s.smallValue}>
            {data?.today.done ?? '—'}
            <Text style={s.smallOf}>/{data?.today.planned ?? '—'}</Text>
          </Text>
          <Text style={s.smallLabel}>visitas hoje</Text>
        </View>
        <View style={s.smallCard}>
          <Text style={s.smallValue}>{data ? sellers.length : '—'}</Text>
          <Text style={s.smallLabel}>na equipe</Text>
        </View>
      </View>

      {/* Gerente que vende: os mesmos atalhos da Hoje do vendedor */}
      {hasVendorCode && (
        <View style={s.shortcuts} testID="manager-own-shortcuts">
          <Text style={s.sectionTitle}>Suas vendas</Text>
          {[
            { testID: 'atalho-meu-plano', label: 'Meu plano do dia', Icon: MapIcon, path: '/rota' },
            { testID: 'atalho-semana', label: 'Plano da semana', Icon: CalendarDays, path: '/rota/semana' },
            { testID: 'atalho-carteira', label: 'Minha carteira', Icon: Users, path: '/rota/carteira' },
          ].map(({ testID, label, Icon, path }) => (
            <TouchableOpacity
              key={testID}
              testID={testID}
              style={s.shortcut}
              activeOpacity={0.85}
              onPress={() => router.push(path as never)}
            >
              <Icon size={16} color={colors.brand.primary} strokeWidth={1.5} />
              <Text style={s.shortcutText}>{label}</Text>
              <ChevronRight size={16} color={colors.neutral.placeholder} strokeWidth={1.5} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={s.sectionTitle}>Por vendedor</Text>
      {!isLoading && data && sellers.length === 0 ? (
        <EmptyState
          illustration="clients"
          title="Nenhum vendedor na sua equipe"
          subtitle="Peça ao administrador para associar os vendedores a você no cadastro de usuários do painel (campo Gerente)."
        />
      ) : (
        sellers.map((seller) => <SellerCard key={seller.userId} seller={seller} />)
      )}
      {isError && (
        <Text style={s.error}>Não foi possível carregar a equipe. Puxe para atualizar.</Text>
      )}
      <FreshnessFooter computedAt={data?.lastSyncAt} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.neutral.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  greeting: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.xl,
    color: colors.brand.dark,
  },
  date: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
    marginTop: 2,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
  },
  goalPctLarge: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.md,
    color: colors.brand.primary,
  },
  goalPct: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.sm,
    color: colors.brand.primary,
  },
  goalTrack: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.neutral.subtle,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  goalFill: { height: '100%', borderRadius: radius.full, backgroundColor: colors.brand.primary },
  goalDetail: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
    marginTop: spacing.sm,
  },
  goalHint: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.semantic.warning,
    marginTop: 2,
  },
  smallRow: { flexDirection: 'row', gap: spacing.md },
  smallCard: {
    flex: 1,
    backgroundColor: colors.neutral.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.md,
  },
  smallValue: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size['2xl'],
    color: colors.brand.dark,
  },
  smallOf: {
    fontFamily: typography.fontFamily.sansMedium,
    fontSize: typography.size.md,
    color: colors.neutral.textSub,
  },
  smallLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: typography.size.md,
    color: colors.brand.dark,
    marginTop: spacing.sm,
  },
  shortcuts: { gap: spacing.sm },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  shortcutText: {
    flex: 1,
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
  },
  sellerName: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: typography.size.md,
    color: colors.brand.dark,
  },
  sellerCode: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
  },
  error: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.semantic.danger,
    textAlign: 'center',
  },
})
