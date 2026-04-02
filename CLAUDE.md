# CLAUDE.md

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
npx prisma migrate dev      # criar migration
npx prisma migrate deploy   # aplicar em produção
npx prisma generate         # gerar client
npx prisma studio           # GUI do banco
```

## Arquitetura

### Auth
JWT com dois tokens: access token (8h) + refresh token (30d). Middleware de autenticação no Fastify valida o access token em todas as rotas protegidas.

### Banco de dados
- PostgreSQL via Prisma ORM no backend (nunca usar SQL raw)
- SQLite local via `expo-sqlite` no mobile para modo offline
- Soft delete em `users`, `customers` e `products` via campo `active = false` (nunca deletar fisicamente)

### Integração Protheus
Comunicação via `PROTHEUS_API_BASE_URL` + `PROTHEUS_API_KEY`. Encapsulada na camada de serviços da API.

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
PROTHEUS_API_BASE_URL
PROTHEUS_API_KEY
NODE_ENV
PORT
CORS_ORIGIN
EXPO_PUBLIC_API_URL
```

## Fases de Implementação

1. Setup monorepo + estrutura de pastas
2. Banco de dados + migrations Prisma
3. Autenticação JWT (login, refresh, middleware)
4. Telas mobile (M-01 a M-07)
5. Painel web admin (W-01, W-02)
6. Integração API Protheus
7. Modo offline + sincronização
