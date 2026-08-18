# Addere — Project Context

## Product

Mobile ERP extension for Protheus/TOTVS. React Native (Expo) mobile app + Next.js 15 web admin panel.

## Brand Rules — ALWAYS follow these

- NEVER hardcode hex colors. Always use tokens from src/theme/colors.ts (mobile) or Tailwind brand classes (web)
- NEVER use fonts outside the approved list: Plus Jakarta Sans (headings) and Inter (body)
- NEVER use icons outside Lucide library (lucide-react-native on mobile, lucide-react on web)
- ALWAYS use spacing scale multiples of 4px
- ALWAYS use border-radius from theme: sm=6px, md=10px, lg=16px, xl=24px, full=999px
- ALWAYS use the existing UI components (Button, Input, Card, Badge) — never create inline styles for these

## Color Tokens

- Primary: #1B4FA8 (brand blue — CTAs, links, active states)
- Accent: #29BEFF (cyan — highlights, gradients, badges)
- Dark: #0D2045 (deep navy — headings, dark backgrounds)
- Tint: #E8F4FF (light blue — selected states, info backgrounds)
- Success: #22C55E | Warning: #F59E0B | Danger: #EF4444 | Muted: #64748B

## Stack

- Mobile: React Native + Expo + TypeScript
- Web: Next.js 15 App Router + Tailwind v3 + TypeScript
- Icons: Lucide (1.5px stroke, round caps/joins)
- ERP: Protheus/TOTVS REST API integration

## Component Location

- Mobile UI components: src/components/ui/
- Mobile brand components: src/components/brand/
- Web UI components: src/components/ui/
- Theme tokens: src/theme/

## When creating new screens

1. Use #F8FAFC as background
2. Use Card component for list items
3. Use the global header (already configured in navigator)
4. Import colors from theme, never hardcode
5. Use EmptyState component for empty lists

---

# Monorepo — Guia Técnico

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Visão Geral

App mobile para vendedores externos integrarem com ERP Protheus (TOTVS). Monorepo com três aplicações:

- `apps/mobile` — React Native (Expo SDK 54, React Native 0.81)
- `apps/web` — Next.js 15 (App Router) + TailwindCSS v3 — painel admin
- `apps/api` — Node.js com Fastify 5 — backend
- `packages/db` — Prisma 5 schema e migrations (PostgreSQL)
- `packages/types` — tipos TypeScript compartilhados

## Comandos

```bash
# Raiz do monorepo
npm install

# API (apps/api)
npm run dev          # desenvolvimento
npm run build        # build produção
npm run start        # iniciar produção

# Mobile (apps/mobile)
npx expo start       # dev server
npx expo run:android
npx expo run:ios
npx eas build        # build EAS

# Web (apps/web)
npm run dev          # Next.js dev
npm run build
npm run start

# Banco (packages/db)
npx prisma migrate dev      # criar migration (requer DB acessível)
npx prisma migrate deploy   # aplicar em produção
npx prisma generate         # gerar client
npx prisma studio           # GUI do banco
npx prisma validate         # validar schema sem DB

# Qualidade (raiz do monorepo)
npm run lint          # ESLint flat config (eslint.config.mjs)
npm run format        # Prettier (.prettierrc.json)
npm run type-check    # tsc --noEmit (api + web + mobile)
npm test              # Vitest (api, web) + Jest unit (mobile)
```

## Arquitetura

### Auth

JWT com dois tokens: access token (8h) + refresh token (30d). Middleware de autenticação no Fastify valida o access token em todas as rotas protegidas.

### Banco de dados

- PostgreSQL via Prisma ORM no backend (nunca usar SQL raw)
- SQLite local via `expo-sqlite` no mobile para modo offline
- Soft delete em `users`, `customers` e `products` via campo `active = false` (nunca deletar fisicamente)
- O banco (Render) não é acessível localmente. Para gerar SQL de migration sem conexão usar:
  `prisma migrate diff --from-empty --to-schema-datamodel ./prisma/schema.prisma --script`

### Integração Protheus

Cada empresa (`Company`) armazena suas próprias URLs e credenciais:

- `apiToken` — endpoint de autenticação (POST → retorna Bearer token)
- `apiPord`, `apiCliente`, `apiPedido`, `apiConsPed`, `apiCondPag`, `apiTransp`, `apiMetaVend` — endpoints por entidade
- `usrProtheus`, `passProtheus` — credenciais
- `syncConfig` (JSONB) — hoje suporta apenas `tokenField` (nome do campo do token na resposta de autenticação). Mapeamento de campos por empresa/entidade é backlog — os campos Protheus são mapeados de forma fixa nos módulos `*.sync.ts`.

