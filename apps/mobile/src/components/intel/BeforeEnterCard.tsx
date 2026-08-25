// "Antes de entrar" (E13) — sempre renderiza do snapshot determinístico
// (funciona offline); o texto do agente entra por cima quando em cache.
import { View, Text, StyleSheet } from 'react-native'
import { Sparkles } from 'lucide-react-native'
import type { SignalsSnapshot } from '@addere/types'
import { beforeEnterLines, confidenceLabel } from '../../utils/intelText'
import { colors, spacing, radius, typography } from '../../theme'

interface BeforeEnterCardProps {
  signals: SignalsSnapshot
  /** Texto do agente (briefing), quando disponível em cache */
  agentText?: string | null
  testID?: string
}

export function BeforeEnterCard({ signals, agentText, testID }: BeforeEnterCardProps) {
  return (
    <View style={s.card} testID={testID}>
      <View style={s.header}>
        <Sparkles size={14} color={colors.brand.primary} strokeWidth={1.5} />
        <Text style={s.title}>Antes de entrar</Text>
      </View>
      {agentText ? (
        <Text style={s.line}>{agentText}</Text>
      ) : (
        beforeEnterLines(signals).map((line) => (
          <Text key={line} style={s.line}>
            • {line}
          </Text>
        ))
      )}
      <Text style={s.confidence}>{confidenceLabel(signals.confidence)}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.brand.tint,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.sm,
    color: colors.brand.primary,
  },
  line: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
    lineHeight: 19,
  },
  confidence: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
    marginTop: 2,
  },
})
