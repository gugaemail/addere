import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/modules/**', 'src/middleware/**', 'src/lib/**'],
      exclude: ['src/modules/**/*.schema.ts'],
    },
  },
})
