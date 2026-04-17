import React, { useState } from 'react'
import {
  TextInput,
  View,
  Text,
  StyleSheet,
  type TextInputProps,
} from 'react-native'
import { colors, spacing, radius, typography } from '../../theme'

interface InputProps extends TextInputProps {
  label?: string
  error?: string
}

export function Input({ label, error, style, onFocus, onBlur, ...props }: InputProps) {
  const [focused, setFocused] = useState(false)

  return (
    <View style={styles.wrapper}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          error  && styles.inputError,
          style,
        ]}
        placeholderTextColor={colors.neutral.textSub}
        onFocus={(e) => { setFocused(true);  onFocus?.(e) }}
        onBlur={(e)  => { setFocused(false); onBlur?.(e)  }}
        {...props}
      />
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
    fontSize:   typography.size.sm,
    color:      colors.neutral.text,
  },
  input: {
    fontFamily:   typography.fontFamily.mono,
    fontSize:     typography.size.md,
    color:        colors.neutral.text,
    borderWidth:  1,
    borderColor:  colors.neutral.border,
    borderRadius: radius.sm,
    paddingVertical:   spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor:   colors.neutral.white,
  },
  inputFocused: {
    borderColor: colors.brand.primary,
  },
  inputError: {
    borderColor: colors.semantic.danger,
  },
  error: {
    fontFamily: typography.fontFamily.mono,
    fontSize:   typography.size.xs,
    color:      colors.semantic.danger,
  },
})
