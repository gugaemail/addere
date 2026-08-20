# Addere · Inteligência comercial e roteirização — Plano de execução

**Versão** 0.2 · 19/08/2026 · derivado de `ADDERE-INTELIGENCIA-ARQUITETURA.md` v0.1 + wireframes (`addere-inteligencia-wireframes.html`, `addere-painel-web-wireframes.html`) + leitura do monorepo (`main` = `f83228e`, branch `chore/ios-sim-e2e-setup` = `a1c15d1`).
**Uso** roteiro operacional para o Claude Code. Cada entrega (E-n) é um PR, com arquivos, passos, testes e DoD. O documento de arquitetura é a fonte de *o quê*; este é a fonte de *como e em que ordem*, ancorado no código que existe.
**Histórico** v0.1 → v0.2: revisão adversarial em 4 lentes (completude vs. spec, viabilidade vs. código, sequência/estimativas, segurança/LGPD/tenant). Principais mudanças: cronograma refeito (6 semanas não fecha para 1 dev), E1 quebrado em 3 PRs, jobs `nightly`/`refresh` separados e assíncronos, posse por vendedor nas rotas do app, `Visit.clientId` único por tenant, guarda SQL especificada, allowlist de fatos para o LLM, retenção/LGPD, observabilidade, mock Protheus-SQL antecipado para E2.

---

## 0. Como ler este plano

- **Entrega (E-n)** = 1 branch `feat/intel-<e>-<slug>` + 1 PR para `staging` (`main`/`staging` protegidas, só via PR). Tamanho: S (≤1 dia), M (2–3 dias), L (4–5 dias) — dias-dev de **um** dev com Claude Code.
- **Depende de** = PRs que precisam estar mergeados antes.
- **DoD padrão** de todo PR (além do específico da entrega):
  - `npm run lint` · `npm run type-check` · `npm test` verdes (CI em `.github/workflows/ci.yml` roda sem banco — testes unitários/puros).
  - Nova env → `apps/api/src/lib/env.ts` (Zod) + `apps/api/.env.example` + `.env.example` raiz + `render.yaml` (`sync: false`).
  - Nova migration → delta gerado com `prisma migrate dev --create-only` contra o Postgres local (`docker-compose.yml`) **ou** `prisma migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --shadow-database-url <local> --script`. `--from-empty` só para a baseline de drift (E1a). Nunca editar migration aplicada. Testar `migrate deploy` em um `pg_dump --schema-only` de staging restaurado localmente.
  - Nova permissão → `packages/db/prisma/seed.ts` (`PERMISSIONS` + `DEFAULT_PERMISSIONS_BY_ROLE`) **e** migration de dados (`INSERT INTO permissions … ON CONFLICT DO NOTHING`) — o seed não roda em produção (`render.yaml` só faz `migrate deploy`).
  - Novo testID mobile → tabela em `apps/mobile/e2e/README.md`.
  - Código em inglês, comentários/commits em português; commit ao final (CLAUDE.md).
  - `CLAUDE.md` atualizado quando a entrega muda arquitetura.
- Convenção de nomes (§2.1): **models/colunas/rotas em inglês**, tabelas com prefixo `intel_`, `companyId` como tenant. Os nomes em português do doc ficam como *aliases do contrato SQL* e *rótulos de UI*. Equivalência no §10.

---

## 1. Resumo do plano

| Fase | Objetivo | Entregas | Duração (1 dev) | Duração (2 devs: backend / web+mobile) |
|---|---|---|---|---|
| **0 — Pré-requisitos** | destravar decisões e dependências externas | E0 | paralelo à semana 1–2 | idem |
| **1-A — Piloto com vendedores** | 1 empresa; W3/W4/W5(leitura); sync de contratos; motor v1; agente (Hoje, Antes de entrar, Mensagem); app Hoje/Rota(lista)/Visita/Ficha/Mensagem; feedback e `eval` desde o dia 1; métricas do piloto | E1a–E7, E9, E10, E12, E13, E14a/b | ≈ 9 semanas | ≈ 6 semanas |
| **1-B — Gerente e complementos** | W1 Equipe (sem mapa), W5 edição, Visão geral, e2e offline, prompt Equipe adiado (§2.12) | E8, E11 | + 2 semanas | + 1 semana |
| **2 — Rota e diagnóstico** | geocodificação, ordem por distância, mapa (app e W1), Semana, Carteira/RFM, cross-sell, W2 perdas, "Pôr no plano", estoque ao vivo, config self-service | E15–E22 | 5 semanas | 3 semanas |
| **3 — Fechar o ciclo** | KPIs materializados, penalidade por não conversão, W6, prompt Equipe, calibração de `purchaseProb`, pergunta livre | E23–E27 | 4 semanas | 2–3 semanas |

> O doc de arquitetura estimou "≈ 4–6 semanas" para a Fase 1. A soma das entregas (≈ 52 dias-dev) não cabe em 6 semanas para um dev; cabe com 2 devs em paralelo (backend × web+mobile) ou em ~9 semanas com um dev. O §7 mostra as duas sequências.

Caminho crítico da 1-A: **E1a → E1b → E2 → E3 → E4 → E5 → E6 → E7 → E13 → E14**. E9/E10 (painel) e E12 (fundação mobile) correm em paralelo a partir de E1.

---

## 2. Decisões de engenharia (tomadas neste plano — confirmar as marcadas com ⚠️)

### 2.1 Nomenclatura ⚠️
| Doc propõe | Código hoje | Decisão |
|---|---|---|
| tabelas `crm_*`/`cfg_*`, colunas `cliente_cod`, `tenant_id`, `*_cents` | models PascalCase inglês + `@@map("snake_case")`, colunas camelCase, `companyId` (`packages/db/prisma/schema.prisma`) | **Inglês**, prefixo `intel_`, `companyId`. PT só nos aliases dos contratos SQL e nos rótulos de UI. Mapa no §10. |
| rotas `/admin/*`, `/gerente/*`, `/app/*` | prefixos por entidade em `apps/api/src/app.ts:72-86` | Módulo `apps/api/src/modules/intelligence/` com prefixo `/intel`: `/intel/admin/*`, `/intel/manager/*`, `/intel/app/*`, `/intel/jobs/*`. |
| RLS por tenant (doc §8) | não existe RLS; isolamento por `companyId` nos services | **RLS não adotado** na F1 — isolamento por `companyId` via `requireCompany`/`resolveTenant`, como o restante do schema. Revisar se houver multi-instância/BI direto no banco. |

### 2.2 Dinheiro ⚠️
Doc: `*_cents bigint`. Repo: `Decimal @db.Decimal(10,2)`. **Decisão: `Decimal @db.Decimal(14,2)`** nas tabelas novas; serializado como `string` para os apps (padrão de `Product.price`).

### 2.3 Reaproveitar vs. criar
| Tabela do doc | Decisão |
|---|---|
| `crm_cliente` | **Não criar.** `Customer` (`schema.prisma:233-268`) + `creditLimit Decimal?`, `segment String?`. Contrato `clientes` = enriquecimento opcional (atualiza só esses campos + `ultcom`); o sync atual via `apiCliente` continua sendo a fonte principal. |
| `crm_produto` | **Não criar.** `Product` + `productGroup String?`. Contrato `produtos` = enriquecimento opcional (semanal). |
| `sync_execucao` | **Reutilizar `ProtheusLog`** (`operation = 'intel:<contrato>'`, `recordsSynced`, `durationMs`, `metadata` **só** `{queryId, version, window, rows, ms}` — nunca corpo da resposta) + model novo `IntelJobRun` (lock + última execução por job/tenant). |
| `crm_venda_item`, `crm_titulo`, `crm_meta_hist`, `cfg_consulta`, `cfg_premissa(_hist)`, `crm_sinal_cliente`, `crm_plano(_item)`, `crm_mensagem`, `crm_feedback`, `crm_visita`, `eval_caso` | **Criar** (F1). |
| `cfg_vendedor` | **Colunas em `User`** (`visitsPerDay`, `vehicle`, `servedCities String[]`, `messageTone`); `@@unique([companyId, idVendProt])` (hoje nem índice — `schema.prisma:127`). |
| `geo_endereco`, `cfg_janela_cliente`, `kpi_*`, `crm_sugestao_historico` | Fases 2/3. |
| `PilotFeedback` | Não reaproveitar (exige `Pilot ACTIVE` + `orderId`). Criar `IntelFeedback`; copiar o padrão de `pilot.routes.ts:90-125`. |
| Telemetria do app | Reaproveitar `PilotEvent` estendendo o enum `PilotEventType` (`schema.prisma:30-37`) + zod em `pilot.routes.ts:14-21`; eventos só são gravados com `Pilot ACTIVE` (comportamento atual, aceitável: é telemetria de piloto). |

