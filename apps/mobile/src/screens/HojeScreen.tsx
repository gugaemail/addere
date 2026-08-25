// Tela Hoje (E13) — home do vendedor com a Inteligência ligada: card do
// plano com a frase do agente (ou fallback do motor), meta do mês, carteira
// e atalhos. Todo número calculado carrega o rodapé de frescor.
import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  ChevronRight,
  Map as MapIcon,
  Navigation,
  Snowflake,
  ThumbsDown,
  ThumbsUp,
  Users,
} from 'lucide-react-native'
import { useAuthStore } from '../store/auth.store'
import { useFeedback, useHome, usePlan } from '../hooks/useIntel'
import { openRouteInMaps } from '../services/navigationLinks'
import { activeAddresses, planFallbackLine } from '../utils/intelText'
import { Card } from '../components/ui/Card'
import { SyncPill } from '../components/intel/SyncPill'
import { FreshnessFooter } from '../components/intel/FreshnessFooter'
import { colors, spacing, radius, typography } from '../theme'

const PLAN_FEEDBACK_KEY = 'addere.intel.planFeedbackAt'

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

export function HojeScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const { data: home } = useHome()
  const { data: plan } = usePlan()
  const feedback = useFeedback()

  // 👍/👎 do plano — no máximo 1× por dia (guarda em AsyncStorage)
  const [feedbackGiven, setFeedbackGiven] = useState(true)
  useEffect(() => {
    AsyncStorage.getItem(PLAN_FEEDBACK_KEY).then((at) => {
      setFeedbackGiven(at ? at.slice(0, 10) === new Date().toISOString().slice(0, 10) : false)
    })
  }, [])
  const sendPlanFeedback = useCallback(
    (rating: 1 | -1) => {
      if (!home?.plan) return
      feedback.send({ targetType: 'PLAN', targetId: home.plan.id, rating })
      AsyncStorage.setItem(PLAN_FEEDBACK_KEY, new Date().toISOString()).catch(() => undefined)
      setFeedbackGiven(true)
    },
    [feedback, home?.plan]
  )

  const firstName = user?.name?.split(' ')[0] ?? ''
  const byStatus = home?.portfolio.byStatus ?? {}
  const lateCount = (byStatus.LATE ?? 0) + (byStatus.AT_RISK ?? 0)
  const blockedCount = byStatus.BLOCKED ?? 0
  const goal = plan?.goal ?? null

  const goalPct = (() => {
    const sold = Number(goal?.soldAmount)
    const target = Number(goal?.goalAmount)
    if (!Number.isFinite(sold) || !Number.isFinite(target) || target <= 0) return null
    return Math.min(100, Math.round((sold / target) * 100))
  })()

  return (
    <ScrollView testID="screen-hoje" style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.greeting}>Olá, {firstName}</Text>
          <Text style={s.date}>
            {todayLabel()}
            {home?.plan?.grouping ? ` · ${home.plan.grouping}` : ''}
          </Text>
        </View>
        <SyncPill />
      </View>

      {/* Card do plano do dia */}
      <TouchableOpacity
        testID="card-plano-do-dia"
        style={s.planCard}
        activeOpacity={0.85}
        onPress={() => router.push('/rota')}
      >
        <View style={s.planHeader}>
          <View style={s.planIcon}>
            <MapIcon size={18} color={colors.brand.primary} strokeWidth={1.5} />
          </View>
          <Text style={s.planTitle}>Plano do dia</Text>
          <ChevronRight size={18} color={colors.neutral.placeholder} strokeWidth={1.5} />
        </View>
        <Text style={s.planLine}>
          {home?.plan
            ? (home.llmSummary ??
              planFallbackLine({
                itemsCount: home.plan.itemsCount,
                lateCount,
                expectedAmount: plan?.expectedAmount ?? null,
              }))
            : 'Seu plano aparece aqui quando o motor calcular a rota (madrugada).'}
        </Text>
        {home?.plan && (
          <View style={s.planActions}>
            <TouchableOpacity
              testID="btn-ver-plano"
              style={s.planButton}
              onPress={() => router.push('/rota')}
            >
              <Text style={s.planButtonText}>Ver plano</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="btn-abrir-rota"
              style={[s.planButton, s.planButtonGhost]}
              onPress={() => openRouteInMaps(activeAddresses(plan))}
            >
              <Navigation size={13} color={colors.brand.primary} strokeWidth={1.5} />
              <Text style={[s.planButtonText, { color: colors.brand.primary }]}>Abrir rota</Text>
            </TouchableOpacity>
            {!feedbackGiven && (
              <View style={s.thumbs}>
                <TouchableOpacity testID="plan-thumbs-up" onPress={() => sendPlanFeedback(1)} hitSlop={8}>
                  <ThumbsUp size={16} color={colors.neutral.textSub} strokeWidth={1.5} />
                </TouchableOpacity>
                <TouchableOpacity testID="plan-thumbs-down" onPress={() => sendPlanFeedback(-1)} hitSlop={8}>
                  <ThumbsDown size={16} color={colors.neutral.textSub} strokeWidth={1.5} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>

      {/* Meta do mês */}
      {goal && (goal.goalAmount || goal.gap) && (
        <Card>
          <View style={s.goalHeader}>
            <Text style={s.cardTitle}>Meta do mês</Text>
            {goalPct !== null && <Text style={s.goalPct}>{goalPct}%</Text>}
          </View>
          {goalPct !== null && (
            <View style={s.goalTrack}>
              <View style={[s.goalFill, { width: `${goalPct}%` }]} />
            </View>
          )}
          <Text style={s.goalDetail}>
            {goal.gap ? `Faltam ${fmtBRL(goal.gap)}` : `Vendido ${fmtBRL(goal.soldAmount)}`}
            {goal.perBusinessDay ? ` · ${fmtBRL(goal.perBusinessDay)} por dia útil` : ''}
          </Text>
          {goal.lateCoverage && Number(goal.lateCoverage) > 0 && (
            <Text style={s.goalHint}>
              Os clientes atrasados da sua carteira cobrem {fmtBRL(goal.lateCoverage)} disso.
            </Text>
          )}
        </Card>
      )}

      {/* Cards pequenos: carteira e bloqueados */}
      <View style={s.smallRow}>
        <View style={s.smallCard}>
          <Text style={s.smallValue}>{home?.portfolio.total ?? '—'}</Text>
          <Text style={s.smallLabel}>clientes na carteira</Text>
        </View>
        <View style={s.smallCard}>
          <Text style={[s.smallValue, lateCount > 0 && { color: colors.status.late }]}>
            {lateCount}
          </Text>
          <Text style={s.smallLabel}>esfriando{blockedCount > 0 ? ` · ${blockedCount} bloq.` : ''}</Text>
        </View>
      </View>

      {/* Atalhos */}
      <TouchableOpacity
        testID="atalho-esfriando"
        style={s.shortcut}
        activeOpacity={0.85}
        onPress={() => router.push({ pathname: '/clientes', params: { intelStatus: 'LATE,AT_RISK' } })}
      >
        <Snowflake size={16} color={colors.status.atRisk} strokeWidth={1.5} />
        <Text style={s.shortcutText}>Quem está esfriando?</Text>
        <ChevronRight size={16} color={colors.neutral.placeholder} strokeWidth={1.5} />
      </TouchableOpacity>
      <View style={[s.shortcut, s.shortcutDisabled]}>
        <Users size={16} color={colors.neutral.placeholder} strokeWidth={1.5} />
        <Text style={[s.shortcutText, { color: colors.neutral.placeholder }]}>
          Semana e Carteira — em breve
        </Text>
      </View>

      <FreshnessFooter computedAt={home?.freshness.lastSyncAt ?? null} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.neutral.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start' },
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
  planCard: {
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  planIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: colors.brand.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: {
    flex: 1,
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.md,
    color: colors.neutral.text,
  },
  planLine: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
    lineHeight: 20,
  },
  planActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  planButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.brand.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  planButtonGhost: { backgroundColor: colors.brand.tint },
  planButtonText: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.white,
  },
  thumbs: { flexDirection: 'row', gap: spacing.md, marginLeft: 'auto' },
  cardTitle: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
  },
  goalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalPct: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.md,
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
    color: colors.semantic.success,
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
  smallLabel: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
  },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.neutral.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  shortcutDisabled: { opacity: 0.7 },
  shortcutText: {
    flex: 1,
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
  },
})
