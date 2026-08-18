// Tokens de cor da marca Addere para uso em contextos onde classes Tailwind /
// variáveis CSS não funcionam (SVG inline, gráficos Recharts, e-mails HTML).
// Este é o ÚNICO arquivo do web onde hex é permitido (ignorado pelo ESLint).
// Fonte da verdade: CLAUDE.md + apps/web/tailwind.config.ts + globals.css.

export const BRAND = {
  primary: '#1B4FA8',
  accent:  '#29BEFF',
  navy:    '#0D2045',
  tint:    '#E8F4FF',
  success: '#22C55E',
  warning: '#F59E0B',
  danger:  '#EF4444',
  muted:   '#64748B',
  border:  '#E2E8F0',
  surface: '#F8FAFC',
} as const

// Neutros e variações usados apenas no e-mail HTML (sem tema dark, sem CSS vars).
// Mantidos aqui para que WeeklyPilotReport.tsx não precise de hex inline.
export const EMAIL_PALETTE = {
  white:         '#FFFFFF',
  textPrimary:   BRAND.navy,
  textSecondary: '#475569',
  textBody:      '#334155',
  textMuted:     '#94A3B8',
  divider:       '#F1F5F9',
  brandSoft:     '#93C5FD',
  infoBg:        '#EFF6FF',
  dangerBg:      '#FEF2F2',
  dangerBorder:  '#FECACA',
  dangerText:    '#B91C1C',
  dangerTextDim: '#7F1D1D',
} as const

export type BrandColor = keyof typeof BRAND