### 2.4 Papéis ⚠️
Enum `Role` = `SUPERADMIN/ADMIN/SALESPERSON`; o painel bloqueia login de não-SUPERADMIN no cliente (`apps/web/src/app/login/page.tsx:36-39`). **Decisão: sem novo valor no enum.** Permissões dinâmicas (`requirePermission`, `apps/api/src/middleware/authenticate.ts:40-52`) + helper novo `requireAnyPermission(...keys)`:
- `intel.admin` — Consultas, Premissas (editar), Saúde (completa: rodar sync, CSV), aba Inteligência, rodar jobs. Default para `ADMIN` (seed + data migration + aplicado em `createUser`).
- `intel.manager` — Equipe em campo, Onde estou perdendo, Premissas (ler), **Saúde (ler)** (spec diz "admin+gerente"; o wireframe §1 diverge — adotamos leitura), fixar/pausar/pôr no plano. Default: nenhum; atribuída ao gerente via `PUT /users/:id/permissions`.
- `SUPERADMIN` passa em tudo e escolhe o tenant por `companyId` (query/body) via helper novo `resolveTenant` (o `resolveCompany` de `sync.routes.ts:29-46` lê só body, exige `companyId` e não é exportado — não serve como está).
- "Equipe" do gerente na F1 = todos os vendedores da empresa. Hierarquia (`managerId`) = backlog.
- Painel aceita login de `ADMIN` e de quem tem `intel.*` (E9), com home neutra `/inteligencia` até as telas existirem.

### 2.5 Jobs ⚠️
Só existe `setInterval` in-process (`apps/api/src/modules/sync/scheduler.ts`); Render tem só `type: web` (`render.yaml`). **Decisão (MVP "cron simples"):**
1. Jobs são handlers idempotentes registrados em um mapa `job → handler` (`jobs/registry.ts`), com lock por `(companyId, job)` em `IntelJobRun.lockedUntil`.
2. Dois jobs compostos: **`nightly`** (03h BRT: `SYNC` completo por frequência de contrato → `GOALS` → `ENGINE` → `PLAN` → `PURGE`) e **`refresh`** (4/4h: `SYNC` só `SALES` incremental + `OPEN_TITLES` → `ENGINE`, **sem** regerar plano). Frequência por contrato declarada em `contracts.ts` (`CUSTOMERS` diário, `PRODUCTS` semanal, `SALES`/`OPEN_TITLES` 4/4h, `GOALS` diário).
3. Disparo: `POST /intel/jobs/:job` responde **202** após adquirir o lock e executa em background (`setImmediate`, try/catch → `IntelJobRun.status=ERROR`); protegido por `INTEL_CRON_SECRET` (Zod `min(32)` obrigatório; `crypto.timingSafeEqual`; rate limit 10/min; log de negadas). Chamado por GitHub Actions (`.github/workflows/intel-jobs.yml`, `workflow_dispatch` + matriz prod/staging, `curl --max-time 30`). Risco registrado: cron do GitHub tem jitter e é desativado após 60 dias sem commits → fallback interno obrigatório.
4. Fallback in-process: a cada 10 min verifica `IntelJobRun` vencido por `intelligenceConfig.syncHour/syncEveryHours` e roda (padrão `initSchedulers`, `app.ts:89-91`).
5. BullMQ/Redis só com >1 instância ou >10 tenants (backlog).

### 2.6 SQL raw no motor
**Motor 100% Prisma + TypeScript puro** (funções sem `prisma`, testáveis no CI — padrão `orders.pricing.ts`). `$queryRaw` só para agregações medidas (RFM/decomposição, F2) como exceção documentada.

### 2.7 API "qualquer SELECT" do Protheus 🔴 bloqueante
Não existe nada no código. Assumido: nova coluna `Company.apiSql` (URL; passa por `assertSafeUrl` dentro de `protheusPost`), mesmo OAuth2, POST JSON; formato do body/response configurável em `Company.syncConfig.sqlApi = { sqlField, rowsField, pageable, maxRows }` atrás de uma interface `SqlApiAdapter` (E2), com **mock local** desde E2. **Guarda SQL é higiene, não fronteira de segurança: a fronteira é o usuário de banco read-only** — confirmação do consultor é DoD de E14a e texto de ajuda do W3. **Go/no-go de E0-1 ao fim da semana 2**; plano B: motor em modo degradado a partir de `Customer.ultcom` (sem ciclo; status só `LATE/INACTIVE/BLOCKED`) para destravar E5–E7/E13 com dados reais enquanto a API não chega.

### 2.8 Mapa e GPS no app ⚠️
Pino exige `lat/lng` (geocodificação = F2). **F1 = lista + "Navegar" (Waze/Maps por endereço) + "Abrir rota completa" (Google Maps com waypoints por endereço); mapa in-app na F2.** `expo-location` entra na F1 (leitura única no "Cheguei", tolerante a falha) — já exige build nativo novo.

### 2.9 LLM
`@anthropic-ai/sdk` em `apps/api`; `ANTHROPIC_API_KEY` global; `INTEL_LLM_MODEL` (default `claude-sonnet-5`, decisão do doc); saída JSON via `output_config.format`; `thinking: { type: 'adaptive' }`, `output_config.effort: 'low'|'medium'`; contexto do tenant em `system` com `cache_control` (ttl 1h, sem datas para cachear); **allowlist de fatos** (nunca nome/CNPJ/telefone/endereço/texto livre); mapa de pseudônimos só em memória por requisição; uso (tokens/latência/modelo) registrado por chamada; `INTEL_LLM_DAILY_TOKEN_CAP` por tenant → fallback só-motor. Batches API (50%) quando houver >1 tenant.

### 2.10 Aba Rota
Separada — Hoje · Rota · Clientes · Pedidos · Produtos. Aba Rota oculta e Hoje = `LegacyDashboard` quando `company.intelligenceEnabled=false` (flag vem em `GET /auth/me`).

### 2.11 Fila offline do app
Generalizar `syncEngine` por tipo mantendo AsyncStorage; `expo-sqlite` só se o volume pedir.

### 2.12 Escopo deliberadamente adiado (registrado para não parecer esquecimento)
| Item da spec | Fase | Motivo |
|---|---|---|
| Prompt **Equipe** (1 chamada/gerente no job 03h) | E23 (F3) | W1 na 1-B usa alertas determinísticos; texto do agente só quando houver KPIs materializados |
| Prompt **Onde estou perdendo** | E21 (F2) | junto com W2 |
| Contrato **estoque** ao vivo | E22 (F2) | F1 mostra "confirme disponibilidade" com `Product.saldo` do sync atual |
| Drag-and-drop real de paradas | F2 | F1: ▲▼ + swipe "tirar do dia" (`ReanimatedSwipeable` já usado) |
| Defaults do W5 (wireframe mostra `ativo 120/padrão 90`, `bloqueio 5/padrão 1`) | — | valem os do doc §4.5; wireframe desatualizado |
| Configurações self-service do ADMIN (`/configuracoes`) | E22 | F1: SUPERADMIN configura na aba Inteligência da empresa |
| Sentry na API | **E4** (antecipado) | web e mobile já têm; API não — jobs e LLM precisam de alerta |
| Retenção de dados pessoais do módulo | **E1c/E4** | ver §2.13 |

### 2.13 Retenção e LGPD
`IntelLlmCache.expiresAt` (24h) + expurgo no `nightly` (`PURGE`): cache vencido; `CustomerMessage`/`IntelFeedback.comment`/`Visit.notes` > `intelligenceConfig.retentionDays` (default 365); `Visit.lat/lng` zerados após 90 dias; `EvalCase.snapshot` gravado **já pseudonimizado** e sem texto livre. Logs (`ProtheusLog.metadata`, Sentry) nunca recebem linhas do ERP nem payload de visita/mensagem. Texto do aviso LGPD (aba Inteligência, E10) cita esses prazos.

---

## 3. E0 — Pré-requisitos externos (sem código, semanas 1–2, em paralelo)

