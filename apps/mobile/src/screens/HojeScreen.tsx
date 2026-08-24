// Tela Hoje (fundação E12 — a E13 completa com o plano do dia inteiro).
// Mostra a saudação, o resumo do home (quando a API responde) e o atalho
// para a Rota; todo número calculado carrega o rodapé de frescor.
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Map as MapIcon, ChevronRight } from 'lucide-react-native'
import { useAuthStore } from '../store/auth.store'
import { useHome } from '../hooks/useIntel'
import { Card } from '../components/ui/Card'
import { SyncPill } from '../components/intel/SyncPill'
import { FreshnessFooter } from '../components/intel/FreshnessFooter'
import { colors, spacing, radius, typography } from '../theme'

export function HojeScreen() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const { data: home } = useHome()

  const firstName = user?.name?.split(' ')[0] ?? ''

  return (
    <ScrollView testID="screen-hoje" style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.headerRow}>
        <Text style={s.greeting}>Olá, {firstName}</Text>
        <SyncPill />
      </View>

      {home?.llmSummary ? (
        <Card>
          <Text style={s.homeLine}>{home.llmSummary}</Text>
        </Card>
      ) : null}

      <TouchableOpacity
        testID="card-plano-do-dia"
        style={s.planCard}
        activeOpacity={0.85}
        onPress={() => router.push('/rota')}
      >
        <View style={s.planIcon}>
          <MapIcon size={20} color={colors.brand.primary} strokeWidth={1.5} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.planTitle}>Plano do dia</Text>
          <Text style={s.planSub}>
            {home?.plan
              ? `${home.plan.itemsCount} visita(s) sugeridas — toque para abrir a rota`
              : 'Seu plano aparece aqui quando o motor calcular a rota'}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.neutral.placeholder} strokeWidth={1.5} />
      </TouchableOpacity>

      <FreshnessFooter computedAt={home?.freshness.lastSyncAt ?? null} />
    </ScrollView>
  )
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.neutral.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: {
    fontFamily: typography.fontFamily.sansBold,
    fontSize: typography.size.xl,
    color: colors.brand.dark,
  },
  homeLine: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.md,
    color: colors.neutral.text,
    lineHeight: 22,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.neutral.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.neutral.border,
    padding: spacing.lg,
  },
  planIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.brand.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTitle: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.md,
    color: colors.neutral.text,
  },
  planSub: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
    marginTop: 2,
  },
})
