import { useEffect, useRef } from 'react'
import { Animated, View, Text, Pressable, StyleSheet, ViewStyle } from 'react-native'
import { useTheme } from '../theme'

// ─── SkeletonBox ─────────────────────────────────────────────────────────────

interface SkeletonBoxProps {
  width: number | `${number}%`
  height: number
  style?: ViewStyle
}

export function SkeletonBox({ width, height, style }: SkeletonBoxProps) {
  const opacity = useRef(new Animated.Value(1)).current
  const theme   = useTheme()

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1,   duration: 750, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [opacity])

  return (
    <Animated.View
      style={[
        { width: width as number, height, borderRadius: 6, backgroundColor: theme.subtle, opacity },
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
      <SkeletonBox width={80} height={11} style={{ marginTop: 6 }} />
    </View>
  )
}

export function StatGridSkeleton() {
  return (
    <View style={sk.statsGrid}>
      {[0, 1, 2, 3].map((i) => <StatCardSkeleton key={i} />)}
    </View>
  )
}

// ─── List row skeletons ───────────────────────────────────────────────────────

export function OrderRowSkeleton() {
  const theme = useTheme()
  return (
    <View style={[sk.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBox width="70%" height={14} />
        <SkeletonBox width="40%" height={11} />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <SkeletonBox width={70} height={14} />
        <SkeletonBox width={55} height={18} style={{ borderRadius: 10 }} />
      </View>
    </View>
  )
}

export function ClienteItemSkeleton() {
  const theme = useTheme()
  return (
    <View style={[sk.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={{ flex: 1, gap: 6 }}>
        <SkeletonBox width="65%" height={14} />
        <SkeletonBox width="45%" height={11} />
      </View>
      <SkeletonBox width={18} height={22} style={{ borderRadius: 4 }} />
    </View>
  )
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: React.ReactNode
  title: string
  description?: string
  action?: { label: string; onPress: () => void }
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const theme = useTheme()
  return (
    <View style={sk.emptyContainer}>
      <View style={[sk.emptyIconWrap, { backgroundColor: theme.subtle }]}>
        {icon}
      </View>
      <Text style={[sk.emptyTitle, { color: theme.text }]}>{title}</Text>
      {description && (
        <Text style={[sk.emptyDesc, { color: theme.textMuted }]}>{description}</Text>
      )}
      {action && (
        <Pressable
          onPress={action.onPress}
          style={[sk.emptyBtn, { borderColor: theme.brand }]}
        >
          <Text style={[sk.emptyBtnText, { color: theme.brand }]}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const sk = StyleSheet.create({
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  statCard: {
    borderRadius: 10,
    padding: 14,
    flex: 1,
    minWidth: '45%',
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  row: {
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  emptyContainer:  { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24, gap: 10 },
  emptyIconWrap:   { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle:      { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptyDesc:       { fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 19 },
  emptyBtn:        { marginTop: 4, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5 },
  emptyBtnText:    { fontSize: 14, fontWeight: '600' },
})
