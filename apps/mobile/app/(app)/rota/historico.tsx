// Histórico de visitas (E24, plano 003) — o espelho que faltava: o vendedor
// registra cada visita no "Cheguei" e nunca mais vê nenhuma delas. Agrupado
// por dia civil (ymd do DTO, já em 'YYYY-MM-DD' de São Paulo), com os
// contadores do período no topo e um seletor de mês civil (Este mês / Mês
// passado) — unidade de apuração, não janela de N dias corridos: a meta é
// mensal, e janela móvel nunca fecha com o período pelo qual o vendedor é
// cobrado (ver nota de revisão em src/utils/visitHistory.ts).
import { useMemo, useState } from 'react'
import { View, Text, SectionList, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Check, RotateCcw, X } from 'lucide-react-native'
import type { VisitHistoryItemDto } from '@addere/types'
import { useVisitHistory } from '../../../src/hooks/useIntel'
import { saoPauloYmd } from '../../../src/utils/calendar'
import {
  historyPeriodLabel,
  historyPeriodRange,
  sectionsByDay,
  visitMetaLine,
  type HistoryPeriod,
  type VisitHistoryDaySection,
} from '../../../src/utils/visitHistory'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { LoadingState } from '../../../src/components/Skeleton'
import { colors, spacing, radius, typography } from '../../../src/theme'

const PERIODS: HistoryPeriod[] = ['current', 'previous']

const RESULT_META: Partial<
  Record<NonNullable<VisitHistoryItemDto['result']>, { label: string; color: string; Icon: typeof Check }>
> = {
  ORDER: { label: 'Pedido', color: colors.semantic.success, Icon: Check },
  NO_ORDER: { label: 'Sem pedido', color: colors.semantic.danger, Icon: X },
  RESCHEDULED: { label: 'Remarcada', color: colors.semantic.warning, Icon: RotateCcw },
  NOT_FOUND: { label: 'Não encontrado', color: colors.neutral.textSub, Icon: X },
}

function ResultBadge({ result }: { result: VisitHistoryItemDto['result'] }) {
  if (!result) return null
  const meta = RESULT_META[result]
  if (!meta) return null
  const { Icon, label, color } = meta
  return (
    <View style={[s.resultBadge, { backgroundColor: `${color}1A` }]}>
      <Icon size={12} color={color} strokeWidth={2} />
      <Text style={[s.resultText, { color }]}>{label}</Text>
    </View>
  )
}

function SummaryCard({
  total,
  withOrder,
  outOfPlan,
}: {
  total: number
  withOrder: number
  outOfPlan: number
}) {
  const conversionPct = total > 0 ? Math.round((withOrder / total) * 100) : null
  return (
    <View style={s.summaryCard} testID="historico-resumo">
      <Text style={s.summaryTitle}>
        {total} visita{total === 1 ? '' : 's'} · {withOrder} virou{withOrder === 1 ? '' : 'ram'} pedido
      </Text>
      <View style={s.summaryRow}>
        <Text style={s.summaryMetric}>
          Conversão {conversionPct === null ? '—' : `${conversionPct}%`}
        </Text>
        {outOfPlan > 0 && <Text style={s.summaryMetric}>{outOfPlan} fora do plano</Text>}
      </View>
    </View>
  )
}

export default function HistoricoScreen() {
  const router = useRouter()
  const [period, setPeriod] = useState<HistoryPeriod>('current')
  const today = useMemo(() => saoPauloYmd(), [])
  const { from, to } = useMemo(() => historyPeriodRange(period, today), [today, period])
  const { data, isLoading } = useVisitHistory(from, to)

  const sections = useMemo(() => sectionsByDay(data?.items ?? []), [data])

  const openOrder = (orderId: string) =>
    router.push({ pathname: '/pedidos/[id]', params: { id: orderId } }, { withAnchor: true })

  const renderItem = ({ item, index }: { item: VisitHistoryItemDto; index: number }) => {
    const card = (
      <View style={s.card} testID={`historico-item-${index + 1}`}>
        <View style={s.cardHeaderRow}>
          <Text
            style={[s.bullet, { color: item.planned ? colors.brand.primary : colors.neutral.disabled }]}
          >
            {item.planned ? '●' : '○'}
          </Text>
          <Text style={s.customerName} numberOfLines={1}>
            {item.customerName}
          </Text>
          {!item.planned && (
            <Text style={s.outOfPlanLabel} testID={`historico-fora-do-plano-${index + 1}`}>
              fora do plano
            </Text>
          )}
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaText}>{visitMetaLine(item)}</Text>
          <ResultBadge result={item.result} />
        </View>
        {item.result === 'NO_ORDER' && item.noOrderReason && (
          <Text style={s.reason}>&ldquo;{item.noOrderReason}&rdquo;</Text>
        )}
      </View>
    )
    if (!item.orderId) return card
    return (
      <TouchableOpacity onPress={() => openOrder(item.orderId as string)} activeOpacity={0.7}>
        {card}
      </TouchableOpacity>
    )
  }

  if (isLoading && !data) return <LoadingState style={s.container} />

  return (
    <View style={s.container} testID="screen-historico">
      <View style={s.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p}
            testID={`historico-periodo-${p}`}
            style={[s.periodPill, period === p && s.periodPillActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[s.periodText, period === p && s.periodTextActive]}>
              {historyPeriodLabel(p)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {data && (
        <SummaryCard total={data.total} withOrder={data.withOrder} outOfPlan={data.outOfPlan} />
      )}

      {!data || data.items.length === 0 ? (
        <EmptyState
          illustration="orders"
          title="Sem visitas neste período"
          subtitle={
            period === 'current'
              ? 'Nenhuma visita registrada neste mês. Toque em Cheguei na Rota para registrar a primeira.'
              : 'Nenhuma visita registrada no mês passado.'
          }
        />
      ) : (
        <SectionList<VisitHistoryItemDto, VisitHistoryDaySection>
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={s.dayHeaderRow} testID={`historico-dia-${section.ymd}`}>
              <Text style={s.dayHeader}>{section.title}</Text>
              <Text style={s.dayCount}>
                {section.data.length} visita{section.data.length === 1 ? '' : 's'}
              </Text>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: spacing.xl }}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg, padding: spacing.lg },
  periodRow: {
    flexDirection: 'row',
    backgroundColor: colors.neutral.subtle,
    borderRadius: radius.full,
    padding: 3,
    marginBottom: spacing.md,
  },
  periodPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  periodPillActive: { backgroundColor: colors.neutral.white },
  periodText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  periodTextActive: { color: colors.brand.primary },
  summaryCard: {
    backgroundColor: colors.brand.tint,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  summaryTitle: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.md,
    color: colors.brand.dark,
  },
  summaryRow: { flexDirection: 'row', gap: spacing.md },
  summaryMetric: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.brand.dark,
  },
  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  dayHeader: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: typography.size.sm,
    color: colors.brand.dark,
    letterSpacing: 0.3,
  },
  dayCount: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
  },
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.md,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  bullet: { fontSize: typography.size.md, lineHeight: typography.size.md },
  customerName: {
    flex: 1,
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.md,
    color: colors.neutral.text,
  },
  outOfPlanLabel: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.xs,
    color: colors.semantic.muted,
    backgroundColor: colors.neutral.subtle,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaText: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  resultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  resultText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.xs,
  },
  reason: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
    fontStyle: 'italic',
  },
})
