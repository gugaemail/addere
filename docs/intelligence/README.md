# Camada de Inteligência — notas de engenharia

Documento vivo do módulo de inteligência comercial. Plano de execução completo em
`ADDERE-INTELIGENCIA-PLANO-EXECUCAO.md` (branch `docs/plano-inteligencia` até o merge).

## Arquitetura em uma passada

```
Protheus ──(SQL genérico, só SELECT)──▶ sync dos contratos ──▶ tabelas intel_*
                                                                    │
                                              motor de sinais ◀─────┘
                                                    │
                                    plano do dia ◀──┘──▶ agente (LLM)
                                          │                    │
                              app do vendedor            texto do briefing
                              painel do gerente
```

- **`protheus-sql/`** — a fronteira com o ERP. `sql-guard.ts` recusa qualquer coisa
  que não seja um `SELECT`; `contracts.ts` define o que cada consulta precisa
  devolver (colunas, placeholders, frequência). O cliente é trocável por env:
  `INTEL_SQL_ADAPTER=protheus|mock`.
- **`sync/`** — traz os contratos para `intel_sales_items`, `intel_open_titles`,
  `customers`, `products` e `GoalSnapshot`.
- **`engine/`** — puro. Calcula ciclo, status, score e monta o plano do dia. Não
  chama rede nem LLM: dá para testar tudo com fixture.
- **`agent/`** — o LLM. Pseudonimiza antes de enviar (D4), valida a resposta
  contra os fatos (`self-check.ts`) e cai para texto determinístico quando não
  passa. **Nenhum dado identificável do cliente sai daqui.**
- **`app/`, `manager/`, `admin/`** — as rotas, por público.

### Papéis e escopo

`intel.admin` (Consultas, Premissas, Saúde completa, jobs) e `intel.manager`
(Equipe em campo, Saúde só-leitura, pôr no plano). SUPERADMIN passa em tudo e
escolhe o tenant por `companyId`.

Visibilidade da equipe (D3b, revista em 26/08/2026): o gerente vê só os
vendedores com `managerId = seu id` — no painel (Equipe em campo, métricas do
piloto) e no app (aba Equipe, clientes e pedidos); quem está sem gerente aparece
apenas para `intel.admin`/SUPERADMIN, com o aviso de "vendedores sem gerente".
Gerente que também vende (14/09/2026): com código de vendedor, ele entra no próprio
recorte (`sellerScopeWhere`: equipe dele + ele mesmo) — na Equipe em campo, no mapa, nas
perdas e na meta somada —, pode pôr cliente no próprio plano e não conta como "sem
gerente". No app, a aba Rota volta para ele e a tela Equipe ganha os atalhos do vendedor.
Regra isolada em `manager/manager.service.ts:resolveTeamScope` (painel) e
`users/data-scope.ts` (clientes/pedidos do app) — puras e testadas.

## Fase 2 — rota, semana, carteira e diagnóstico (13/09/2026)

Tudo continua puro em `engine/` e testado com fixture; as rotas só carregam e montam.

| Entrega | Onde | O que faz |
| --- | --- | --- |
| E16 ordem por distância | `engine/routing.ts` | Vizinho-mais-próximo com Haversine e fator de tortuosidade urbana (1,3×). Preenche `distFromPrevM`, `etaMin` e `plannedTime` de cada parada. Janelas de atendimento (`intel_customer_windows`, `PUT /intel/app/customers/:code/:loja/windows`) entram como restrição suave: quem ainda não abriu cede a vez; sem alternativa, a hora prevista espera a janela. Sem coordenada → fim da lista, sem hora. Bloqueados nunca entram na rota. Quando o vendedor reordena, `persistPlanEdit` reanota os números sem mexer na ordem dele. Desliga por premissa (`route_by_distance=false`: mantém a ordem do ranking, só com as horas). |
| E17 arrasto | app | Reordenar por arrasto na lista do Plano do dia; na API é a mesma op `reorder`. |
| E18 semana | `engine.service.ts` | Plano `kind=WEEK` com `date` = segunda-feira e `plannedDate` em cada item: dia 1 = o plano do dia, os seguintes = ranking do que sobrou, um dia por vez. `GET /intel/app/plan?kind=week`; op `moveToDay` (só na semana, dentro dela, de hoje em diante). Plano da semana `EDITED` não é regerado, e as paradas que o vendedor moveu para o dia entram na frente do plano do dia seguinte (`forcedForToday`). Texto do agente no job `PLAN` (prompt `week`). |
| E19 carteira | `engine/rfm.ts` | Quintis R/F/M dentro da carteira do vendedor (só com ≥ 30 clientes que compraram; senão tudo nulo) e segmento (`CHAMPION`…`LOST`). Cross-sell tenant-wide: pares = `segment` do cadastro ou, sem ele, o segmento RFM; produto entra quando ≥ `cross_sell_min_pct`% dos pares o compram e o cliente nunca comprou (grupos < 5 não sugerem). Vai para `CustomerSignal.crossSell`, para o `signalsSnapshot` e para o `suggestedOffer` (`source: 'cross_sell'`, até 2). `GET /intel/app/portfolio` com texto do agente (prompt `portfolio`, cache diário). |
| E20 mapa da equipe | `manager/team-map.ts` | `GET /intel/manager/team-map?date=`: paradas do dia com coordenada por vendedor, `visited` pelo check-in e o último check-in com GPS. Painel: Leaflet + tiles do OpenStreetMap (atribuição obrigatória; para volume alto, trocar o provedor de tiles). |
| E21 onde estou perdendo | `engine/decomposition.ts` | `GET /intel/manager/losses?date=&baselineMonths=&vendorCode=`: período atual (1º do mês → data) contra a média dos N meses fechados anteriores, normalizada pelo tamanho do período. Componentes `STOPPED` / `REDUCED` (queda ≥ 20 %) / `PRODUCT_DROP` / `GAINED`. "Pôr no plano" reaproveita `POST /intel/manager/plan-items`. Texto do agente (prompt `losses`, cache por recorte/dia). |
| E22 estoque ao vivo | `app/stock.routes.ts` | `GET /intel/app/stock/:productCode`: contrato `STOCK` publicado → consulta ao vivo (8 s, cache 10 min, soma das filiais); sem contrato ou com falha → `Product.saldo` marcado `source: 'sync'`. Config self-service (`/configuracoes`, `/vendedores` no painel) usa as rotas existentes de config e usuários — `intel.admin` já nasce com todo ADMIN. |

