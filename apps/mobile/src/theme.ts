import { useColorScheme } from 'react-native'
import { colors } from './theme/colors'

export const light = {
  bg:        colors.neutral.bg,
  surface:   colors.neutral.white,
  subtle:    '#F1F5F9',
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

export const dark = {
  bg:        '#0f1117',
  surface:   '#161b27',
  subtle:    '#1e2535',
  border:    '#2a3347',
  text:      '#f1f5f9',
  textSub:   '#94a3b8',
  textMuted: '#64748b',
  brand:     colors.brand.accent,
  tab: {
    active:   colors.brand.accent,
    inactive: '#64748b',
    bg:       '#161b27',
    border:   '#2a3347',
  },
}

export type Theme = typeof light

export function useTheme(): Theme {
  const scheme = useColorScheme()
  return scheme === 'dark' ? dark : light
}
