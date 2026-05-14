import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['cjs'],
  dts: false,
  // Bundla os pacotes do workspace (TypeScript source) junto com a API
  // Externaliza apenas o Prisma Client (gerado em runtime)
  noExternal: ['@addere/types', '@addere/db'],
  external: ['@prisma/client', '.prisma'],
})
