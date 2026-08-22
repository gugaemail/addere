import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      // Chave dummy de 64 hex para os testes de criptografia
      PROTHEUS_ENCRYPTION_KEY: 'a'.repeat(64),
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      DATABASE_URL_DIRECT: 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      // Prévia das consultas da Inteligência roda contra o adapter sintético
      INTEL_SQL_ADAPTER: 'mock',
      INTEL_GEOCODER: 'mock',
    },
  },
})