| # | Item | Bloqueia | Responsável |
|---|---|---|---|
| 1 | Contrato da API "qualquer SELECT": URL, método, campo do SQL, formato da resposta, paginação/limite, timeout, **usuário read-only dedicado**, mesmo token OAuth? **Go/no-go fim da semana 2** (§2.7) | E2 (adapter real), E3, E4 | Gustavo + consultor Protheus |
| 2 | Empresa piloto: SD2/SF2 ou SC5/SC6; filiais (`Branch.idProtheus`); gerente | E3, E14 | Gustavo |
| 3 | `apiMetaVend`: aceita `ANOMES` anterior e `CODVEND` de outro vendedor? formato numérico de `meta`? | E4 | consultor |
| 4 | `ANTHROPIC_API_KEY` (staging/prod) | E6 | Gustavo |
| 5 | Validar as 7 telas com 2 vendedores (5 min, "o que você faria agora?") | E13 | Gustavo |
| 6 | Confirmar decisões ⚠️ do §2 | E1 | Gustavo |
| 7 | Política "visitado nos últimos N dias" (N=7) e se visita sem pedido zera urgência | E5 | Gustavo |
| 8 | `SKILL.md` do agente Addere (molde da Esteira) + 3 moldes de mensagem | E6 | Gustavo (Claude Code transcreve para prompt) |
| 9 | Decidir 1 dev (9+2 sem) ou 2 devs (6+1 sem) — §7 | cronograma | Gustavo |

---

## 4. O que já existe e é reaproveitado

| Necessidade | Onde já existe | Uso |
|---|---|---|
| HTTP ao Protheus com token, anti-SSRF, retry 401 | `modules/sync/protheus.client.ts` (`protheusPost`, timeout fixo 60 s em `:179-196`), `lib/url-validator.ts` | `sql.client.ts` (E2 adiciona `opts.timeoutMs`) |
| Credenciais | `sync/utils.ts` `getCredentials` | idem |
| Log de chamadas | `sync/protheus-logger.ts` → `ProtheusLog` | `operation: 'intel:<contrato>'`, metadata sanitizado |
| Upsert em massa | `sync/upsert-chunked.ts` (1 upsert/linha em transação de 500 — lento para 13 meses) | só enriquecimento (`CUSTOMERS`/`PRODUCTS`); `SALES` usa replace por janela |
| Conversões | `sync/utils.ts` `toStr/toNum/parseProtheusDate` | contratos |
| Meta | `sync/metas.sync.ts` (`apiMetaVend`, `{CODVEND, ANOMES}`) | `goals.service.ts` |
| Scheduler in-process | `sync/scheduler.ts` + `app.ts:89-91` | fallback §2.5 |
| Auth/tenant/permissões | `middleware/authenticate.ts`, `middleware/require-company.ts` (`assertSameCompany`), `permissions.service.ts` | + `resolveTenant`, `requireAnyPermission`, `requireVendorCode` (novos) |
| Diagnóstico "200 com `{ok:false}`" | `sync.routes.ts:155-250` | prévia/reconciliação |
| Rate limit por rota | `app.ts:44` (`global:false`), `sync.routes.ts:50` (`config.rateLimit`) | + `keyGenerator` por `user.sub` |
| Erros | `lib/errors.ts` | |
| Testes puros | `orders/__tests__/orders.pricing.test.ts`, `sync/__tests__/utils.test.ts`, `lib/__tests__/error-handler.test.ts` (`app.inject`) | motor, guard, placeholders, pseudonimização, self-check, rotas |
| Web: sidebar, auth, http, hooks | `(admin)/layout.tsx` (`NAV_ITEMS`), `contexts/AuthContext.tsx`, `middleware.ts`, `lib/api.ts`, `hooks/useCompany.ts` | |
| Web: abas por empresa, modal JSON, logs paginados, permissões | `empresas/[id]/page.tsx`, `tabs/ProtheusTab.tsx`, `tabs/LogsTab.tsx`, `tabs/shared.tsx`, `PermissionsModal` | |
| Web: KPI card + recharts | `piloto/page.tsx` (`MetricCard`, `LineChart`) | W1 |
| Web: cron com secret (padrão a **não** copiar literalmente: `===` e `Bearer undefined` se env ausente) | `app/api/cron/weekly-report/route.ts:10-12` | §2.5 corrige |
| Mobile: abas + Stack + header | `app/(app)/_layout.tsx`, `clientes/_layout.tsx`, `src/navigation/BrandHeader.tsx` | |
| Mobile: offline de leitura | `src/lib/query-client.ts` + `PersistQueryClientProvider` (`app/_layout.tsx:120-146`) | plano/sinais persistem |
| Mobile: fila offline | `src/store/syncStore.ts`, `src/services/syncEngine.ts` (Sentry grava `lastError` em `:59-69` — não estender a payloads novos), `src/types/sync.ts` | generalizar por tipo |
| Mobile: WhatsApp, status→token, telemetria, ficha, wizard | `clientes/[id].tsx:23-47`, `utils/orderStatus.ts`, `services/pilotTracking.ts`, `clientes/[id].tsx`, `novo-pedido/index.tsx` | |
| Mobile: e2e | `e2e/flows/auth.e2e.ts` e `helpers/auth.ts` esperam `screen-home`; `helpers/navigation.ts` usa `tab-pedidos`; `order-offline-*.e2e.ts` como molde | E12/E13 |
| Cron externo | `.github/workflows/keep-alive.yml` (um único `secrets.API_URL`) | `intel-jobs.yml` com matriz |

---

## 5. Fase 1 — entregas detalhadas

### E1a · Baseline do drift de schema — **S**
**Depende de:** nada (primeiro PR do projeto).
- `packages/db/prisma/migrations/2026MMDD000000_baseline_drift/migration.sql` — `ADD COLUMN IF NOT EXISTS` para `companies.fieldConfig/syncSchedule`, `customers.msblql/transpPadrao/condPagPadrao/tes/xcodemp`, `order_items.largura/espessura/encolhimento/xcrav/tara` (gerado com `--from-empty` e recortado; imitar `20260403000002_fase6_campos`).
- `docs/intelligence/README.md` (seção "Migrations: procedimento, rollback com `prisma migrate resolve --rolled-back`, migration de DROP explícita").
**DoD:** `migrate deploy` ok em Postgres local limpo **e** em `pg_dump --schema-only` de staging restaurado; deploy para staging em janela separada.

### E1b · Schema de ingestão, permissões, flag — **M**
**Depende de:** E1a; só `apiSql`/`syncConfig.sqlApi` dependem de E0-1 (nomes estáveis — pode ir antes).
- `Company` + `apiSql String?`, `intelligenceEnabled Boolean @default(false)`, `intelligenceConfig Json?` (`{ syncHour: 3, syncEveryHours: 4, defaultTone, retentionDays: 365, lgpdNoticeAcceptedAt }`).
- `Customer` + `creditLimit Decimal? @db.Decimal(14,2)`, `segment String?`. `Product` + `productGroup String?`.
- Models: `IntelQuery` (`intel_queries`; `name IntelQueryName` enum `CUSTOMERS|SALES|OPEN_TITLES|PRODUCTS|STOCK`, `sql`, `scope` `ALL|PER_SELLER`, `definition`, `exclusions`, `gotchas`, `version`, `validatedAt/By`, `reconciliation{Period,RefAmount,CalcAmount,DiffPct}`, `published`, `publishedAt`; `@@unique([companyId, name, version])`), `IntelParameter` (`@@unique([companyId, key, segment])`) + `IntelParameterHistory`, `SalesItem` (`intel_sales_items`; **PK composta** `@@id([companyId, orderRef, itemSeq, productCode])` — `itemSeq` = `D2_ITEM`/`C6_ITEM`, default `'00'` quando o contrato não traz; `date @db.Date`, `customerCode`, `loja`, `vendorCode`, `quantity Decimal(12,3)`, `amount Decimal(14,2)`, `productGroup`, `syncedAt`; índices `[companyId, customerCode, loja, date]`, `[companyId, vendorCode, date]`), `OpenTitle` (`@@id([companyId, titleRef])`), `GoalSnapshot` (append-only), `IntelJobRun` (`job IntelJob` enum `NIGHTLY|REFRESH|SYNC|GOALS|ENGINE|PLAN|PURGE|EVAL`, `startedAt`, `finishedAt?`, `status`, `error?`, `metadata?`, `lockedUntil?`).
- Permissões `intel.admin`/`intel.manager`: `seed.ts` + migration de dados + `users.service.ts` aplica `DEFAULT_PERMISSIONS_BY_ROLE` em `createUser`.
- `packages/types/src/intelligence.ts` (parte 1: enums, `IntelQueryDto`, `QueryPreviewResult`, `ReconciliationResult`, `HealthReport`, `IntelParameterDto`, `DEFAULT_INTEL_PARAMETERS`, `IntelligenceConfig`).
**Testes/DoD:** `prisma validate`; migration delta; type-check; seed idempotente.

