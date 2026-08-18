// ESLint flat config do monorepo — lint dos 3 apps + packages.
// Regras de marca do mobile (sem hex fora do theme) são travadas aqui.
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.expo/**',
      'apps/mobile/e2e/**',
      'packages/types/dist/**',
      '**/*.config.js',
      '**/*.config.mjs',
      'apps/mobile/babel.config.js',
      'apps/mobile/metro.config.js',
      'apps/mobile/app.config.js',
      'apps/mobile/scripts/**',
      'apps/web/public/**',
      'apps/web/next-env.d.ts',
      'apps/mobile/.detoxrc.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      // O codebase usa APIs tipadas; any explícito é sempre evitável
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },

  // Testes jest: require() dentro de jest.mock é o padrão (hoisting)
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // Apps React (web + mobile): regras de hooks
  {
    files: ['apps/web/src/**/*.{ts,tsx}', 'apps/mobile/{app,src}/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Regras de marca do mobile: cores só via src/theme (CLAUDE.md)
  {
    files: ['apps/mobile/{app,src}/**/*.{ts,tsx}'],
    ignores: ['apps/mobile/src/theme/**'],
    rules: {
      'no-restricted-syntax': ['error', {
        selector: "Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
        message: 'Não use cores hex fora de src/theme — importe os tokens de src/theme/colors.ts (regra de marca do CLAUDE.md).',
      }],
    },
  },

  // Web: cores hex também só via tokens (tailwind.config/globals.css)
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/lib/brand-tokens.ts'],
    rules: {
      'no-restricted-syntax': ['warn', {
        selector: "Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
        message: 'Prefira os tokens de marca (classes Tailwind brand/accent/... ou var(--*)) a hex hardcoded.',
      }],
    },
  }
)
