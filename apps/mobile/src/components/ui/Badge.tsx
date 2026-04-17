import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, spacing, radius, typography } from '../../theme'

type Variant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

interface BadgeProps {
  variant?: Variant
  children: React.ReactNode
}

const bg: Record<Variant, string> = {
  success: colors.semantic.success + '1F',
  warning: colors.semantic.warning + '1F',
  danger:  colors.semantic.danger  + '1F',
  info:    colors.brand.primary    + '1F',
  neutral: colors.semantic.muted   + '1F',
}

const fg: Record<Variant, string> = {
  success: colors.semantic.success,
  warning: colors.semantic.warning,
  danger:  colors.semantic.danger,
  info:    colors.brand.primary,
  neutral: colors.semantic.muted,
}

export function Badge({ variant = 'neutral', children }: BadgeProps) {
  return (
    <View style={[styles.pill, { backgroundColor: bg[variant] }]}>
      <Text style={[styles.label, { color: fg[variant] }]}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    alignSelf:         'flex-start',
    borderRadius:      radius.full,
    paddingVertical:   spacing.xs - 2,
    paddingHorizontal: spacing.sm,
  },
  label: {
    fontFamily:         typography.fontFamily.monoBold,
    fontSize:           typography.size.xs,
    includeFontPadding: false,
  },
})