### E1c · Schema do motor/app, colunas do vendedor, `/auth/me` — **M**
**Depende de:** E1b.
- `User` + `visitsPerDay Int?`, `vehicle Vehicle?`, `servedCities String[] @default([])`, `messageTone String?`; **`@@unique([companyId, idVendProt])`** (Postgres aceita múltiplos NULL); Zod de `users`/`companies` valida `idVendProt` e `Branch.idProtheus` com `^[A-Za-z0-9 ]{1,20}$` (são interpolados em SQL — §E2); 409 na UI.
- Models: `CustomerSignal` (`@@id([companyId, customerCode, loja])`, campos do doc §4.1), `VisitPlan` (`@@unique([companyId, vendorCode, date, kind])`), `VisitPlanItem` (+ `signalsSnapshot Json` para offline), `CustomerMessage`, `IntelFeedback`, `Visit` (**`@@unique([companyId, clientId])`**, `vendorCode`, `planItemId?`, `arrivedAt`, `leftAt?`, `lat/lng/accuracyM?`, `result?`, `noOrderReason?`, `orderId?`, `notes?`, `createdOfflineAt?`), `IntelLlmCache` (`@@unique([companyId, kind, vendorCode, targetKey])`, `payload Json`, `expiresAt`, `inputTokens`, `outputTokens`, `cacheReadTokens`, `model`, `latencyMs`), `EvalCase`.
- `PilotEventType` + `PLAN_OPENED|VISIT_CHECKIN|VISIT_RESULT|MESSAGE_SENT|PLAN_EDITED` + zod em `pilot.routes.ts:14-21`.
- API `GET /auth/me` (`auth.routes.ts:131-136`) passa a devolver `companyId`, `permissions`, `company: { intelligenceEnabled, defaultTone }`; `UserPublic` em `packages/types` idem. Mobile `auth.store` persiste (usado por E12).
- `packages/types/src/intelligence.ts` (parte 2: `VisitPlanDto`, `VisitPlanItemDto` com `signals`, `BriefingDto`, `CustomerMessageDto`, `VisitInput`, `FeedbackInput`, `CustomerSignalListItem`, `TeamReportDto`).
**DoD:** idem E1b; `auth.e2e` mobile continua verde.

---

### E2 · Guarda de SQL, placeholders, catálogo de contratos, cliente SQL + mock — **M**
**Depende de:** E1b. Adapter real depende de E0-1; mock não.
**Arquivos** (`apps/api/src/modules/intelligence/protheus-sql/`)
- `contracts.ts` — catálogo declarativo por contrato: colunas obrigatórias/opcionais, escopo, **frequência** (diária/4h/semanal), janela, SQL de referência (SD2/SF2, SC5/SC6 com `D2_ITEM`/`C6_ITEM`, SE1, SA1, SB1), texto de ajuda (incl. "a fronteira de segurança é o usuário read-only").
- `sql-guard.ts` — puro, após normalizar (strip de comentários, espaços, caixa): primeiro token `SELECT`; proibidos `;`, `--`, `/*`, `WITH` (CTE não permitido na F1 ⚠️), `INTO`, `EXEC|EXECUTE|sp_executesql`, `xp_`, `sp_`, `OPENROWSET|OPENQUERY|OPENDATASOURCE`, `WAITFOR`, `BULK`, `FOR XML|JSON`, DDL/DML, `UNION` fora de SELECT aninhado? (permitir `UNION ALL` entre SELECTs — decidir nos testes), acesso a `sys.`/`master.`/`INFORMATION_SCHEMA`; placeholders só os conhecidos e coerentes com o escopo; impõe `TOP`/`maxRows` quando a API não pagina.
- `placeholders.ts` — puro: valida cada valor com `^[A-Za-z0-9 ]{1,20}$` antes de quotar e escapa `'`→`''`; `{{FILIAL}}` (filiais ativas com `idProtheus`), `{{DATA_INI}}/{{DATA_FIM}}/{{HOJE}}` (`YYYYMMDD` em `America/Sao_Paulo`), `{{VENDEDOR}}`, `{{PRODUTO}}`.
- `sql-api.adapter.ts` — interface `SqlApiAdapter { run(companyId, sql, opts): Promise<Row[]> }`; `ProtheusSqlAdapter` (monta body por `syncConfig.sqlApi`, `protheusPost` com `opts.timeoutMs` — **adicionar parâmetro opcional em `protheus.client.ts`**; 30 s prévia / 120 s sync; paginação se `pageable`; `logProtheusCall` com metadata sanitizado) e `MockSqlAdapter` (lê fixtures JSON em `apps/api/scripts/mock-protheus-sql/` — gerador sintético de 13 meses para ~40 clientes); seleção por `INTEL_SQL_ADAPTER=protheus|mock`.
- `contract-validator.ts` — puro: colunas vs contrato, fan-out (linhas vs `COUNT DISTINCT pedido`), chaves duplicadas (`orderRef+itemSeq+productCode`), tipos básicos.
- `companies.schema.ts` / `companies.service.ts` / `ProtheusConfigForm.tsx` — `apiSql`.
**Testes:** ≥ 40 casos (`;`, `--`, `/*`, `WITH`, `EXEC`, `xp_`, `OPENROWSET`, `INTO`, `sys.`, caixa mista, unicode, placeholder desconhecido/fora de escopo, `idProtheus` com aspas, FILIAL múltipla, fan-out, duplicidade), `protheusPost` com timeout.

---

### E3 · Rotas admin: consultas, parâmetros, config, jobs/run + helpers de tenant — **M+**
**Depende de:** E1c, E2.
- `apps/api/src/middleware/resolve-tenant.ts` — `resolveTenant(request, reply, source: 'query'|'body')`: `companyId ?? request.user.companyId`; SUPERADMIN sem `companyId` → 400; `assertSameCompany`; retorna `Company` ou `null` se já respondeu. `authenticate.ts` + `requireAnyPermission(...keys)` (bypass SUPERADMIN). `lib/rate-limit.ts` + `userRateLimit(max, window)` (`keyGenerator: req.user?.sub ?? req.ip`). Testes unitários dos três.
- `intelligence/intelligence.routes.ts` + `app.ts` (`/intel`).
- `admin/queries.routes.ts|service.ts|schema.ts` — `GET /intel/admin/queries` (estado dos 5 contratos + chip derivado **`meta (API)`** de `apiMetaVend` + último `GoalSnapshot`), `PUT /:name` (rascunho, nova versão, guard bloqueia), `POST /:name/preview` (7 dias; checks: guard, colunas, placeholders, **`previewMs ≤ 10 000`**, fan-out; ≤ 50 linhas; **200 com `ok:false`**; `userRateLimit(6,'1 minute')`), `POST /:name/reconcile` (`{period, refAmount}`; diff; causas prováveis por heurística; `userRateLimit(2,'1 minute')`), `POST /:name/publish` (só com checks ok e `|diff| ≤ reconciliation_tolerance_pct`).
- `admin/parameters.routes.ts` — `GET` (`requireAnyPermission('intel.admin','intel.manager')`), `PUT` (`intel.admin`, grava history), `GET /history`.
- `admin/config.routes.ts` — `GET/PUT /intel/admin/config` (`intelligenceEnabled`, `intelligenceConfig`; `intel.admin`).
- `admin/jobs.routes.ts` — `POST /intel/admin/jobs/run` (`{job: 'nightly'|'refresh'}`; `intel.admin` + `resolveTenant`; `userRateLimit(3,'1 minute')`; respeita lock; 202) e `GET /intel/admin/jobs/status`.
- `apps/api/src/test-utils/prisma-mock.ts` (primeiro `vi.mock('@addere/db')` do repo) + testes `app.inject` incluindo "ADMIN da empresa A pede `companyId` da B → 403".

---

