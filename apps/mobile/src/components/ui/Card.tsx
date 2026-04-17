import React from 'react'
import { View, StyleSheet, type ViewProps } from 'react-native'
import { colors, spacing, radius } from '../../theme'

interface CardProps extends ViewProps {
  children: React.ReactNode
  padding?: keyof typeof spacing
}

export function Card({ children, padding = 'md', style, ...props }: CardProps) {
  return (
    <View style={[styles.card, { padding: spacing[padding] }, style]} {...props}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral.white,
    borderWidth:     1,
    borderColor:     colors.neutral.border,
    borderRadius:    radius.lg,
    // elevation-1: sombra sutil para Android e iOS
    elevation: 1,
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius:  2,
  },
})
