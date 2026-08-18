import React from 'react'
import {
  View,
  TouchableOpacity,
  StyleSheet,
  type ViewProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { colors, spacing, radius } from '../../theme'

interface CardProps {
  // Tipado a partir do View para ficar compatível com os tipos do react-native
  children: ViewProps['children']
  padding?: keyof typeof spacing
  /** Quando informado, o card vira um TouchableOpacity */
  onPress?: () => void
  disabled?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
}

export function Card({ padding = 'md', onPress, disabled, style, children, testID }: CardProps) {
  const cardStyle = [styles.card, { padding: spacing[padding] }, style]

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={onPress}
        disabled={disabled}
        style={cardStyle}
        testID={testID}
      >
        {children}
      </TouchableOpacity>
    )
  }

  return (
    <View style={cardStyle} testID={testID}>
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
    shadowColor:   colors.brand.dark,
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius:  3,
  },
})