### E4 · Sync dos contratos, metas, jobs, Saúde, observabilidade, expurgo — **L**
**Depende de:** E2, E3.
- `intelligence/sync/contract-sync.service.ts` — por contrato publicado e vencido pela frequência: `SALES` (carga inicial 13 meses em janelas mensais e incremental `hoje−7` com **replace por janela**: `deleteMany` + `createMany({skipDuplicates})` em transação por janela); `OPEN_TITLES` (replace total por tenant em transação); `CUSTOMERS`/`PRODUCTS` (enriquecimento via `upsertChunked`). `ProtheusLog` + `IntelJobRun`.
- `intelligence/sync/goals.service.ts` — `GoalSnapshot` para cada `User` ativo com `idVendProt` (mês atual + anterior).
- `intelligence/jobs/registry.ts` (mapa `IntelJob → handler`; `ENGINE`/`PLAN` registrados como `notImplemented` até E5/E6 registrarem em `engine/engine.job.ts` e `agent/plan-summary.job.ts`), `jobs/run-job.ts` (lock, Sentry, 202+background), `jobs/nightly.ts`, `jobs/refresh.ts`, `jobs/purge.ts` (§2.13), `jobs/jobs.routes.ts` (`POST /intel/jobs/:job` com secret timing-safe + rate limit; `GET /intel/jobs/status` atrás do mesmo secret), `jobs/scheduler.ts` (fallback; `onReady`).
- `.github/workflows/intel-jobs.yml` — `0 6 * * *` (nightly) e `0 */4 * * *` (refresh), `workflow_dispatch`, matriz `{prod, staging}`.
- `admin/health.routes.ts|service.ts` — `GET /intel/admin/health` (`requireAnyPermission`): % saudável, frescor por job, próximo sync, clientes sem cidade/bairro, vendas sem vendedor, vendas com cliente inexistente, últimas execuções (7 d), "corrigir no Protheus" (códigos), **uso de LLM do mês** (de `IntelLlmCache`); `GET /intel/admin/health/export.csv` (`intel.admin`).
- Observabilidade: `@sentry/node` na API (`SENTRY_DSN` opcional; `render.yaml`), captura em `run-job.ts`; `INTEL_CRON_SECRET`.
- `apps/api/scripts/intel-smoke.ts` + `npm run intel:smoke -w @addere/api` (docker-compose + `INTEL_SQL_ADAPTER=mock` + `nightly`) — passo manual documentado.
**Testes:** particionamento em janelas (puro), parse de meta (puro), lock (mock), health (puro), secret timing-safe.

---

### E5 · Motor de sinais v1 e plano do dia — **L**
**Depende de:** E1c; testável sem E4 (fixtures).
**Arquivos** (`intelligence/engine/`, tudo puro exceto `engine.service.ts`/`engine.job.ts`)
- `parameters.ts` — `DEFAULT_INTEL_PARAMETERS` (doc §4.5 + `visited_cooldown_days 7`, `reconciliation_tolerance_pct 2`) + merge com `IntelParameter` (global/segmento).
- `signals.ts` — ciclo (mediana), dias sem compra, status (BLOCKED sobrepõe: título vencido > `blocked_days`, `creditLimit` estourado, `msblql='1'`), confiança, ticket, tendência, mix habitual/cortado, `purchaseProb`, `reasons` em PT.
- `degraded.ts` — modo degradado (§2.7) a partir de `Customer.ultcom` quando não há `SalesItem`.
- `goal.ts`, `ranking.ts` (Source → Hydrator → Filter → Scorer → Selector; diversidade; agrupamento cidade/bairro; `setGrouping` para "qual cidade hoje?"), `business-days.ts` (BRT; feriados = backlog).
- `engine.service.ts` — carrega dados → grava `CustomerSignal`, `VisitPlan`/`VisitPlanItem` (`signalsSnapshot` por item; não sobrescreve plano `EDITED` do dia) ; `engine.job.ts` registra `ENGINE`/`PLAN` no registry.
**Testes:** golden tests (mediana, limites 1,3×/2×/90 d/120 d, confiança, mix, tendência, gap/por dia, filtro, diversidade, agrupamento, determinismo, modo degradado).

---

### E6 · Agente LLM v1 (Hoje, Antes de entrar, Mensagem) + eval — **L**
**Depende de:** E5; E0 itens 4 e 8.
- `@anthropic-ai/sdk`; env `ANTHROPIC_API_KEY?`, `INTEL_LLM_MODEL`, `INTEL_LLM_ENABLED`, `INTEL_LLM_DAILY_TOKEN_CAP`.
- `agent/client.ts` — `new Anthropic()`; `complete({system, user, schema, effort})` com `output_config.format`, `thinking adaptive`, `max_tokens` ~2k, timeout 60 s, 1 retry; erros tipados → fallback; grava `usage` em `IntelLlmCache`.
- `agent/facts.ts` — **builder com allowlist** (pseudônimo, status, ciclo, dias, ticket, tendência, mix por código/descrição de produto, títulos valor/dias, cidade); teste que serializa o payload e falha se houver chave/valor fora da allowlist (nome, CNPJ, telefone, endereço, CEP, e-mail, texto livre).
- `agent/pseudonymizer.ts` (mapa só em memória por requisição), `agent/tenant-context.ts` (`DADOS.md` estável; `cache_control` 1h), `prompts/today.ts|briefing.ts|message.ts`, `agent/self-check.ts` (regras do doc §5.2; 2 falhas → só-motor), `agent/agent.service.ts` (cache 4h por `(companyId, kind, vendorCode, targetKey)`; cap diário), `agent/plan-summary.job.ts` (registra no `PLAN`).
- `eval/eval.service.ts` + `npm run intel:eval` + `POST /intel/admin/eval/run`; `scripts/intel-freeze-eval.ts` gera snapshots **pseudonimizados**.
- `docs/intelligence/AGENT_SKILL.md` (fonte dos prompts; `promptVersion` = hash).
**Testes:** pseudonymizer, facts allowlist, self-check (≥ 20 casos), montagem de prompt (snapshot), fallback com `INTEL_LLM_ENABLED=false`, cap diário.

---

### E7 · Rotas do app — **M+**
**Depende de:** E5, E6.
- `middleware/require-vendor-code.ts` — preHandler após `authenticate`+`requireCompany`: busca `idVendProt` (JWT não carrega; `JwtPayload` = `sub/email/role/companyId`), 422 se nulo, 403 se `intelligenceEnabled=false`; anexa `request.vendorCode`. **Toda leitura/escrita filtra por `{companyId, vendorCode}`** (padrão de posse de `orders.service.ts:82,89,125,144`).
- `GET /intel/app/home`, `GET /intel/app/plan?date=&kind=day` (itens com `signals`, bloqueados ao fim, `llmSummary`, frescor, meta, carteira ativa), `PATCH /intel/app/plans/:id/items` (`ops: reorder|remove|restore|skip|setGrouping`, idempotente por `opId`; 403 se `plan.vendorCode ≠ request.vendorCode`), `GET /intel/app/customers/signals?status=` (lista compacta — "Quem está esfriando?" e, na F2, Carteira), `GET /intel/app/customers/:code/:loja/briefing` (cache 4h; `userRateLimit(20,'1 minute')`), `POST /intel/app/messages` + `POST /messages/:id/sent` (posse), `POST /intel/app/visits` (upsert por `(companyId, clientId)`; se existir com outro `vendorCode` → 409; `orderId` validado via `orders.service` pertencer ao `user.sub`), `PATCH /intel/app/visits/:clientId`, `POST /intel/app/feedback` (`targetId` validado por tipo e posse).
**Testes:** Zod; `applyPlanOps` puro; `app.inject` com casos "vendedor B usa `clientId`/`planId` de A" e "empresa desligada".

---

### E8 · Rotas do gerente (W1 sem mapa) — **M** (1-B)
**Depende de:** E5 (o model `Visit` existe desde E1c).
- `GET /intel/manager/team?date=&range=` (`intel.manager` + `resolveTenant`): KPIs (previstas, realizadas/aderência, positivação da visita, positivação da carteira do mês), card por vendedor, alertas determinísticos (sem plano, < 3 visitas, dados > 24 h, sugerido 3× sem compra = F3).
- `POST /intel/manager/plan-items` (`vendorCode` ∈ `User` da empresa, `customerCode/loja` ∈ `Customer` da empresa; `origin=MANAGER`).
- `GET /intel/manager/pilot-metrics?from=&to=` — as 3 métricas de sucesso do doc (positivação da carteira, conversão sugestão→pedido 7 d vs fora do plano, recuperação de `AT_RISK`), calculadas de `VisitPlanItem/Visit/SalesItem/CustomerSignal` (snapshot semanal; vira script em E14a se E8 ficar para 1-B).
**Testes:** KPIs puros sobre fixtures.

