// Visita (esqueleto E12) — check-in, briefing e resultado chegam na E13.
import { View, Text, StyleSheet } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { colors, spacing, typography } from '../../../../src/theme'

export default function VisitaScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>()
  return (
    <View testID="screen-visita" style={s.container}>
      <Text style={s.hint}>Visita {itemId} — tela completa na próxima atualização.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.neutral.bg, padding: spacing.lg },
  hint: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.sm,
    color: colors.neutral.textSub,
  },
})