Premissas novas (`DEFAULT_INTEL_PARAMETERS`): `route_by_distance`, `day_start_hour`,
`visit_minutes`, `avg_speed_kmh` (moto ×1,2; a pé 5 km/h) e `cross_sell_min_pct`.
`User.vehicle` passa a valer no cálculo do deslocamento.

Smoke local da fase 2: `INTEL_SQL_ADAPTER=mock INTEL_GEOCODER=mock npm run intel:smoke`
gera o plano do dia já roteirizado; RFM só aparece com carteira ≥ 30 e o plano da
semana só de segunda a sexta (domingo não há dias úteis restantes).

## Jobs

Scheduler in-process (`jobs/scheduler.ts`), ticker de 1 minuto, lock persistido
em `IntelJobRun` — sobrevive a restart e a uma segunda instância.

| Job       | Quando                                                | O que faz                                                                |
| --------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `nightly` | hora de `intelligenceConfig.syncHour` (padrão 3h BRT) | `SYNC` → `GEO` → `GOALS` → `ENGINE` → `PLAN` → `PURGE`                   |
| `refresh` | a cada `syncEveryHours` (padrão 4h)                   | `SALES` + `OPEN_TITLES` incrementais → `ENGINE` (**não** regera o plano) |

A geocodificação vem **antes** do motor de propósito: o motor copia lat/lng do
cache para os itens do plano, e invertendo a ordem o plano do dia sairia sem
pinos no mapa. Contratos `WEEKLY` (produtos) só entram no nightly de domingo.

Catch-up no boot: o que estiver vencido roda ao subir, o que cobre um restart às
02h59. Isso depende do keep-alive (`keep-alive.yml`, ping a cada 14 min) manter o
Render acordado — sem ele o noturno só roda no próximo acesso.

Disparo manual: **Saúde dos dados → "Sync agora"**, ou
`POST /intel/admin/jobs/run` (`intel.admin`, respeita o lock, responde 202).

## Rodar sem tocar no Protheus

Dois adapters sintéticos cobrem o pipeline inteiro:

```bash
# Pipeline completo (nightly de verdade, dados sintéticos)
INTEL_SQL_ADAPTER=mock INTEL_GEOCODER=mock npm run intel:smoke -w @addere/api

# Prontidão do tenant para o piloto (só lê)
npm run intel:onboarding -w @addere/api -- [--company <id>]

# Regressão do agente — congelar e rodar
npm run intel:freeze-eval -w @addere/api
npm run intel:eval -w @addere/api
```

`INTEL_GEOCODER=mock` é o que você quer em qualquer ambiente que não seja
produção: o Nominatim tem limite de 1 req/s e geocodificar uma carteira inteira
contra ele leva horas.

### Eval do agente

`intel:freeze-eval` congela 20 casos pseudonimizados a partir dos sinais atuais,
**estratificados por status** — pegar os N primeiros dava uma suíte inteira do
status mais numeroso, que não exercitava o prompt. Rode antes de mexer em prompt
ou modelo, e compare o `pass/fail` depois.

Sem `ANTHROPIC_API_KEY` os casos ficam `SKIPPED` — o comando termina limpo, mas
não testou nada. Confira o `skip=` na saída antes de dar por verde.

