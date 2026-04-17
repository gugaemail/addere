import React from 'react'
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  type TouchableOpacityProps,
} from 'react-native'
import { colors, spacing, radius, typography } from '../../theme'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size    = 'sm' | 'md' | 'lg'

interface ButtonProps extends TouchableOpacityProps {
  variant?: Variant
  size?: Size
  loading?: boolean
  children: React.ReactNode
}

const containerStyles: Record<Variant, object> = {
  primary:   { backgroundColor: colors.brand.primary,   borderWidth: 0 },
  secondary: { backgroundColor: 'transparent',          borderWidth: 1.5, borderColor: colors.brand.primary },
  ghost:     { backgroundColor: 'transparent',          borderWidth: 0 },
  danger:    { backgroundColor: colors.semantic.danger, borderWidth: 0 },
}

const textStyles: Record<Variant, object> = {
  primary:   { color: colors.neutral.white },
  secondary: { color: colors.brand.primary },
  ghost:     { color: colors.brand.primary },
  danger:    { color: colors.neutral.white },
}

const sizeContainer: Record<Size, object> = {
  sm: { paddingVertical: spacing.xs,  paddingHorizontal: spacing.md },
  md: { paddingVertical: spacing.sm,  paddingHorizontal: spacing.lg },
  lg: { paddingVertical: spacing.md,  paddingHorizontal: spacing.xl },
}

const sizeText: Record<Size, number> = {
  sm: typography.size.sm,
  md: typography.size.md,
  lg: typography.size.lg,
}

export function Button({
  variant = 'primary',
  size    = 'md',
  loading = false,
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      disabled={isDisabled}
      style={[
        styles.base,
        containerStyles[variant],
        sizeContainer[size],
        isDisabled && styles.disabled,
        style,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'secondary' || variant === 'ghost'
            ? colors.brand.primary
            : colors.neutral.white}
        />
      ) : (
        <Text
          style={[
            styles.text,
            textStyles[variant],
            { fontSize: sizeText[size] },
            isDisabled && styles.textDisabled,
          ]}
        >
          {children}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius:    radius.md,
    alignItems:      'center',
    justifyContent:  'center',
    flexDirection:   'row',
  },
  text: {
    fontFamily: typography.fontFamily.sansSemibold,
    includeFontPadding: false,
  },
  disabled: {
    opacity: 0.45,
  },
  textDisabled: {},
})
