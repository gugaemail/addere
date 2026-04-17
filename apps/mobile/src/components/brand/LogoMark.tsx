import React from 'react'
import Svg, { Defs, LinearGradient, Stop, Rect, ClipPath, G } from 'react-native-svg'

type Variant = 'light' | 'dark'

interface LogoMarkProps {
  size?:    number
  variant?: Variant
}

// No dark variant the gradient starts lighter (accent) so it pops on dark surfaces.
// On light variant it goes accent → primary → dark for depth on white/light backgrounds.
const STOPS: Record<Variant, { offset: string; color: string }[]> = {
  light: [
    { offset: '0',   color: '#29BEFF' },
    { offset: '0.5', color: '#1B4FA8' },
    { offset: '1',   color: '#0D2045' },
  ],
  dark: [
    { offset: '0',   color: '#29BEFF' },
    { offset: '1',   color: '#1B4FA8' },
  ],
}

export function LogoMark({ size = 40, variant = 'light' }: LogoMarkProps) {
  const stops = STOPS[variant]

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="lm-grad" x1="5" y1="5" x2="95" y2="95" gradientUnits="userSpaceOnUse">
          {stops.map((s) => (
            <Stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </LinearGradient>
        {/* Pill-shaped plus: two rounded rectangles whose union forms the plus sign */}
        <ClipPath id="lm-plus">
          <Rect x="33" y="5"  width="34" height="90" rx="17" ry="17" />
          <Rect x="5"  y="33" width="90" height="34" rx="17" ry="17" />
        </ClipPath>
      </Defs>
      <G clipPath="url(#lm-plus)">
        <Rect x="0" y="0" width="100" height="100" fill="url(#lm-grad)" />
      </G>
    </Svg>
  )
}
