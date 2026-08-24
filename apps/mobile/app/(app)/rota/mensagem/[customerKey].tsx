// Mensagem (esqueleto E12) — moldes e envio via WhatsApp chegam na E13.
import { View, Text, StyleSheet } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { colors, spacing, typography } from '../../../../src/theme'

export default function MensagemScreen() {
  const { customerKey } = useLocalSearchParams<{ customerKey: string }>()
  return (
    <View testID="screen-mensagem" style={s.container}>
      <Text style={s.hint}>Mensagem para {customerKey} — tela completa na próxima atualização.</Text>
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
