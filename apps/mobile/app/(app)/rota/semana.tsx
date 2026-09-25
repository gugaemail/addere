// Semana (E18) — plano semanal montado pelo motor à noite: seções por dia
// (só dias >= hoje), mover parada de dia e tirar da semana. O plano de hoje
// já foi fechado de madrugada; o motor lê as mudanças na próxima madrugada.
import { useCallback, useMemo, useState } from 'react'
import { View, Text, SectionList, TouchableOpacity, Modal, StyleSheet, Alert } from 'react-native'
import { ArrowRightLeft, CalendarDays, X } from 'lucide-react-native'
import type { VisitPlanItemDto } from '@addere/types'
import { useClientes } from '../../../src/hooks/useClientes'
import { makePlanOp, useWeekPlan, useWeekPlanPatch } from '../../../src/hooks/useIntel'
import { pilotTracker } from '../../../src/services/pilotTracking'
import { dayLabel, saoPauloYmd } from '../../../src/utils/calendar'
import { stopMetaLine } from '../../../src/utils/intelText'
import { moveTargets, weekSections, type WeekDaySection } from '../../../src/utils/weekPlan'
import { StatusPill } from '../../../src/components/intel/StatusPill'
import { SyncPill } from '../../../src/components/intel/SyncPill'
import { FreshnessFooter } from '../../../src/components/intel/FreshnessFooter'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { LoadingState } from '../../../src/components/Skeleton'
import { colors, spacing, radius, typography } from '../../../src/theme'

