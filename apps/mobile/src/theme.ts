import { useColorScheme } from 'react-native'
import { colors } from './theme/colors'

export { colors } from './theme/colors'
export { spacing } from './theme/spacing'
export { radius } from './theme/radius'
export { typography } from './theme/typography'

export const light = {
  bg:        colors.neutral.bg,
  surface:   colors.neutral.white,
  subtle:    colors.neutral.subtle,
  border:    colors.neutral.border,
  text:      colors.neutral.text,
  textSub:   colors.neutral.textSub,
  textMuted: colors.semantic.muted,
  brand:     colors.brand.primary,
  tab: {
    active:   colors.brand.primary,
    inactive: colors.neutral.textSub,
    bg:       colors.neutral.white,
    border:   colors.neutral.border,
  },
}

// Paleta escura vem de colors.dark (src/theme/colors.ts)
export const dark = {
  bg:        colors.dark.bg,
  surface:   colors.dark.surface,
  subtle:    colors.dark.subtle,
  border:    colors.dark.border,
  text:      colors.dark.text,
  textSub:   colors.dark.textSub,
  textMuted: colors.dark.textMuted,
  brand:     colors.brand.accent,
  tab: {
    active:   colors.brand.accent,
    inactive: colors.dark.textMuted,
    bg:       colors.dark.surface,
    border:   colors.dark.border,
  },
}

export type Theme = typeof light

export function useTheme(): Theme {
  const scheme = useColorScheme()
  return scheme === 'dark' ? dark : light
}
