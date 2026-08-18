import React from 'react'
import {
  TouchableOpacity,
  Text,
  View,
  ActivityIndicator,
  StyleSheet,
  type TouchableOpacityProps,
} from 'react-native'
import { colors, spacing, radius, typography } from '../../theme'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ghostDanger'
type Size = 'xs' | 'sm' | 'md' | 'lg'

interface ButtonProps extends TouchableOpacityProps {
  variant?: Variant
  size?: Size
  loading?: boolean
  /** Ícone Lucide exibido junto ao texto */
  icon?: React.JSX.Element
  /** Lado do ícone (padrão: esquerda) */
  iconPosition?: 'left' | 'right'
  // Tipado a partir do TouchableOpacity para ficar compatível com os tipos do
  // react-native (que usam outra versão de @types/react no monorepo).
  // Opcional para permitir botão só com ícone.
  children?: TouchableOpacityProps['children']
}

const containerStyles: Record<Variant, object> = {
  primary: { backgroundColor: colors.brand.primary, borderWidth: 0 },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.brand.primary,
  },
  ghost: { backgroundColor: 'transparent', borderWidth: 0 },
  danger: { backgroundColor: colors.semantic.danger, borderWidth: 0 },
  // Ação destrutiva discreta (ex.: "Cancelar" em rodapés de formulário)
  ghostDanger: { backgroundColor: 'transparent', borderWidth: 0 },
}

const textStyles: Record<Variant, object> = {
  primary: { color: colors.neutral.white },
  secondary: { color: colors.brand.primary },
  ghost: { color: colors.brand.primary },
  danger: { color: colors.neutral.white },
  ghostDanger: { color: colors.semantic.danger },
}

const sizeContainer: Record<Size, object> = {
  xs: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  sm: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  md: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  lg: { paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
}

const sizeText: Record<Size, number> = {
  xs: typography.size.xs,
  sm: typography.size.sm,
  md: typography.size.md,
  lg: typography.size.lg,
}

/** Cor de primeiro plano (texto/spinner) por variante — útil para colorir o ícone */
export const buttonForeground: Record<Variant, string> = {
  primary: colors.neutral.white,
  secondary: colors.brand.primary,
  ghost: colors.brand.primary,
  danger: colors.neutral.white,
  ghostDanger: colors.semantic.danger,
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconPosition = 'left',
  disabled,
  children,
  style,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading
  const hasLabel = children != null && children !== '' && children !== false

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
        <ActivityIndicator size="small" color={buttonForeground[variant]} />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <View style={hasLabel ? styles.iconLeft : undefined}>{icon}</View>
          )}
          {hasLabel && (
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
          {icon && iconPosition === 'right' && (
            <View style={hasLabel ? styles.iconRight : undefined}>{icon}</View>
          )}
        </>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  iconLeft: {
    marginRight: spacing.sm,
  },
  iconRight: {
    marginLeft: spacing.sm,
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
