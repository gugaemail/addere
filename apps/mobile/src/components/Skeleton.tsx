import { useEffect, useRef } from 'react'
import { Animated, View, ActivityIndicator, StyleSheet, ViewStyle } from 'react-native'
import { useTheme, colors, spacing, radius } from '../theme'

// ─── SkeletonBox ─────────────────────────────────────────────────────────────

interface SkeletonBoxProps {
  width: number | `${number}%`
  height: number
  style?: ViewStyle
}

export function SkeletonBox({ width, height, style }: SkeletonBoxProps) {
  const opacity = useRef(new Animated.Value(1)).current
  const theme = useTheme()

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius: radius.sm,
          backgroundColor: theme.subtle,
          opacity,
        },
        style,
      ]}
    />
  )
}

// ─── Stat skeletons ───────────────────────────────────────────────────────────

export function StatCardSkeleton() {
  const theme = useTheme()
  return (
    <View style={[sk.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <SkeletonBox width={44} height={22} />
      <SkeletonBox width={80} height={11} style={{ marginTop: spacing.sm }} />
    </View>
  )
}

export function StatGridSkeleton() {
  return (
    <View style={sk.statsGrid}>
      {[0, 1, 2, 3].map((i) => (
        <StatCardSkeleton key={i} />
      ))}
    </View>
  )
}

// ─── List row skeletons ───────────────────────────────────────────────────────

export function OrderRowSkeleton() {
  const theme = useTheme()
  return (
    <View style={[sk.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={{ flex: 1, gap: spacing.sm }}>
        <SkeletonBox width="70%" height={14} />
        <SkeletonBox width="40%" height={11} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: spacing.sm }}>
        <SkeletonBox width={70} height={14} />
        <SkeletonBox width={55} height={18} style={{ borderRadius: radius.full }} />
      </View>
    </View>
  )
}

export function ClienteItemSkeleton() {
  const theme = useTheme()
  return (
    <View style={[sk.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={{ flex: 1, gap: spacing.sm }}>
        <SkeletonBox width="65%" height={14} />
        <SkeletonBox width="45%" height={11} />
      </View>
      <SkeletonBox width={18} height={22} style={{ borderRadius: radius.xs }} />
    </View>
  )
}

// ─── Loading (spinner de tela) ────────────────────────────────────────────────

// Estado de carregamento centralizado e consistente para telas de detalhe/listas
// que ainda não têm skeleton próprio.
export function LoadingState({ style }: { style?: ViewStyle }) {
  return (
    <View style={[sk.loading, style]}>
      <ActivityIndicator color={colors.brand.primary} />
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// Dimensões alinhadas ao Card de ui/ (radius.lg + padding md)
const sk = StyleSheet.create({
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    borderRadius: radius.lg,
    padding: spacing.md,
    flex: 1,
    minWidth: '45%',
    borderWidth: 1,
    borderTopWidth: 3,
    borderTopColor: 'transparent',
  },
  row: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['2xl'],
  },
})
