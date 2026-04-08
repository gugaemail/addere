import { useColorScheme } from 'react-native'

export const light = {
  bg:       '#f3f4f6',
  surface:  '#ffffff',
  subtle:   '#f9fafb',
  border:   '#e5e7eb',
  text:     '#111827',
  textSub:  '#6b7280',
  textMuted:'#9ca3af',
  brand:    '#2563eb',
  tab: {
    active:   '#2563eb',
    inactive: '#6b7280',
    bg:       '#ffffff',
    border:   '#e5e7eb',
  },
}

export const dark = {
  bg:       '#0f1117',
  surface:  '#161b27',
  subtle:   '#1e2535',
  border:   '#2a3347',
  text:     '#f1f5f9',
  textSub:  '#94a3b8',
  textMuted:'#64748b',
  brand:    '#3b82f6',
  tab: {
    active:   '#3b82f6',
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
