import React from 'react'
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg'
import { colors } from '../../theme/colors'

type Variant = 'light' | 'dark'

interface LogoMarkProps {
  size?: number
  variant?: Variant
}

export function LogoMark({ size = 40, variant = 'light' }: LogoMarkProps) {
  const isDark = variant === 'dark'

  // Vertical bar: cyan (top) → navy (bottom)
  const vTop = isDark ? colors.logo.cyanBright : colors.brand.accent
  const vBottom = isDark ? colors.brand.primary : colors.logo.navyDeep

  // Horizontal bar: steel-blue (left) → navy (right)
  const hLeft = isDark ? colors.logo.steelDark : colors.logo.steelBlue
  const hRight = isDark ? colors.logo.navyMuted : colors.logo.navyDeep

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="lm-v" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={vTop} />
          <Stop offset="1" stopColor={vBottom} />
        </LinearGradient>
        <LinearGradient id="lm-h" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={hLeft} />
          <Stop offset="1" stopColor={hRight} />
        </LinearGradient>
      </Defs>

      {/* Horizontal bar — behind */}
      <Rect x="5" y="33" width="90" height="34" rx="17" fill="url(#lm-h)" />

      {/* Vertical bar — in front */}
      <Rect x="33" y="5" width="34" height="90" rx="17" fill="url(#lm-v)" />
    </Svg>
  )
}
