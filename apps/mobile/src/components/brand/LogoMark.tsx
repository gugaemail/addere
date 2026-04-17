import React from 'react'
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg'

type Variant = 'light' | 'dark'

interface LogoMarkProps {
  size?:    number
  variant?: Variant
}

export function LogoMark({ size = 40, variant = 'light' }: LogoMarkProps) {
  const isDark = variant === 'dark'

  // Vertical bar: cyan (top) → navy (bottom)
  const vTop    = isDark ? '#4DD4FF' : '#29BEFF'
  const vBottom = isDark ? '#1B4FA8' : '#0D1B3E'

  // Horizontal bar: steel-blue (left) → navy (right)
  const hLeft  = isDark ? '#2288CC' : '#1A7DC4'
  const hRight = isDark ? '#1B3A7A' : '#0D1B3E'

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="lm-v" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={vTop}    />
          <Stop offset="1" stopColor={vBottom} />
        </LinearGradient>
        <LinearGradient id="lm-h" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={hLeft}  />
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
