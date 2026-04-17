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
- Web: Next.js 15 App Router + Tailwind v4 + TypeScript
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

- `apps/mobile` — React Native (Expo SDK 51+)
- `apps/web` — Next.js 14 (App Router) + TailwindCSS — painel admin
- `apps/api` — Node.js com Fastify — backend
- `packages/db` — Prisma schema e migrations (PostgreSQL)
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
- `syncConfig` (JSONB) — mapeamento de campos Protheus → campos internos por entidade; sobrescreve os `DEFAULT_MAPPINGS` de `apps/api/src/modules/sync/default-mappings.ts`

O token é obtido antes de cada chamada via `protheus.client.ts` e cacheado em memória por 55 minutos por empresa.

Módulo de sync: `apps/api/src/modules/sync/`
- `protheus.client.ts` — cliente HTTP com token cache
- `field-mapper.ts` — `mapRecord()` e `extractRecords()` genéricos
- `default-mappings.ts` — mapeamentos padrão (campos Protheus mais comuns)
- `sync.service.ts` — funções de sincronização por entidade
- `sync.routes.ts` — rotas `POST /sync/*`

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

| Fase | Descrição | Status |
|------|-----------|--------|
| 1 | Setup monorepo | ✅ 100% |
| 2 | Banco + Prisma | ✅ 100% |
| 3 | Autenticação JWT | ✅ 100% |
| 4 | Telas mobile (M-01 a M-07) | ✅ 100% |
| 5 | Painel web admin (W-01, W-02) | ✅ 100% |
| 6 | Integração Protheus | 🔄 15% — Etapa 6.1 concluída |
| 7 | Modo offline + sincronização | ❌ 0% |

### Fase 6 — Etapas pendentes

- **6.2** — `POST /sync/customers` — sync de clientes via `apiCliente`
- **6.3** — `POST /sync/transportadoras` — sync via `apiTransp` + hook mobile + seleção no wizard
- **6.4** — `POST /sync/cond-pags` — sync via `apiCondPag` + hook mobile + seleção no wizard
- **6.5** — `POST /orders/:id/sync` — envio de pedido ao Protheus via `apiPedido`; atualiza `status=SYNCED`, `protheusOrderId`, `syncedAt`
- **6.6** — `GET /orders/:id/status` — consulta status no Protheus via `apiConsPed`
- **6.7** — `GET /sync/metas` — metas do vendedor via `apiMetaVend`

### Fase 7 — Modo offline
- Instalar `expo-sqlite` no mobile
- Schema SQLite local para pedidos pendentes
- Queue de sincronização: pedido criado offline → enviado quando conectar

## Arquivos Críticos

| Arquivo | Descrição |
|---------|-----------|
| `packages/db/prisma/schema.prisma` | Schema de referência |
| `apps/api/src/modules/sync/` | Módulo de integração Protheus |
| `apps/api/src/modules/orders/orders.schema.ts` | Validação Zod dos pedidos |
| `apps/api/src/modules/orders/orders.service.ts` | Lógica de criação de pedidos |
| `apps/web/src/app/(admin)/empresas/[id]/page.tsx` | Detalhe da empresa + aba Protheus |
| `packages/types/src/index.ts` | Tipos compartilhados (Company, Order, Product, etc.) |