---

### E9 · Painel: multi-papel, tenant ativo, menu Inteligência, tokens de status — **M**
**Depende de:** E1c (`/auth/me` com permissões/flag).
- `contexts/AuthContext.tsx` — `permissions`, `hasPermission`, `companyId`, `intelligenceEnabled`.
- `login/page.tsx` — aceita `SUPERADMIN`, `ADMIN`, quem tem `intel.*`; redireciona para `/` que decide a home (SUPERADMIN → `/dashboard`; demais → `/inteligencia`). `middleware.ts:16-18` redireciona para `/` (não `/dashboard`). `(admin)/dashboard/page.tsx` e `(admin)/layout.tsx` com gate/redirect para não-SUPERADMIN. `/inteligencia/page.tsx` = home neutra com atalhos (evita 404 entre E9 e E10).
- `contexts/CompanyContext.tsx` — tenant ativo (JWT ou seletor do SUPERADMIN no topo da sidebar, `localStorage`); hooks de Inteligência enviam `companyId` só quando SUPERADMIN.
- `(admin)/layout.tsx` — `NAV_ITEMS` → grupos (`Operação`, `Inteligência`, `Empresa`); `requires: 'superadmin'|'admin'|{permission}`; esconder Empresas/Piloto/Tipos de usuário de não-SUPERADMIN.
- `tailwind.config.ts` + `lib/brand-tokens.ts` — `status.{onCycle,late,atRisk,blocked,new}`; `components/ui/StatusPill.tsx`, `Textarea.tsx`, `Tabs.tsx`, `Switch.tsx`, `FreshnessBadge.tsx`.
- `hooks/useIntel*.ts` esqueleto (`intelKeys`).
**Testes:** `lib/__tests__/nav-gating.test.ts`, `home-redirect.test.ts` (puros).

---

### E10 · Painel: W3 Consultas, W4 Saúde, W5 Premissas, aba Inteligência, campos do vendedor — **L**
**Depende de:** E3, E4, E9.
- `/inteligencia/consultas/[name]` — 6 chips (5 contratos + `meta (API)` leitura), 3 abas (SQL / O que significa / Validar e publicar), `Textarea` mono, prévia (modal: checagens incl. tempo < 10 s e fan-out, tabela ≤ 50 linhas, stats), reconciliação (input R$ oficial, diff, causas), "Salvar rascunho" / "Publicar vN" (desabilitado até tudo verde), versão/validado por, ajuda do contrato com aviso "usuário read-only".
- `/inteligencia/saude` — % saudável, frescor por job + próximo, completude (3 cards), histórico 7 d, "corrigir no Protheus" + CSV (`intel.admin`), **uso de LLM do mês**, "Rodar sync agora" (`intel.admin`; mostra status 202/lock).
- `/inteligencia/premissas` — 3 blocos; valor vs padrão (defaults do doc §4.5); **edição** para `intel.admin` (pode ficar leitura na 1-A se faltar tempo): `late_factor`, `risk_factor/risk_days`, `active_days`, `visits_per_day`, pesos (soma 100); histórico; linha "Por vendedor" (de `User.visitsPerDay/vehicle`); por segmento (leitura).
- `empresas/[id]/tabs/IntelligenceTab.tsx` — ligar/desligar, `apiSql`, `syncHour`, `syncEveryHours`, tom, `retentionDays`, aviso LGPD (prazos do §2.13).
- `EntityModals.tsx` (UserModal) + `users.schema.ts`/`users.service.ts` — `visitsPerDay`, `vehicle`, `servedCities`, `messageTone`; 409 para `idVendProt` duplicado.
**Testes:** helpers puros (diff %, soma de pesos, formatação de frescor).

---

### E11 · Painel: W1 Equipe em campo (sem mapa) + Visão geral — **M** (1-B)
**Depende de:** E8, E9.
- `/inteligencia/equipe` — cabeçalho (data, n em rota, frescor), toggle Hoje/Semana/Mês, 4 KPIs (`MetricCard` do piloto → `components/ui/KpiCard.tsx`), cards por vendedor, alertas com "Concordo" (dispensar; "Fixar" = F3), placeholder do mapa ("fase 2"), link "Onde estou perdendo ↗" desabilitado.
- `(admin)/dashboard/page.tsx` (Visão geral) — 2 cards (positivação da carteira do mês, saúde %) com links, ocultos se `intelligenceEnabled=false`.
- `useTeamReport`, `usePilotMetrics`.

---

### E12 · Mobile: fundação (tokens, abas, flag, fila por tipo, GPS, links, hooks, e2e) — **L**
**Depende de:** E1c (tipos e `/auth/me`). Paralelo ao backend.
- `src/theme/colors.ts` — `colors.status.*`; `Badge` variant `status`; `src/utils/customerStatus.ts`.
- `src/hooks/useIntelEnabled.ts` (do `auth.store`); `app/(app)/_layout.tsx` — `index` = Hoje (`Sun`) ou `LegacyDashboard` (mantém `testID="screen-home"`), aba `rota` (`Map`) **oculta** (`href: null`) quando desligado; ordem Hoje · Rota · Clientes · Pedidos · Produtos; `tabBarBadge` ciano com plano novo; testIDs `tab-hoje`, `tab-rota` (+ manter `screen-home`; `e2e/helpers/navigation.ts` só usa `tab-pedidos` — sem mudança; `flows/auth.e2e.ts`/`helpers/auth.ts` continuam achando `screen-home`).
- `app/(app)/rota/_layout.tsx` + `rota/index.tsx`, `rota/visita/[itemId].tsx`, `rota/mensagem/[customerKey].tsx` (esqueletos), `rota/semana.tsx`/`carteira.tsx` (F2).
- `src/types/sync.ts` — tipos `order|visit|visitResult|feedback|planPatch|messageSent`; `src/services/syncHandlers.ts` (endpoint/validador/invalidações por tipo; idempotência por `clientId`/`opId`); `syncEngine.ts` despacha por tipo e **não** envia payload/`lastError` de tipos novos ao Sentry; testes atualizados.
- `src/hooks/useIntel.ts` — `useHome`, `usePlan(date)` (pré-busca `useBriefing` dos itens ≤ 8, cache 4h), `useCustomerSignals(status)`, `useBriefing`, `useMessage`, `useVisitMutation`, `useFeedback`, `usePlanPatch` (otimista + fila).
- `src/components/intel/SyncPill.tsx` / `FreshnessFooter.tsx` (obrigatórios em toda tela com número calculado; vermelho se > 24 h).
- `src/services/navigationLinks.ts` (`openWaze`, `openMaps`, `openRouteInMaps(addresses[])`, `openWhatsApp(phone, text)`) + testes de URL.
- `app.config.js` + `expo-location` (when-in-use, textos PT); `src/services/location.ts` (timeout 5 s, nunca bloqueia).
- `pilotTracking.ts` — eventos novos (enum estendido em E1c).
- `novo-pedido/index.tsx` — `useLocalSearchParams({customerId, items, visitClientId})`; não resetar no focus com params; ao concluir, `visitResult=ORDER` na fila.
- `e2e/README.md` — testIDs novos.
**DoD:** build de desenvolvimento com `expo-location` (`npx expo run:ios`) e **build EAS interno** gerado (TestFlight interno) — para o dry-run não esperar; Jest verde; Detox `auth`/`order-online` verdes.

---

