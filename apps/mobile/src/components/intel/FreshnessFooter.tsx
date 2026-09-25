// Rodapé de frescor (E12) — obrigatório em toda tela com número calculado
// pelo motor. Fica vermelho quando os dados têm mais de 24 h.
import { Text, StyleSheet } from 'react-native'
import { colors, spacing, typography } from '../../theme'

export const STALE_AFTER_HOURS = 24

export function freshnessInfo(
  computedAt: string | null | undefined,
  now: Date = new Date()
): { label: string; stale: boolean } | null {
  if (!computedAt) return null
  const at = new Date(computedAt)
  if (Number.isNaN(at.getTime())) return null
  const hours = (now.getTime() - at.getTime()) / 3_600_000
  const stale = hours > STALE_AFTER_HOURS
  const when = at.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return { label: `Dados calculados em ${when}`, stale }
}

export function FreshnessFooter({ computedAt }: { computedAt: string | null | undefined }) {
  const info = freshnessInfo(computedAt)
  if (!info) return null
  return (
    <Text
      testID="freshness-footer"
      style={[s.text, info.stale && { color: colors.semantic.danger }]}
    >
      {info.label}
      {info.stale ? ' — desatualizados' : ''}
    </Text>
  )
}

const s = StyleSheet.create({
  text: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.neutral.textSub,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
})