O token é obtido antes de cada chamada via `protheus.client.ts` e cacheado em memória por 55 minutos por empresa (invalidado automaticamente em 401).

Módulo de sync: `apps/api/src/modules/sync/`

- `protheus.client.ts` — cliente HTTP com token cache e proteção anti-SSRF
- `paginated-fetch.ts` — loop de paginação Protheus genérico
- `upsert-chunked.ts` — upsert em chunks com fallback individual
- `order-payload.ts` — builder do payload de pedido (envio real e dry-run)
- `utils.ts` — toStr/toNum/parseProtheusDate/getCredentials
- `products.sync.ts` / `customers.sync.ts` / `references.sync.ts` / `orders.sync.ts` / `metas.sync.ts` — sincronização por entidade
- `sync.service.ts` — barril de re-export
- `sync.routes.ts` — rotas `POST /sync/*` e rotas de diagnóstico `test-*`
- `scheduler.ts` — auto-sync agendado por empresa

### Hosting

- Backend: Render
- Web admin: Vercel
- Mobile: Expo EAS

## Regras Obrigatórias

- **Nunca deletar arquivos** sem confirmar com o usuário primeiro
- **Sempre criar `.env.example`** ao adicionar variáveis de ambiente
- **Sempre TypeScript** — nunca JavaScript puro
- **Sempre Prisma** para queries — nunca SQL raw
- Idioma do código: **inglês**; comentários e commits: **português**
- Soft delete em users, customers, products (`active = false`)
- **Após toda alteração de código, fazer commit no git** — nunca deixar mudanças sem commitar ao final de cada tarefa

## Variáveis de Ambiente

```
DATABASE_URL
JWT_SECRET
JWT_REFRESH_SECRET
NODE_ENV
PORT
CORS_ORIGIN
EXPO_PUBLIC_API_URL
```

> As credenciais Protheus são por empresa no banco (`usrProtheus`, `passProtheus`, `apiToken`, etc.) — não há variável de ambiente global para o Protheus.

## Estado de Implementação

| Fase | Descrição                              | Status     |
| ---- | -------------------------------------- | ---------- |
| 1    | Setup monorepo                         | ✅ 100%    |
| 2    | Banco + Prisma                         | ✅ 100%    |
| 3    | Autenticação JWT                       | ✅ 100%    |
| 4    | Telas mobile (M-01 a M-07)             | ✅ 100%    |
| 5    | Painel web admin (W-01, W-02)          | ✅ 100%    |
| 6    | Integração Protheus (6.1–6.7)          | ✅ 100%    |
| 7    | Modo offline + sincronização           | 🔄 parcial |
| 8    | Tooling: ESLint, Prettier, testes e CI | ✅ 100%    |

### Fase 7 — Modo offline (estado atual)

- Fila de sincronização implementada com Zustand + AsyncStorage
  (`apps/mobile/src/store/syncStore.ts` + `src/services/syncEngine.ts`):
  pedido criado offline entra na fila e é enviado ao reconectar, com backoff.
- Cache offline de dados de referência via `PersistQueryClientProvider` (React Query).
- Backlog: migrar a fila para `expo-sqlite` se o volume de pedidos offline crescer.

### Tooling e CI (estado atual)

- ESLint (flat config na raiz) + Prettier configurados; testes unitários com Vitest (`apps/api`,
  `apps/web`) e Jest (`apps/mobile`); e2e Detox no mobile (`apps/mobile/e2e/README.md`, requer `expo prebuild`).
- CI em `.github/workflows/ci.yml` (lint, type-check, testes e build) — `deploy-api.yml` depende dela.

### Backlog conhecido

- `syncConfig` por empresa: implementar mapeamento de campos Protheus → internos por entidade.

## Arquivos Críticos

| Arquivo                                           | Descrição                                            |
| ------------------------------------------------- | ---------------------------------------------------- |
| `packages/db/prisma/schema.prisma`                | Schema de referência                                 |
| `apps/api/src/modules/sync/`                      | Módulo de integração Protheus                        |
| `apps/api/src/modules/orders/orders.schema.ts`    | Validação Zod dos pedidos                            |
| `apps/api/src/modules/orders/orders.service.ts`   | Lógica de criação de pedidos                         |
| `apps/web/src/app/(admin)/empresas/[id]/page.tsx` | Detalhe da empresa + aba Protheus                    |
| `packages/types/src/index.ts`                     | Tipos compartilhados (Company, Order, Product, etc.) |