### E13 · Mobile: telas Hoje, Plano do dia, Visita, Ficha, Mensagem — **L+** (6 dias)
**Depende de:** E7, E12 (pode começar contra mock `msw` dos contratos de `packages/types`; merge após E7).
- Hoje — saudação/data/agrupamento/`SyncPill`; card do plano (visitas, km "—", esperado "se nada mudar", n atrasados, frase do agente ou fallback determinístico, Ver plano / Abrir rota); meta (barra, faltam/por dia, cobertura); 2 cards pequenos; 3 atalhos ("Quem está esfriando?" → `clientes?status=LATE,AT_RISK` com `StatusPill`; Semana/Carteira "em breve"); ≤ 3 cards acima da dobra; `LegacyDashboard` se desligado.
- Plano do dia — toggle Lista/Mapa (Mapa "em breve"); pergunta única "qual cidade hoje?" se `servedCities.length > 1` (`setGrouping`); card por parada (nº navy, nome, status pill, porquê, oferta + "confirme disponibilidade" (`Product.saldo`), confiança em texto, **Navegar** / Ficha / Mensagem / Cheguei); bloqueados ao fim sem "Cheguei"; ▲▼ + swipe "tirar do dia" → `PATCH`; "Abrir rota completa"; `FreshnessFooter`; offline do cache.
- Visita — "Antes de entrar" do `signalsSnapshot` (sempre) + texto do briefing se em cache; mix sugerido → "Iniciar pedido com esse mix"; resultado (4 botões + motivo); Navegar / Mensagem / Ligar / Concluir; check-in grava `Visit` (fila) ao abrir; rodapé.
- Ficha (`clientes/[id].tsx`) — bloco "Antes de entrar" no topo + `SyncPill`; respeita `useFieldVisible`.
- Mensagem — 3 moldes, texto, ajustes, WhatsApp (`sentAt` via fila) / Copiar; fallback sem LLM; rodapé.
- `FeedbackPrompt` reaproveitado (👍/👎 do plano 1×/dia).
**DoD:** fluxo completo no simulador com backend local + mock; testes `applyPlanOps`/`navigationLinks`; Detox `flows/plan-visit.e2e.ts` (online) **e** `flows/visit-offline.e2e.ts` (Android; molde `order-offline-sync.e2e.ts`).

---

### E14a · Piloto: onboarding, eval, métricas, docs — **M**
**Depende de:** E1–E7, E9, E10, E12, E13.
- Onboarding do tenant: `apiSql`, contratos publicados com reconciliação ok, **usuário read-only confirmado pelo consultor**, parâmetros, gerente com `intel.manager`, vendedores com `idVendProt` único/`visitsPerDay`/cidades; primeiro `nightly` completo; Saúde ≥ 90%.
- `EvalCase`: 20 casos (`intel-freeze-eval.ts`, pseudonimizados) + `intel:eval` verde.
- `scripts/intel-pilot-metrics.ts` (ou `GET /intel/manager/pilot-metrics` se E8 já existir) + `docs/PILOT_PLAN.md` com as 3 métricas e como lê-las no fim do dry-run.
- `docs/intelligence/README.md` (arquitetura, jobs, mock, smoke, rollback, retenção), `CLAUDE.md`, `apps/mobile/docs/DEPLOY_CHECKLIST.md` (localização, testIDs).

### E14b · Build e dry-run — sem código novo (hotfixes)
- Build EAS (iOS TestFlight + Android) aprovado **antes** da semana do dry-run; 1 semana com 2 vendedores; coleta de feedback; hotfixes.

---

## 6. Fases 2 e 3

### Fase 2 — rota e diagnóstico
| E | Entrega | Notas |
|---|---|---|
| E15 | Geocodificação | `GeoAddress`; job `GEO`; provedor ⚠️ (Nominatim/OSM vs Google); precisão; status na Saúde. |
| E16 | Ordem por distância | `engine/routing.ts` (vizinho-mais-próximo, Haversine, puro); `distFromPrevM`, `etaMin`, `plannedTime` por veículo; `CustomerWindow`. |
| E17 | Mapa no app | `react-native-maps` ⚠️ ou `expo-maps`; pino navy numerado + anel (SVG); drag-and-drop real; build nativo. |
| E18 | Semana | `VisitPlan kind=WEEK`; `rota/semana.tsx`; prompt Semana; mover entre dias. |
| E19 | Carteira + RFM + cross-sell | quintis (≥ 30 clientes); `rota/carteira.tsx` (reusa `customers/signals`); prompt Carteira; CTA "só atrasados". |
| E20 | W1 com mapa da equipe | MapLibre + OSM (CSP `next.config.mjs`). |
| E21 | W2 Onde estou perdendo | `engine/decomposition.ts` (puro); lista; produtos em queda; "Pôr no plano"; **prompt `losses`** + self-check. |
| E22 | Estoque ao vivo + config self-service | `GET /intel/app/stock/:productCode` (contrato `STOCK`, fallback `Product.saldo`); `/configuracoes` e `/vendedores` do ADMIN. |

### Fase 3 — fechar o ciclo
| E | Entrega | Notas |
|---|---|---|
| E23 | KPIs materializados + **prompt Equipe** | `SellerDailyKpi`, `SellerMonthlyKpi`; job `KPI`; 1 chamada/gerente no `nightly`. |
| E24 | Histórico de sugestões + penalidade | `SuggestionHistory`; `fixar`/`pausar 30 d`. |
| E25 | W6 Sugestões & feedback | conversão 7 d vs fora do plano; 👍/👎; comentários com ação; "Rodar regressão". |
| E26 | Calibração de `purchaseProb` | por conversão real; por tenant. |
| E27 | Pergunta livre | `POST /intel/app/ask` (cache; só fatos do motor). |

---

## 7. Cronograma

Capacidade: 5 dias-dev/semana por dev. Tamanhos: E1a S(1) · E1b M(3) · E1c M(3) · E2 M(3) · E3 M+(4) · E4 L(5) · E5 L(5) · E6 L(5) · E7 M+(4) · E8 M(3) · E9 M(3) · E10 L(5) · E11 M(3) · E12 L(5) · E13 L+(6) · E14a M(3) ≈ **61 dias-dev** (1-A = 55, 1-B = 6).

### 7.1 Um dev (sequência única de PRs)
| Sem. | PRs | Marco |
|---|---|---|
| 1 | E1a, E1b, E1c (início) · E0 em paralelo | schema de ingestão mergeado |
| 2 | E1c, E2 (com mock) | **go/no-go E0-1** |
| 3 | E3 · E9 | rotas admin + painel multi-papel |
| 4 | E4 | sync rodando com mock (ou real) |
| 5 | E10 (W3, W4) | **onboarding do piloto começa** (consultas publicadas) |
| 6 | E5 · E10 (W5, aba, vendedor) | primeiro plano gerado |
| 7 | E6 · E7 (início) | texto do agente; eval 10 casos |
| 8 | E7 · E12 | build EAS interno |
| 9 | E13 | fluxo completo no simulador |
| 10 | E13 (fim) · E14a | TestFlight aprovado; eval 20 |
| 11 | **E14b dry-run** (hotfixes) · E8 | — |
| 12 | E11 | 1-B concluída |

### 7.2 Dois devs (A = backend · B = web+mobile)
| Sem. | Dev A | Dev B | Marco |
|---|---|---|---|
| 1 | E1a, E1b, E1c | E9 (contra `/auth/me` de E1c em branch) · E12 (tokens, abas, fila) | |
| 2 | E2 (mock) · E3 | E12 (GPS, links, hooks) · E10 (W3 contra mock de API) | go/no-go E0-1 |
| 3 | E4 | E10 (W4, W5, aba) | onboarding começa |
| 4 | E5 | E13 (Hoje, Plano) contra `msw` · build EAS interno | primeiro plano |
| 5 | E6 · E7 | E13 (Visita, Ficha, Mensagem) | agente no app |
| 6 | E14a · E8 | E13 (e2e) · E14a (docs mobile) | TestFlight aprovado |
| 7 | **dry-run** · hotfixes | E11 | 1-A + 1-B |

Regras de paralelismo: E12/E13 não tocam arquivos de E9/E10 (apps distintos); E9 e E10 tocam `layout.tsx`/`hooks` — sequenciais; E5/E6 só adicionam `*.job.ts` (não editam `registry.ts`).

---

## 8. Riscos técnicos específicos encontrados no código