export default function SemanaScreen() {
  const { data: plan, isLoading } = useWeekPlan()
  const weekPatch = useWeekPlanPatch()
  const { data: customers } = useClientes()
  const today = saoPauloYmd()
  const [moving, setMoving] = useState<VisitPlanItemDto | null>(null)

  // Cidade da parada pela lista de clientes em cache (o item do plano não a traz)
  const cityByKey = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of customers ?? []) {
      if (c.protheusCode && c.municipio) map.set(`${c.protheusCode}|${c.loja ?? '01'}`, c.municipio)
    }
    return map
  }, [customers])

  const sections = useMemo(
    () => weekSections(plan, today, (item) => cityByKey.get(`${item.customerCode}|${item.loja}`)),
    [plan, today, cityByKey]
  )
  const countByDay = useMemo(
    () => new Map(sections.map((section) => [section.ymd, section.data.length])),
    [sections]
  )
  // Índice sequencial na semana — testIDs btn-mover-N / btn-tirar-semana-N
  const indexById = useMemo(() => {
    const map = new Map<string, number>()
    let n = 0
    for (const section of sections) for (const item of section.data) map.set(item.id, ++n)
    return map
  }, [sections])
  const targets = useMemo(
    () => (plan && moving ? moveTargets(plan, today, moving.plannedDate) : []),
    [plan, moving, today]
  )

  const moveTo = useCallback(
    (date: string) => {
      if (!plan || !moving) return
      weekPatch.apply(plan.id, [makePlanOp({ type: 'moveToDay', itemId: moving.id, date })])
      pilotTracker.track({ type: 'PLAN_EDITED', metadata: { ops: 1 } })
      setMoving(null)
    },
    [plan, moving, weekPatch]
  )

  const removeFromWeek = useCallback(
    (item: VisitPlanItemDto) => {
      if (!plan) return
      Alert.alert('Tirar da semana', `Tirar ${item.customerName} do plano da semana?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Tirar',
          style: 'destructive',
          onPress: () => {
            weekPatch.apply(plan.id, [makePlanOp({ type: 'remove', itemId: item.id })])
            pilotTracker.track({ type: 'PLAN_EDITED', metadata: { ops: 1 } })
          },
        },
      ])
    },
    [plan, weekPatch]
  )

  const renderItem = useCallback(
    ({ item, index }: { item: VisitPlanItemDto; index: number }) => {
      const n = indexById.get(item.id) ?? index + 1
      const meta = stopMetaLine(item)
      return (
        <View style={s.card} testID={`semana-item-${n}`}>
          <View style={s.cardHeader}>
            <View style={s.position}>
              <Text style={s.positionText}>{index + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name} numberOfLines={1}>
                {item.customerName}
              </Text>
              {item.shortReason ? (
                <Text style={s.reason} numberOfLines={2}>
                  {item.shortReason}
                </Text>
              ) : null}
              {meta ? <Text style={s.meta}>{meta}</Text> : null}
            </View>
            <StatusPill status={item.statusAtTime} />
          </View>
          <View style={s.actions}>
            <TouchableOpacity
              testID={`btn-mover-${n}`}
              style={s.action}
              onPress={() => setMoving(item)}
            >
              <ArrowRightLeft size={14} color={colors.brand.primary} strokeWidth={1.5} />
              <Text style={s.actionText}>Mover</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`btn-tirar-semana-${n}`}
              style={s.action}
              onPress={() => removeFromWeek(item)}
            >
              <X size={14} color={colors.brand.primary} strokeWidth={1.5} />
              <Text style={s.actionText}>Tirar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )
    },
    [indexById, removeFromWeek]
  )

  if (isLoading && !plan) return <LoadingState style={s.container} />

  if (!plan || sections.length === 0) {
    return (
      <View style={s.container} testID="screen-semana">
        <EmptyState
          illustration="orders"
          title="Sem plano para a semana"
          subtitle="O motor monta o plano da semana de madrugada. Volte amanhã."
        />
      </View>
    )
  }

  return (
    <View style={s.container} testID="screen-semana">
      <SectionList<VisitPlanItemDto, WeekDaySection>
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <Text style={s.dayHeader} testID={`semana-dia-${section.ymd}`}>
            {section.title}
          </Text>
        )}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListHeaderComponent={
          <View style={s.headerRow}>
            <View style={s.notice}>
              <CalendarDays size={14} color={colors.brand.primary} strokeWidth={1.5} />
              <Text style={s.noticeText}>
                O plano de hoje já está fechado; mudanças valem para os próximos dias.
              </Text>
            </View>
            <SyncPill />
          </View>
        }
        ListFooterComponent={<FreshnessFooter computedAt={plan.freshness.lastSyncAt ?? null} />}
      />

      <Modal
        visible={!!moving}
        transparent
        animationType="slide"
        onRequestClose={() => setMoving(null)}
      >
        <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={() => setMoving(null)}>
          <View style={s.sheet} onStartShouldSetResponder={() => true}>
            <View style={s.handle} />
            <Text style={s.sheetTitle} numberOfLines={2}>
              Mover {moving?.customerName ?? ''} para
            </Text>
            {targets.length === 0 ? (
              <Text style={s.sheetEmpty}>Não há outro dia disponível nesta semana.</Text>
            ) : (
              targets.map((ymd) => {
                const count = countByDay.get(ymd) ?? 0
                return (
                  <TouchableOpacity
                    key={ymd}
                    testID={`mover-dia-${ymd}`}
                    style={s.dayOption}
                    onPress={() => moveTo(ymd)}
                  >
                    <Text style={s.dayOptionText}>{dayLabel(ymd)}</Text>
                    <Text style={s.dayOptionSub}>
                      {count === 0 ? 'sem paradas' : `${count} parada${count === 1 ? '' : 's'}`}
                    </Text>
                  </TouchableOpacity>
                )
              })
            )}
            <TouchableOpacity style={s.cancel} onPress={() => setMoving(null)}>
              <Text style={s.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg, padding: spacing.lg },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  notice: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.brand.tint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  noticeText: {
    flex: 1,
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.brand.dark,
    lineHeight: 16,
  },
  dayHeader: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: typography.size.md,
    color: colors.brand.dark,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  position: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.brand.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: {
    fontFamily: typography.fontFamily.bodyBold,
    fontSize: typography.size.sm,
    color: colors.neutral.white,
  },
  name: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.md,
    color: colors.neutral.text,
  },
  reason: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
    marginTop: 2,
  },
  meta: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.placeholder,
    marginTop: 2,
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.neutral.subtle,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.xs,
    color: colors.brand.primary,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay.scrim,
  },
  sheet: {
    backgroundColor: colors.neutral.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.neutral.border,
    borderRadius: radius.full,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.lg,
    color: colors.brand.dark,
    marginBottom: spacing.xs,
  },
  sheetEmpty: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  dayOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  dayOptionText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.md,
    color: colors.neutral.text,
  },
  dayOptionSub: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
  cancel: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  cancelText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
})
