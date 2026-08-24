// Plano do dia (esqueleto E12 — a E13 constrói a lista completa e a E13b o mapa).
import { View, Text, StyleSheet } from 'react-native'
import { usePlan, prefetchBriefings } from '../../../src/hooks/useIntel'
import { useEffect } from 'react'
import { SyncPill } from '../../../src/components/intel/SyncPill'
import { FreshnessFooter } from '../../../src/components/intel/FreshnessFooter'
import { EmptyState } from '../../../src/components/ui/EmptyState'
import { colors, spacing, typography } from '../../../src/theme'

export default function RotaScreen() {
  const { data: plan, isLoading } = usePlan()

  // Pré-busca os briefings das primeiras paradas p/ "antes de entrar" offline
  useEffect(() => {
    prefetchBriefings(plan)
  }, [plan])

  return (
    <View testID="screen-rota" style={s.container}>
      <View style={s.headerRow}>
        <Text style={s.title}>
          {plan ? `${plan.items.filter((i) => !i.removedAt).length} visita(s) sugeridas` : 'Plano do dia'}
        </Text>
        <SyncPill />
      </View>
      {!isLoading && !plan && (
        <EmptyState
          illustration="orders"
          title="Sem plano para hoje"
          subtitle="O plano do dia é calculado de madrugada pelo motor da Inteligência."
        />
      )}
      <FreshnessFooter computedAt={plan?.freshness.lastSyncAt ?? null} />
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg, padding: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.lg,
    color: colors.brand.dark,
  },
})
