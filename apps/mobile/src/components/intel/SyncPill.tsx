// Pill de estado da fila offline (E12) — some quando não há nada pendente.
import { View, Text, StyleSheet } from 'react-native'
import { CloudOff, RefreshCw } from 'lucide-react-native'
import { useSyncStore } from '../../store/syncStore'
import { colors, spacing, radius, typography } from '../../theme'

export function SyncPill() {
  const pending = useSyncStore(
    (s) => s.queue.filter((i) => i.status === 'pending' || i.status === 'error').length
  )
  const online = useSyncStore((s) => s.networkAvailable)

  if (online && pending === 0) return null

  const label = !online ? 'Offline' : `${pending} a enviar`
  const Icon = online ? RefreshCw : CloudOff
  const color = online ? colors.brand.primary : colors.semantic.warning

  return (
    <View testID="sync-pill" style={[s.pill, { backgroundColor: color + '1F' }]}>
      <Icon size={12} color={color} strokeWidth={1.5} />
      <Text style={[s.label, { color }]}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  label: {
    fontFamily: typography.fontFamily.bodySemibold,
    fontSize: typography.size.xs,
  },
})
