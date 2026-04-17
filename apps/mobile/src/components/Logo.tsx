import React from 'react'
import Svg, { Defs, LinearGradient, Stop, Rect, ClipPath } from 'react-native-svg'

interface LogoProps {
  size?: number
}

export function Logo({ size = 40 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="g" x1="5" y1="5" x2="95" y2="95" gradientUnits="userSpaceOnUse">
          <Stop offset="0"   stopColor="#29BEFF" />
          <Stop offset="0.5" stopColor="#1B4FA8" />
          <Stop offset="1"   stopColor="#0D2045" />
        </LinearGradient>
        <ClipPath id="plus">
          <Rect x="33" y="5"  width="34" height="90" rx="17" />
          <Rect x="5"  y="33" width="90" height="34" rx="17" />
        </ClipPath>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill="url(#g)" clipPath="url(#plus)" />
    </Svg>
  )
}