## Retenção e LGPD (D4, §2.13)

| Dado                           | Prazo                        | Onde              |
| ------------------------------ | ---------------------------- | ----------------- |
| Cache de texto do LLM          | 24 h                         | `IntelLlmCache`   |
| Briefings e mensagens geradas  | `retentionDays` (padrão 365) | `CustomerMessage` |
| Coordenadas de GPS das visitas | 90 dias, depois zeradas      | `Visit.lat/lng`   |

Quem aplica é o job `PURGE`, dentro do `nightly`. O prazo de retenção é editável
por empresa na aba Inteligência.

Pseudonimização: o `agent/pseudonymizer.ts` troca nome e código do cliente por um
apelido estável **antes** de montar o prompt, e o texto é reidratado com o nome
real só na resposta. Vale também para os casos de eval — o snapshot congelado
não referencia o cliente.

## Desligar em caso de problema

A camada inteira sai do ar por tenant, sem deploy: **empresa → aba Inteligência →
desligar**. Isso para o scheduler (`listEnabledCompanies` filtra por
`intelligenceEnabled`), tira as telas do vendedor e devolve 403 nas rotas
`/intel/app/*`. Os dados já sincronizados ficam onde estão.

Para desligar só o LLM e manter motor e plano, remova a `ANTHROPIC_API_KEY` do
ambiente: o agente cai para o texto determinístico do motor.

## Migrations — procedimento

O banco (Neon) não é acessível localmente. Fluxo para criar uma migration:

1. Subir o Postgres local (`docker compose up -d db`, ou o postgresql@17 do Homebrew).
2. Gerar o **delta** (nunca usar `--from-empty` para deltas — ele gera o schema inteiro):

   ```bash
   cd packages/db
   DATABASE_URL=postgresql://<user>@localhost:5432/<db_teste> \
     npx prisma migrate dev --create-only --name <descricao_snake>
   ```

   Alternativa sem `migrate dev`:

   ```bash
   npx prisma migrate diff \
     --from-migrations ./prisma/migrations \
     --to-schema-datamodel ./prisma/schema.prisma \
     --shadow-database-url postgresql://<user>@localhost:5432/<db_sombra> \
     --script > prisma/migrations/<timestamp>_<descricao>/migration.sql
   ```

3. Validar antes do PR (checklist do plano, §9):
   - banco limpo → `migrate deploy` → `migrate diff --from-url <banco> --to-schema-datamodel` retorna vazio;
   - banco simulando produção (colunas já existentes) → `migrate deploy` aplica sem erro.
4. Nunca editar migration já aplicada em staging/produção.

### Colunas que podem já existir em produção

Produção/staging receberam colunas via `prisma db push` no passado (drift). A migration
`20260820000000_baseline_drift` regularizou esse histórico com `IF NOT EXISTS` em tudo —
é o modelo a imitar quando uma coluna nova _pode_ já existir no ambiente
(ver também `20260403000002_fase6_campos`).

## Migrations — rollback

`prisma migrate deploy` roda no build do Render (`render.yaml`) e no `deploy-api.yml`.
Se uma migration falhar em produção:

1. O deploy para — a API continua na versão anterior (o build falhou antes do start).
2. Corrigir exige **nova** migration (roll forward) ou marcar a falha como revertida:

   ```bash
   npx prisma migrate resolve --rolled-back <nome_da_migration>
   ```

   e então publicar a versão corrigida com outro nome.

3. Para desfazer uma migration já aplicada, escrever migration inversa explícita
   (`DROP COLUMN`/`DROP INDEX` etc.) — nunca apagar a pasta da migration original.
4. Migrations de risco (baseline, enum, uniques em tabela populada) sobem para staging
   em janela separada dos demais PRs.

## Histórico

- **E1a (20/08/2026)** — `20260820000000_baseline_drift`: 12 colunas (`companies.fieldConfig/syncSchedule`,
  `customers.msblql/transpPadrao/condPagPadrao/tes/xcodemp`, `order_items.largura/espessura/tara/encolhimento/xcrav`)
  e 6 índices/uniques (`cond_pags`/`transportadoras` unique por empresa+código, índices de
  `customers`/`products`/`orders`) que existiam no schema e em produção mas não nas migrations.
  Drift levantado com `migrate diff` contra banco só-de-migrations; testes: banco limpo sem
  drift residual, reaplicação idempotente (NOTICE ... skipping).
- **Fase 2 (13/09/2026)** — `20260914014147_intel_phase2_windows_week`: enum `WindowSource`, tabela
  `intel_customer_windows` (janela de atendimento por cliente e dia da semana, unique por
  empresa+cliente+loja+dia) e coluna `intel_visit_plan_items.plannedDate` (dia da parada no plano
  da semana; nula no plano do dia). Só adiciona — sem rollback de dados. Gerada com
  `migrate dev --create-only` contra Postgres local e aplicada no smoke.
