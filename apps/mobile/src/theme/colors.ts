export const colors = {
  brand: {
    primary: '#1B4FA8',
    accent: '#29BEFF',
    dark: '#0D2045',
    tint: '#E8F4FF',
  },
  semantic: {
    success: '#22C55E',
    successLight: '#F0FDF4',
    warning: '#F59E0B',
    danger: '#EF4444',
    dangerLight: '#FEE2E2',
    muted: '#64748B',
  },
  neutral: {
    white: '#FFFFFF',
    black: '#000000',
    bg: '#F8FAFC',
    subtle: '#F1F5F9',
    border: '#E2E8F0',
    text: '#1E293B',
    textSub: '#64748B',
    placeholder: '#94A3B8',
    // Elementos inativos/desabilitados (ex.: indicador de passo não atingido)
    disabled: '#CBD5E1',
  },
  // Paleta do tema escuro — consumida por src/theme.ts (useTheme)
  dark: {
    bg: '#0F1117',
    surface: '#161B27',
    subtle: '#1E2535',
    border: '#2A3347',
    text: '#F1F5F9',
    textSub: '#94A3B8',
    textMuted: '#64748B',
  },
  // Fundo escurecido atrás de modais/bottom sheets (navy a 45%)
  overlay: {
    scrim: 'rgba(13, 32, 69, 0.45)',
  },
  // Cores de marcas de terceiros usadas em ações de compartilhamento
  external: {
    whatsapp: '#25D366',
  },
  // Gradientes do logotipo (LogoMark) — variantes claro/escuro da marca
  logo: {
    cyanBright: '#4DD4FF',
    steelBlue: '#1A7DC4',
    steelDark: '#2288CC',
    navyDeep: '#0D1B3E',
    navyMuted: '#1B3A7A',
  },
}
