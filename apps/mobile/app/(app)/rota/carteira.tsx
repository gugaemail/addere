// Carteira (E19) — todos os clientes do vendedor com o status do motor, o
// segmento RFM (quando a carteira comporta quintis) e quanto dá para
// recuperar entre atrasados e em risco. Filtros por chips, tudo local.
import { useCallback, useMemo, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { MessageCircle, Minus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react-native'
import type { CustomerSignalListItem, CustomerStatus, RfmSegment } from '@addere/types'
import { useClientes } from '../../../src/hooks/useClientes'
import { usePortfolio } from '../../../src/hooks/useIntel'
import {
  RFM_SEGMENTS,
  rfmColor,
  rfmLabel,
  STATUS_LABELS,
  statusColor,
} from '../../../src/utils/customerStatus'
import {
  crossSellLine,
  customerMetaLine,
  filterPortfolio,
  LATE_FILTER,
  lateRecoveryLine,
  trendModel,
} from '../../../src/utils/portfolio'
import { StatusPill } from '../../../src/components/intel/StatusPill'
import { SyncPill } from '../../../src/components/intel/SyncPill'
import { FreshnessFooter } from '../../../src/components/intel/FreshnessFooter'
import { Badge } from '../../../src/components/ui/Badge'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { LoadingState } from '../../../src/components/Skeleton'
import { colors, spacing, radius, typography } from '../../../src/theme'

const STATUS_ORDER: CustomerStatus[] = ['ON_CYCLE', 'LATE', 'AT_RISK', 'INACTIVE', 'NEW', 'BLOCKED']

function Chip({
  label,
  count,
  active,
  color,
  onPress,
  testID,
}: {
  label: string
  count: number
  active: boolean
  color: string
  onPress: () => void
  testID: string
}) {
  return (
    <TouchableOpacity
      testID={testID}
      onPress={onPress}
      style={[s.chip, active && { backgroundColor: color + '1F', borderColor: color }]}
      accessibilityState={{ selected: active }}
    >
      <View style={[s.chipDot, { backgroundColor: color }]} />
      <Text style={[s.chipText, active && { color }]}>{label}</Text>
      <Text style={[s.chipCount, active && { color }]}>{count}</Text>
    </TouchableOpacity>
  )
}

export default function CarteiraScreen() {
  const router = useRouter()
  const { data: portfolio, isLoading } = usePortfolio()
  const { data: customers } = useClientes()
  const [statuses, setStatuses] = useState<CustomerStatus[]>([])
  const [rfm, setRfm] = useState<RfmSegment[]>([])

  const toggleStatus = useCallback((status: CustomerStatus) => {
    setStatuses((prev) =>
      prev.includes(status) ? prev.filter((x) => x !== status) : [...prev, status]
    )
  }, [])
  const toggleRfm = useCallback((segment: RfmSegment) => {
    setRfm((prev) => (prev.includes(segment) ? prev.filter((x) => x !== segment) : [...prev, segment]))
  }, [])
  const lateActive =
    statuses.length === LATE_FILTER.length && LATE_FILTER.every((x) => statuses.includes(x))
  const toggleLate = useCallback(() => {
    setStatuses((prev) =>
      prev.length === LATE_FILTER.length && LATE_FILTER.every((x) => prev.includes(x))
        ? []
        : [...LATE_FILTER]
    )
  }, [])
  const clearFilters = useCallback(() => {
    setStatuses([])
    setRfm([])
  }, [])

  const items = useMemo(
    () => filterPortfolio(portfolio?.items ?? [], { statuses, rfm }),
    [portfolio, statuses, rfm]
  )

  // Ficha precisa do id do banco — resolve pelo código/loja na lista em cache
  const customerIdByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers ?? []) {
      if (c.protheusCode) map.set(`${c.protheusCode}|${c.loja ?? '01'}`, c.id)
    }
    return map
  }, [customers])

  const openFicha = useCallback(
    (item: CustomerSignalListItem) => {
      const id = customerIdByKey.get(`${item.customerCode}|${item.loja}`)
      if (id) router.push({ pathname: '/clientes/[id]', params: { id } }, { withAnchor: true })
      else router.push('/clientes')
    },
    [customerIdByKey, router]
  )

  const openMessage = useCallback(
    (item: CustomerSignalListItem) =>
      router.push({
        pathname: '/rota/mensagem/[customerKey]',
        params: { customerKey: `${item.customerCode}_${item.loja}` },
      }),
    [router]
  )

  const renderItem = useCallback(
    ({ item, index }: { item: CustomerSignalListItem; index: number }) => {
      const meta = customerMetaLine(item)
      const trend = trendModel(item.trendPct)
      const cross = crossSellLine(item.crossSellCount)
      const TrendIcon = trend?.direction === 'up' ? TrendingUp : trend?.direction === 'down' ? TrendingDown : Minus
      const trendColor =
        trend?.direction === 'up'
          ? colors.semantic.success
          : trend?.direction === 'down'
            ? colors.semantic.danger
            : colors.neutral.textSub
      return (
        <TouchableOpacity
          testID={`carteira-item-${index + 1}`}
          style={s.card}
          activeOpacity={0.85}
          onPress={() => openFicha(item)}
        >
          <View style={s.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>
                {item.customerName}
              </Text>
              {item.city ? <Text style={s.city}>{item.city}</Text> : null}
            </View>
            <StatusPill status={item.status} />
          </View>
          {item.rfmSegment ? (
            <Badge color={rfmColor(item.rfmSegment)}>{rfmLabel(item.rfmSegment)}</Badge>
          ) : null}
          {meta ? <Text style={s.meta}>{meta}</Text> : null}
          <View style={s.footerRow}>
            {trend && (
              <View style={s.trend}>
                <TrendIcon size={13} color={trendColor} strokeWidth={1.5} />
                <Text style={[s.trendText, { color: trendColor }]}>{trend.text}</Text>
              </View>
            )}
            {cross ? <Text style={s.cross}>{cross}</Text> : null}
            <TouchableOpacity
              testID={`btn-mensagem-carteira-${index + 1}`}
              style={s.messageButton}
              onPress={() => openMessage(item)}
              hitSlop={4}
            >
              <MessageCircle size={14} color={colors.brand.primary} strokeWidth={1.5} />
              <Text style={s.messageText}>Mensagem</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      )
    },
    [openFicha, openMessage]
  )

  if (isLoading && !portfolio) return <LoadingState style={s.container} />

  if (!portfolio) {
    return (
      <View style={s.container} testID="screen-carteira">
        <EmptyState
          illustration="clients"
          title="Carteira indisponível"
          subtitle="Os sinais da carteira são calculados de madrugada pelo motor da Inteligência."
        />
      </View>
    )
  }

  const recovery = lateRecoveryLine(portfolio.lateAmount)
  const hasFilter = statuses.length > 0 || rfm.length > 0

  return (
    <View style={s.container} testID="screen-carteira">
      <FlatList
        data={items}
        keyExtractor={(item) => `${item.customerCode}|${item.loja}`}
        renderItem={renderItem}
        contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.xl }}
        ListHeaderComponent={
          <View style={s.header}>
            <View style={s.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.total}>{portfolio.total}</Text>
                <Text style={s.totalLabel}>clientes na carteira</Text>
              </View>
              <SyncPill />
            </View>

            <View style={s.chipRow}>
              {STATUS_ORDER.map((status) => (
                <Chip
                  key={status}
                  testID={`chip-status-${status}`}
                  label={STATUS_LABELS[status]}
                  count={portfolio.byStatus[status] ?? 0}
                  color={statusColor(status)}
                  active={statuses.includes(status)}
                  onPress={() => toggleStatus(status)}
                />
              ))}
            </View>

            <TouchableOpacity
              testID="btn-so-atrasados"
              style={[s.lateCta, lateActive && s.lateCtaActive]}
              onPress={toggleLate}
              activeOpacity={0.85}
            >
              <Text style={[s.lateCtaText, lateActive && s.lateCtaTextActive]}>Só atrasados</Text>
              {recovery ? (
                <Text style={[s.lateCtaHint, lateActive && s.lateCtaTextActive]}>{recovery}</Text>
              ) : null}
            </TouchableOpacity>

            {portfolio.rfmAvailable && (
              <View style={s.chipRow}>
                {RFM_SEGMENTS.map((segment) => (
                  <Chip
                    key={segment}
                    testID={`chip-rfm-${segment}`}
                    label={rfmLabel(segment)}
                    count={portfolio.byRfm[segment] ?? 0}
                    color={rfmColor(segment)}
                    active={rfm.includes(segment)}
                    onPress={() => toggleRfm(segment)}
                  />
                ))}
              </View>
            )}

            {portfolio.text ? (
              <View style={s.agentCard} testID="carteira-texto-agente">
                <Sparkles size={14} color={colors.brand.primary} strokeWidth={1.5} />
                <Text style={s.agentText}>{portfolio.text}</Text>
              </View>
            ) : null}

            <Text style={s.countLine}>
              {items.length} cliente{items.length === 1 ? '' : 's'}
              {hasFilter ? ' no recorte' : ''}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            illustration="clients"
            title="Ninguém nesse recorte"
            subtitle="Nenhum cliente da carteira combina com os filtros escolhidos."
            actionLabel={hasFilter ? 'Limpar filtros' : undefined}
            onAction={clearFilters}
          />
        }
        ListFooterComponent={<FreshnessFooter computedAt={portfolio.freshness.lastSyncAt ?? null} />}
      />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg, padding: spacing.lg },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  total: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size['2xl'],
    color: colors.brand.dark,
  },
  totalLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.neutral.white,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chipDot: { width: 8, height: 8, borderRadius: radius.full },
  chipText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.xs,
    color: colors.neutral.text,
  },
  chipCount: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
  },
  lateCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.neutral.white,
    borderWidth: 1,
    borderColor: colors.status.late,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  lateCtaActive: { backgroundColor: colors.status.late, borderColor: colors.status.late },
  lateCtaText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.status.late,
  },
  lateCtaHint: {
    flexShrink: 1,
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.status.late,
    textAlign: 'right',
  },
  lateCtaTextActive: { color: colors.neutral.white },
  agentCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.brand.tint,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  agentText: {
    flex: 1,
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
    lineHeight: 19,
  },
  countLine: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.md,
    color: colors.neutral.text,
  },
  city: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
    marginTop: 2,
  },
  meta: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
  },
  footerRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  trendText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.xs,
  },
  cross: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.semantic.success,
  },
  messageButton: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.neutral.subtle,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  messageText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.xs,
    color: colors.brand.primary,
  },
})
