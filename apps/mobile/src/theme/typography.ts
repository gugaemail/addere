export const fontFamily = {
  sans:         'PlusJakartaSans_400Regular',
  sansMedium:   'PlusJakartaSans_500Medium',
  sansSemibold: 'PlusJakartaSans_600SemiBold',
  sansBold:     'PlusJakartaSans_700Bold',
  mono:         'Inter_400Regular',
  monoBold:     'Inter_700Bold',
} as const

export const typography = {
  fontFamily,
  size: {
    xs:   11,
    sm:   13,
    md:   15,
    lg:   17,
    xl:   20,
    '2xl': 24,
    '3xl': 30,
  },
  weight: {
    regular:  '400' as const,
    medium:   '500' as const,
    semibold: '600' as const,
    bold:     '700' as const,
  },
  lineHeight: {
    tight:  1.25,
    normal: 1.5,
    loose:  1.75,
  },
} as const
