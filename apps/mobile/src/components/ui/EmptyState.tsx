import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, {
  Circle, Rect, Path, Line, Ellipse, G,
} from 'react-native-svg'
import { colors, spacing, typography } from '../../theme'
import { Button } from './Button'

// ─── Illustrations ───────────────────────────────────────────────────────────

function OrdersIllustration() {
  return (
    <Svg width={120} height={120} viewBox="0 0 120 120">
      {/* Clipboard body */}
      <Rect x="22" y="18" width="64" height="80" rx="6" fill={colors.brand.tint} />
      <Rect x="22" y="18" width="64" height="80" rx="6"
        stroke={colors.brand.primary} strokeWidth="2.5" fill="none" />
      {/* Clip */}
      <Rect x="42" y="13" width="24" height="12" rx="4"
        fill={colors.neutral.white} stroke={colors.brand.primary} strokeWidth="2" />
      {/* Lines */}
      <Line x1="35" y1="48" x2="73" y2="48"
        stroke={colors.brand.primary} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="35" y1="60" x2="73" y2="60"
        stroke={colors.brand.primary} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="35" y1="72" x2="58" y2="72"
        stroke={colors.brand.primary} strokeWidth="2.5" strokeLinecap="round" />
      {/* + circle badge */}
      <Circle cx="85" cy="85" r="16" fill={colors.brand.primary} />
      <Line x1="85" y1="78" x2="85" y2="92"
        stroke={colors.neutral.white} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="78" y1="85" x2="92" y2="85"
        stroke={colors.neutral.white} strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  )
}

function ClientsIllustration() {
  return (
    <Svg width={120} height={120} viewBox="0 0 120 120">
      {/* Person silhouette background circle */}
      <Circle cx="52" cy="52" r="38" fill={colors.brand.tint} />
      <Circle cx="52" cy="52" r="38"
        stroke={colors.brand.primary} strokeWidth="2.5" fill="none" />
      {/* Head */}
      <Circle cx="52" cy="42" r="11" fill={colors.brand.primary} />
      {/* Shoulders */}
      <Path
        d="M28 72 Q28 58 52 58 Q76 58 76 72"
        fill={colors.brand.primary}
      />
      {/* Search circle badge */}
      <Circle cx="83" cy="83" r="15" fill={colors.neutral.white}
        stroke={colors.brand.primary} strokeWidth="2.5" />
      <Circle cx="80" cy="80" r="7"
        stroke={colors.brand.primary} strokeWidth="2.5" fill="none" />
      <Line x1="85" y1="85" x2="93" y2="93"
        stroke={colors.brand.primary} strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  )
}

function ProductsIllustration() {
  return (
    <Svg width={120} height={120} viewBox="0 0 120 120">
      {/* Box bottom half */}
      <Path
        d="M22 58 L22 92 Q22 96 26 96 L82 96 Q86 96 86 92 L86 58 Z"
        fill={colors.brand.tint} stroke={colors.brand.primary} strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Box top flaps open */}
      <Path
        d="M22 58 L54 44 L86 58"
        fill="none" stroke={colors.brand.primary} strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Left flap */}
      <Path
        d="M22 58 L38 34 L54 44"
        fill={colors.brand.tint} stroke={colors.brand.primary} strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Right flap */}
      <Path
        d="M86 58 L70 34 L54 44"
        fill={colors.brand.tint} stroke={colors.brand.primary} strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Centre ribbon */}
      <Line x1="54" y1="58" x2="54" y2="96"
        stroke={colors.brand.primary} strokeWidth="2" strokeDasharray="4,3" />
      {/* Star/shine inside */}
      <Circle cx="54" cy="77" r="8" fill={colors.brand.primary} opacity={0.15} />
    </Svg>
  )
}

function GoalsIllustration() {
  return (
    <Svg width={120} height={120} viewBox="0 0 120 120">
      {/* Axis lines */}
      <Line x1="22" y1="90" x2="100" y2="90"
        stroke={colors.brand.primary} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="22" y1="22" x2="22" y2="90"
        stroke={colors.brand.primary} strokeWidth="2.5" strokeLinecap="round" />
      {/* Bar 1 — short */}
      <Rect x="32" y="72" width="16" height="18" rx="3"
        fill={colors.brand.tint} stroke={colors.brand.primary} strokeWidth="2" />
      {/* Bar 2 — medium */}
      <Rect x="56" y="54" width="16" height="36" rx="3"
        fill={colors.brand.primary} opacity={0.6} />
      {/* Bar 3 — tall, accent */}
      <Rect x="80" y="34" width="16" height="56" rx="3"
        fill={colors.brand.accent} />
      {/* Trend arrow */}
      <Path
        d="M36 68 L64 50 L88 32"
        fill="none" stroke={colors.brand.primary} strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,3"
      />
      <Path
        d="M84 28 L92 32 L88 40"
        fill="none" stroke={colors.brand.primary} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  )
}

const illustrations = {
  orders:   OrdersIllustration,
  clients:  ClientsIllustration,
  products: ProductsIllustration,
  goals:    GoalsIllustration,
} as const

// ─── Component ───────────────────────────────────────────────────────────────

type IllustrationKey = keyof typeof illustrations

interface EmptyStateProps {
  illustration: IllustrationKey
  title: string
  subtitle?: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({
  illustration,
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const Illustration = illustrations[illustration]

  return (
    <View style={styles.container}>
      <Illustration />
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {actionLabel && (
        <Button
          variant="secondary"
          size="md"
          onPress={onAction}
          style={styles.action}
        >
          {actionLabel}
        </Button>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing['2xl'],
    gap: spacing.sm,
  },
  title: {
    fontFamily: typography.fontFamily.sansSemibold,
    fontSize: typography.size.lg,
    color: colors.brand.dark,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  subtitle: {
    fontFamily: typography.fontFamily.mono,
    fontSize: typography.size.md,
    color: colors.semantic.muted,
    textAlign: 'center',
    lineHeight: typography.size.md * typography.lineHeight.normal,
  },
  action: {
    marginTop: spacing.sm,
  },
})
