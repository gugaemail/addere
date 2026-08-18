import React, { useState } from 'react'
import {
  TextInput,
  TouchableOpacity,
  View,
  Text,
  StyleSheet,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { X } from 'lucide-react-native'
import { colors, spacing, radius, typography } from '../../theme'

interface InputProps extends TextInputProps {
  label?: string
  error?: string
  /** Elemento (ícone Lucide) exibido à esquerda do campo */
  leftElement?: React.JSX.Element
  /** Elemento exibido à direita do campo */
  rightElement?: React.JSX.Element
  /** Exibe um botão "limpar" (X) quando há valor */
  onClear?: () => void
  /** Estilo da caixa do campo (borda) — `style` continua indo para o TextInput */
  containerStyle?: StyleProp<ViewStyle>
}

export function Input({
  label,
  error,
  leftElement,
  rightElement,
  onClear,
  containerStyle,
  style,
  value,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const [focused, setFocused] = useState(false)
  const showClear = !!onClear && !!value

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          error && styles.fieldError,
          containerStyle,
        ]}
      >
        {leftElement && <View style={styles.side}>{leftElement}</View>}
        <TextInput
          style={[styles.input, style]}
          value={value}
          placeholderTextColor={colors.neutral.placeholder}
          onFocus={(e) => {
            setFocused(true)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            setFocused(false)
            onBlur?.(e)
          }}
          {...props}
        />
        {showClear && (
          <TouchableOpacity
            onPress={onClear}
            style={styles.side}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            accessibilityLabel="Limpar"
          >
            <X size={16} color={colors.neutral.placeholder} strokeWidth={1.5} />
          </TouchableOpacity>
        )}
        {rightElement && <View style={styles.side}>{rightElement}</View>}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    fontFamily: typography.fontFamily.sansMedium,
    fontSize: typography.size.sm,
    color: colors.neutral.text,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.neutral.border,
    borderRadius: radius.sm,
    backgroundColor: colors.neutral.white,
    paddingHorizontal: spacing.md,
  },
  fieldFocused: {
    borderColor: colors.brand.primary,
  },
  fieldError: {
    borderColor: colors.semantic.danger,
  },
  side: {
    marginHorizontal: spacing.xs,
  },
  input: {
    flex: 1,
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.md,
    color: colors.neutral.text,
    paddingVertical: spacing.sm,
    paddingHorizontal: 0,
  },
  error: {
    fontFamily: typography.fontFamily.body,
    fontSize: typography.size.xs,
    color: colors.semantic.danger,
  },
})
