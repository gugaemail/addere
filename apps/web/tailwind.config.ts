import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1B4FA8',
          50:  '#EEF4FF',
          100: '#E8F4FF',
          200: '#C3D9F7',
          300: '#90BAF0',
          400: '#5695E5',
          500: '#2A72D0',
          600: '#1B4FA8',
          700: '#154291',
          800: '#0F3275',
          900: '#0D2045',
        },
        accent:  'var(--color-accent)',
        navy:    'var(--color-navy)',
        tint:    'var(--color-tint)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger:  'var(--color-danger)',
        muted:   'var(--color-muted)',
        border2: 'var(--color-border)',
        surface: 'var(--color-surface)',
      },
      letterSpacing: {
        tight:   '-0.02em',
        tighter: '-0.04em',
      },
      boxShadow: {
        card:  '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        modal: '0 20px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
        fab:   '0 4px 14px rgba(27,79,168,0.35)',
      },
      keyframes: {
        'modal-in': {
          '0%':   { opacity: '0', transform: 'scale(0.95) translateY(4px)' },
          '100%': { opacity: '1', transform: 'scale(1)   translateY(0)' },
        },
        'backdrop-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'skeleton-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
      },
      animation: {
        'modal-in':       'modal-in 0.15s ease-out',
        'backdrop-in':    'backdrop-in 0.15s ease-out',
        'skeleton-pulse': 'skeleton-pulse 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