| Risco | Evidência | Mitigação no plano |
|---|---|---|
| Drift de schema impede `migrate deploy` em banco limpo | colunas sem migration (`fieldConfig`, `syncSchedule`, `msblql`…) | E1a baseline + teste contra dump de staging |
| Migration quebra deploy (Render roda `migrate deploy` no build) | `render.yaml:9,32` | E1a/E1b testados em dump; rollback documentado; deploy em janela separada |
| `Decimal(10,2)` não comporta agregados | `Order.total`, `Product.price` | `Decimal(14,2)` |
| `idVendProt` não único: dois usuários veem o mesmo plano | `schema.prisma:127` | `@@unique([companyId, idVendProt])` + 409 na UI |
| Upsert por linha lento para 13 meses | `upsert-chunked.ts:11-36` | replace por janela (`deleteMany`+`createMany`) |
| `protheusPost` com timeout fixo 60 s | `protheus.client.ts:179-196` | `opts.timeoutMs` (E2) |
| Render 1 instância web, sem worker; timers morrem no restart; `curl` síncrono estoura | `render.yaml`, `scheduler.ts` | lock em `IntelJobRun` + 202/background + GitHub cron (jitter/60 dias) + fallback interno |
| Secret de cron com `===` e `Bearer undefined` | `weekly-report/route.ts:10-12` | `min(32)` obrigatório + `timingSafeEqual` + rate limit |
| JWT não carrega `idVendProt`; cada rota do app precisa de lookup | `packages/types/src/index.ts:9-14`, `authenticate.ts:14-17` | `requireVendorCode` |
| Posse: `orders` filtra `userId+companyId` em toda query; replicar no módulo | `orders.service.ts:82,89,125,144` | `{companyId, vendorCode}` em todo handler; `Visit` único por tenant; testes "B usa id de A" |
| Placeholders vêm de strings livres (`idProtheus`, `idVendProt`) | `companies.schema.ts:7,14,23,42` | regex + escape + validação no cadastro |
| Guarda SQL nunca é suficiente | — | usuário read-only como DoD; lista de tokens proibidos; `maxRows` |
| `Order.protheusOrderId` unique global | `schema.prisma` | `SalesItem` não referencia `Order` |
| Painel só aceita SUPERADMIN; `middleware.ts` manda para `/dashboard` (SUPERADMIN-only) | `login/page.tsx:36`, `middleware.ts:16-18`, `companies.routes.ts:54` | E9: login multi-papel, `/` decide home, `/inteligencia` neutra |
| Config Protheus é `PATCH /companies/:id/protheus` (SUPERADMIN) | `companies.routes.ts:90` | F1: SUPERADMIN na aba; F2: E22 |
| Seed não roda em produção; default por papel só no backfill | `render.yaml`, `seed.ts:66-96`, `users.service.ts:52-53` | data migration + default em `createUser` |
| Testes da API nunca mockaram Prisma | `grep vi.mock` vazio | `test-utils/prisma-mock.ts` em E3; motor/guards puros |
| e2e Detox depende de `screen-home` | `e2e/flows/auth.e2e.ts:11,26`, `helpers/auth.ts:50` | manter `screen-home` no `LegacyDashboard`/Hoje |
| Telemetria nova exige enum + zod + `Pilot ACTIVE` | `schema.prisma:30-37`, `pilot.routes.ts:14-21,66-72` | E1c |
| Timezone UTC no Render vs dia civil BRT | — | `@db.Date` calculado em `America/Sao_Paulo`; `syncHour` em BRT |
| LLM alucina/indisponível/caro | — | allowlist + self-check + fallback + cap diário + uso registrado |
| Mobile: hex/fontes fora do tema quebram lint; Sentry grava `lastError` | `eslint.config.mjs`, `syncEngine.ts:59-69` | tokens `colors.status`; não logar payloads novos |
| `expo-location` exige build nativo | `app.config.js` | E12 gera build EAS interno cedo |
| Sem observabilidade na API | `apps/api/package.json` sem Sentry | `@sentry/node` em E4 |

---

## 9. Checklist de qualidade por PR

- [ ] Lint / type-check / testes verdes (CI)
- [ ] Migration delta (não `--from-empty`), aplicada em Postgres local limpo **e** em dump de staging; rollback anotado
- [ ] Env novas em `env.ts`, `.env.example` (api e raiz), `render.yaml`
- [ ] Permissões novas: `seed.ts` + data migration + default em `createUser`
- [ ] Tipos em `packages/types/src/intelligence.ts`
- [ ] Nenhum hex/fonte fora do tema; Lucide; componentes `ui/`
- [ ] Rotas `/intel/*`: guard correto (`intel.admin` / `intel.manager` / `requireAnyPermission` / `[authenticate, requireCompany, requireVendorCode]`), `resolveTenant` quando aceitar `companyId`, posse por `{companyId, vendorCode}` em leitura e escrita, rate limit por usuário em rotas caras
- [ ] Nenhum dado de cliente em log/Sentry/erro HTTP; LLM só recebe fatos da allowlist; testes de isolamento "B usa id de A"
- [ ] testIDs no `e2e/README.md`
- [ ] `CLAUDE.md` / `docs/intelligence/README.md` atualizados
- [ ] Commit em português; PR para `staging`

---

## 10. Glossário doc → código

| Doc (PT) | Código (EN) | Tabela |
|---|---|---|
| `cfg_consulta` | `IntelQuery` | `intel_queries` |
| `cfg_premissa` / `_hist` | `IntelParameter` / `IntelParameterHistory` | `intel_parameters` / `intel_parameter_history` |
| `cfg_vendedor` | colunas em `User` | `users` |
| `cfg_janela_cliente` (F2) | `CustomerWindow` | `intel_customer_windows` |
| `crm_cliente` | `Customer` (+ `creditLimit`, `segment`) | `customers` |
| `crm_produto` | `Product` (+ `productGroup`) | `products` |
| `crm_venda_item` | `SalesItem` (PK `companyId, orderRef, itemSeq, productCode`) | `intel_sales_items` |
| `crm_titulo` | `OpenTitle` | `intel_open_titles` |
| `crm_meta_hist` | `GoalSnapshot` | `intel_goal_snapshots` |
| `sync_execucao` | `ProtheusLog` (`intel:*`) + `IntelJobRun` | `protheus_logs`, `intel_job_runs` |
| `crm_sinal_cliente` | `CustomerSignal` | `intel_customer_signals` |
| `crm_plano` / `crm_plano_item` | `VisitPlan` / `VisitPlanItem` (+ `signalsSnapshot`) | `intel_visit_plans` / `intel_visit_plan_items` |
| `crm_mensagem` | `CustomerMessage` | `intel_customer_messages` |
| `crm_feedback` | `IntelFeedback` | `intel_feedbacks` |
| `crm_visita` | `Visit` (`@@unique([companyId, clientId])`) | `intel_visits` |
| cache do agente (novo) | `IntelLlmCache` (+ uso de tokens, `expiresAt`) | `intel_llm_cache` |
| `geo_endereco` (F2) | `GeoAddress` | `intel_geo_addresses` |
| `kpi_diario_vendedor` / `kpi_mensal_vendedor` (F3) | `SellerDailyKpi` / `SellerMonthlyKpi` | `intel_seller_daily_kpis` / `intel_seller_monthly_kpis` |
| `crm_sugestao_historico` (F3) | `SuggestionHistory` | `intel_suggestion_history` |
| `eval_caso` | `EvalCase` | `intel_eval_cases` |
| status `novo/no_ciclo/atrasado/risco/inativo/bloqueado` | `NEW/ON_CYCLE/LATE/AT_RISK/INACTIVE/BLOCKED` | enum `CustomerStatus` |
| `cliente_cod` / `cliente_loja` / `vendedor_cod` | `customerCode` / `loja` / `vendorCode` (= `Customer.protheusCode`/`loja`, `User.idVendProt`) | — |
| `/admin/*` `/gerente/*` `/app/*` | `/intel/admin/*` `/intel/manager/*` `/intel/app/*` `/intel/jobs/*` | — |
| jobs `sync:tenant` `motor:recalcular` `plano:gerar` `geo:*` `kpi:*` `eval:*` | `NIGHTLY`, `REFRESH` (compostos) → `SYNC` `GOALS` `ENGINE` `PLAN` `PURGE` `GEO` `KPI` `EVAL` | enum `IntelJob` |
| W1–W6 | `/inteligencia/equipe`, `/perdas`, `/consultas`, `/saude`, `/premissas`, `/sugestoes` | — |
| Telas do app 1–7 | `(app)/index` (Hoje), `(app)/rota/index`, `(app)/rota/visita/[itemId]`, `(app)/clientes/[id]`, `(app)/rota/mensagem/[customerKey]`, `(app)/rota/semana`, `(app)/rota/carteira` | — |

---

## 11. Próximos passos imediatos

1. Confirmar as decisões ⚠️ do §2 e escolher 1 ou 2 devs (§7).
2. Fechar E0-1 (API SELECT + usuário read-only) e E0-2 (empresa piloto); go/no-go na semana 2.
3. Abrir `feat/intel-e1a-baseline-drift` e executar E1a (independente de tudo).
4. Em paralelo: E9 (painel multi-papel) e E12 (fundação mobile) — não dependem do Protheus.
