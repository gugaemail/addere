# Plano 011: Atendimento à distância — registrar contato por telefone ou WhatsApp

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 198ffb2..HEAD -- packages/db/prisma/schema.prisma packages/types/src/intelligence.ts apps/api/src/modules/intelligence/app/visits.routes.ts apps/api/src/modules/intelligence/app/visits.service.ts apps/api/src/modules/intelligence/manager apps/mobile/app/\(app\)/rota apps/mobile/src/utils/visitHistory.ts apps/mobile/src/hooks/useIntel.ts apps/web/src/app/\(admin\)/inteligencia/equipe/page.tsx`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA.

## Status

- **Prioridade**: P2
- **Esforço**: M
- **Risco**: MED — mexe na regra de deduplicação de visita do dia (plano 006)
  e em todo lugar que lê `intel_visits`
- **Depende de**: nenhum
- **Categoria**: funcionalidade nova
- **Planejado em**: commit `198ffb2`, 2026-10-08
- **Toca o app**: sim, **só JavaScript** — sai por OTA (`eas update`), sem
  build de loja. Segue a regra da série: **nenhum executor publica OTA**
- **Tem migration**: sim (um valor de enum e uma coluna nova, sem backfill)

## Por que isso importa

O plano do dia junta clientes por cidade e completa as vagas com o resto da
carteira, sem olhar distância (`engine/ranking.ts`, `rankCustomers`). Num caso
real do piloto (08/10/2026), um vendedor de São Paulo recebeu no mesmo dia
clientes da Grande SP, da região de Uberlândia, do oeste do Paraná e do Rio
Grande do Sul. Esses clientes distantes são atendidos por telefone ou WhatsApp
— e hoje o app só sabe registrar visita presencial ("Cheguei", com GPS).

O vendedor que liga para o cliente e fecha um pedido não tem como dizer isso ao
Addere: ou finge um "Cheguei" (GPS mentiroso, duração sem sentido), ou deixa o
cliente sem registro — e aí a aderência cai, o cliente volta a ser sugerido no
dia seguinte, e o gerente não vê o trabalho que foi feito.

**Decisão de produto (Gustavo, 08/10/2026):** o cliente **continua no plano de
visitas** — não se cria marcação de "cliente remoto" nem se tira ninguém do
plano, e o raio de distância no ranking **não** será corrigido agora. O que se
acrescenta é **a opção** de registrar o atendimento como feito à distância.

## Estado atual

- `packages/db/prisma/schema.prisma`
  - `enum VisitSource` (~826): `CHECKIN` (vendedor tocou em "Cheguei") e
    `ORDER` (visita inferida do pedido, plano 006).
  - `model Visit` (~949, tabela `intel_visits`): `arrivedAt`, `leftAt`,
    `lat`/`lng`/`accuracyM` (GPS só no check-in), `result VisitResult?`,
    `source VisitSource @default(CHECKIN)`, `noOrderReason`, `orderId`.
  - `enum VisitResult`: `ORDER`, `NO_ORDER`, `NOT_FOUND`, `RESCHEDULED`.
- `packages/types/src/intelligence.ts`: `VisitSource = 'CHECKIN' | 'ORDER'`
  (~226); `source?` no payload de check-in (~392) e `source` no item de
  histórico (~406).
- `apps/api/src/modules/intelligence/app/visits.routes.ts`
  - `visitSchema` (~18-36): `source: z.enum(['CHECKIN', 'ORDER']).default('CHECKIN')`.
  - `POST /intel/app/visits` deduplica por dia civil (~160-215): se já existe
    visita do mesmo cliente no dia, atualiza a existente. Regra de adoção
    (~193): existente `ORDER` + chegando `CHECKIN` → a existente adota o
    `clientId` e o GPS do check-in e vira `CHECKIN`. No sentido contrário nada
    muda, porque o check-in explícito pode ter um PATCH pendente com o
    `clientId` dele.
- Leitores de `intel_visits` (todos contam a visita sem olhar `source`):
  - `manager/manager.service.ts` `loadVisits` (~115): aderência e `done`.
  - `manager/team-map.ts` (~58): `visitedItems` pelo `planItemId`;
    `lastCheckIn` (~77) já filtra visitas **com GPS** — a remota fica de fora
    sozinha.
  - `manager/conversion.service.ts`, `manager/no-order.service.ts`.
  - `engine/engine.service.ts` (~261): cooldown — cliente com visita nos
    últimos `visited_cooldown_days` não é sugerido de novo.
  - `app/visits.service.ts` (~109): histórico (app e painel) repassa `source`.
- Exibição da origem da visita:
  - `apps/mobile/src/utils/visitHistory.ts` (~112) e
    `apps/web/src/app/(admin)/inteligencia/equipe/page.tsx` (~120):
    `source === 'ORDER'` → "registrada pelo pedido".
- App, tela Rota (`apps/mobile/app/(app)/rota/index.tsx`):
  - `checkIn` (~182): pega GPS (5 s, nunca bloqueia), enfileira
    `visits.checkIn`, rastreia `VISIT_CHECKIN` e abre
    `/rota/visita/[itemId]` com o `clientId`.
  - Card da parada: ações Navegar, Ficha, Mensagem e "Cheguei" (que vira
    "Visitado" via `visitedItemIds`). Linha de ações com `flexWrap: 'wrap'`
    (~781).
- App, tela da visita (`apps/mobile/app/(app)/rota/visita/[itemId].tsx`):
  - aberta sem `clientId` faz o check-in ali mesmo, com GPS (~91-110);
  - resultado em 4 botões (~33-38): Pedido, Sem pedido (motivo obrigatório),
    Não estava, Reagendou; "Concluir" faz `visits.setResult` (PATCH).
  - já tem os atalhos Ligar (`tel:`, ~226) e Mensagem (WhatsApp).
- Rastreamento do piloto: `PilotEventType` tem `VISIT_CHECKIN` e
  `VISIT_RESULT`, com `metadata` livre.

## Decisões de desenho

1. **Nova origem `REMOTE`** em `VisitSource`, mais uma coluna
   `channel ContactChannel?` (`PHONE` | `WHATSAPP`). O canal fica `null` em
   `CHECKIN` e `ORDER`. Sem tabela nova: o atendimento à distância **é** uma
   visita, só sem presença.
2. **Sem GPS.** A API grava `lat`/`lng`/`accuracyM` como `null` em `REMOTE`,
   mesmo que o app mande — a localização do vendedor no sofá não diz nada sobre
   o cliente.
3. **Conta como atendido**, com a origem à mostra:
   - **aderência e `done`** contam o atendimento remoto (o cliente foi
     trabalhado);
   - **cooldown do motor** também — senão o cliente reaparece amanhã;
   - **conversão e motivos de não venda** contam normalmente;
   - **mapa da equipe**: a parada aparece como feita, mas o "último check-in"
     continua só presencial (já é assim, porque filtra GPS).
4. **Resultados**: os mesmos 4 do `VisitResult`. Na tela remota, `NOT_FOUND`
   tem o rótulo **"Não atendeu"** em vez de "Não estava". Sem enum novo.
5. **Deduplicação do dia — prioridade `CHECKIN` > `REMOTE` > `ORDER`.** A
   existente adota o `clientId` (e o GPS, se vier) da que chega só quando a que
   chega tem prioridade maior. Isso estende a regra do 006 sem mudar os casos
   que ele já cobre:
   - existente `ORDER`, chega `REMOTE` → vira `REMOTE` e adota o `clientId`
     (o PATCH do resultado remoto vai usar esse id);
   - existente `REMOTE`, chega `CHECKIN` (ligou de manhã, foi à tarde) → vira
     `CHECKIN` com o GPS;
   - existente `REMOTE`, chega `ORDER` → a existente fica como está e ganha o
     `orderId` (igual ao `CHECKIN` de hoje);
   - existente `CHECKIN`, chega `REMOTE` → fica `CHECKIN`.
6. **Onde aparece no app**: só no card da parada do plano do dia e no cartão
   do mapa, como ação **"À distância"** ao lado de "Cheguei". Atendimento
   remoto fora do plano (pela Ficha do cliente) fica fora desta versão.
7. **Canal**: escolhido na tela, em dois botões ("Telefone" e "WhatsApp"). Os
   atalhos Ligar e Mensagem da tela já pré-selecionam o canal correspondente.
8. **Piloto**: sem `PilotEventType` novo (evita outra migration de enum) —
   `VISIT_CHECKIN` com `metadata: { remote: true, channel }`.
9. **App antigo continua funcionando**: quem não atualizou manda `CHECKIN` ou
   `ORDER`, e o default do schema é `CHECKIN`.

## Quem acessa

- **Registrar**: o vendedor dono do plano, pela rota `/intel/app/visits`, que
  já é estritamente do dono do token (`requireVendorCode`). Nada muda aqui.
- **Ver**: o gerente, nas telas que já mostram visitas (Equipe em campo,
  histórico da equipe), dentro do escopo que ele já tem (`resolveViewerScope`).

## Escopo

**Dentro**: migration; tipos; API (schema, deduplicação, testes); exibição da
origem no histórico do app e do painel; ação "À distância" e modo remoto da
tela da visita.

**Fora**: marcar o cliente como "remoto" no cadastro; tirar clientes do plano;
raio de distância no ranking; atendimento remoto fora do plano; detectar se o
WhatsApp está instalado (exige build); relatório novo de canal no painel.

## Fluxo de git

Branch `feat/atendimento-a-distancia` a partir de `origin/staging`, PR para
`staging`. Migration em commit separado, no fim, como no 009.

## Passos

### Passo 1: Tipos compartilhados

Em `packages/types/src/intelligence.ts`:
- `VisitSource = 'CHECKIN' | 'ORDER' | 'REMOTE'`;
- `export type ContactChannel = 'PHONE' | 'WHATSAPP'`;
- `channel?: ContactChannel | null` no payload de check-in;
- `channel: ContactChannel | null` no item de histórico.

Verificação: `npm run type-check` acusa só os pontos que os passos seguintes
vão tratar (não silencie com `as`).

### Passo 2: Schema Prisma (sem gerar a migration ainda)

Em `schema.prisma`:
- `REMOTE` em `enum VisitSource`, com o comentário
  `// atendimento à distância: telefone ou WhatsApp, sem GPS (plano 011)`;
- `enum ContactChannel { PHONE WHATSAPP }`;
- em `model Visit`: `channel ContactChannel? // só em source=REMOTE`.

Verificação: `npx prisma validate` e `npx prisma generate` em `packages/db`.

### Passo 3: API

Em `visits.routes.ts`:
- `source: z.enum(['CHECKIN', 'ORDER', 'REMOTE']).default('CHECKIN')`;
- `channel: z.enum(['PHONE', 'WHATSAPP']).nullish()` no `visitSchema` **e** no
  `patchSchema` (o canal é escolhido na tela e chega no PATCH de conclusão);
- `REMOTE` → `lat`, `lng` e `accuracyM` gravados `null`; `channel` só é
  gravado em `REMOTE` (nos outros, `null`);
- trocar o `adopting` (~193) por uma função pura
  `sourceRank(source)` (`CHECKIN` 3, `REMOTE` 2, `ORDER` 1): adota quando
  `sourceRank(body.source) > sourceRank(sameDay.source)`. Ao adotar,
  `clientId`, `source`, `channel` e GPS vêm da que chega (GPS `null` se a que
  chega é `REMOTE`).

Em `visits.service.ts`: incluir `channel` no item de histórico.

Testes (em `app/__tests__/app-routes.test.ts`, onde estão os do `POST /visits`
do plano 006, mesmo padrão de mock):
1. `REMOTE` com lat/lng no corpo grava lat/lng `null` e grava o `channel`;
2. `CHECKIN` com `channel` no corpo grava `channel` `null`;
3. existente `ORDER` + chega `REMOTE` → adota `clientId`, vira `REMOTE`;
4. existente `REMOTE` + chega `CHECKIN` → vira `CHECKIN` com o GPS;
5. existente `REMOTE` + chega `ORDER` → continua `REMOTE`, ganha o `orderId`;
6. existente `CHECKIN` + chega `REMOTE` → continua `CHECKIN`;
7. PATCH com `channel` em visita `REMOTE` grava o canal; em `CHECKIN`, ignora;
8. os testes do plano 006 continuam passando **sem alteração**.

Verificação: `npm test -w @addere/api`. Mutação deliberada: inverter a
comparação em `sourceRank` tem que derrubar pelo menos os testes 3 e 4.
Restaure.

### Passo 4: Exibição da origem (app e painel)

`apps/mobile/src/utils/visitHistory.ts` e `equipe/page.tsx`, na função que
monta a linha da visita:
- `REMOTE` + `PHONE` → `"08:12 · por telefone"`;
- `REMOTE` + `WHATSAPP` → `"08:12 · por WhatsApp"`;
- `REMOTE` sem canal → `"08:12 · à distância"`;
- nunca mostrar duração em `REMOTE` (não houve permanência no cliente).

Testes das duas funções (`apps/mobile/src/utils/__tests__/visitHistory.test.ts` já existe; no painel, o
padrão de teste de helper puro). Se a função do painel não for exportável sem
mexer na página, extraia para `apps/web/src/lib/` — e mais nada.

### Passo 5: App — ação "À distância" e modo remoto da tela da visita

Em `rota/index.tsx`:
- nova ação **"À distância"** (ícone Lucide `PhoneCall`, 1,5 px, tokens do
  tema — nenhuma cor fixa) ao lado de "Cheguei", no card e no cartão do mapa;
- ao tocar: **não** pede GPS; enfileira `visits.checkIn` com
  `source: 'REMOTE'`, `lat/lng: null`, `channel: null`; rastreia
  `VISIT_CHECKIN` com `metadata: { remote: true }`; abre
  `/rota/visita/[itemId]` com `clientId` e `mode: 'remote'`;
- o item entra em `visitedItemIds` como já acontece no "Cheguei" — o card mostra
  **"Atendido"** em vez de "Visitado" quando foi remoto (guarde o modo junto do
  id no estado local).

Em `rota/visita/[itemId].tsx`, quando `mode === 'remote'`:
- título "Atendimento à distância";
- **não** faz o check-in automático com GPS do efeito (~91): se abriu sem
  `clientId`, faz o check-in `REMOTE`;
- dois botões de canal, "Telefone" e "WhatsApp" (o canal vai no PATCH de
  conclusão, junto do resultado); tocar em Ligar pré-seleciona Telefone, em
  Mensagem pré-seleciona WhatsApp;
- resultado: "Não estava" vira **"Não atendeu"**; o resto igual.

Verificação: `npx jest` em `apps/mobile`; teste do helper que monta o payload
remoto (sem GPS, `source: 'REMOTE'`). **Conferir o card numa largura de 375 pt**
(iPhone SE/mini): com cinco ações a linha quebra (`flexWrap`); se "Cheguei"
cair sozinho na segunda linha, separado de "À distância", ajuste a ordem para
os dois ficarem juntos — e pare aí, sem redesenhar o card.

### Passo 6: Migration (por último)

Gerar o SQL sem banco, como manda o `CLAUDE.md`
(`prisma migrate diff ... --script`), em
`packages/db/prisma/migrations/<timestamp>_visit_remote_channel/migration.sql`.
Esperado, e nada além disso:

```sql
ALTER TYPE "VisitSource" ADD VALUE 'REMOTE';
CREATE TYPE "ContactChannel" AS ENUM ('PHONE', 'WHATSAPP');
ALTER TABLE "intel_visits" ADD COLUMN "channel" "ContactChannel";
```

Validar num banco local descartável, como no 009: as migrations do zero
reproduzem o schema sem diferença (`migrate diff --from-migrations`).

## Critérios de conclusão

- Tipos, lint e todos os testes (API, web e mobile) passando.
- Os 7 testes novos do passo 3 e a mutação deliberada pegando.
- Migration com exatamente as três instruções acima, validada.
- Nenhum arquivo fora do escopo alterado; nenhuma cor fixa; só ícones Lucide.
- Linha do 011 atualizada no `plans/README.md`.

## Condições de PARADA

- A checagem de deriva mostra mudança na deduplicação do `POST /visits` ou em
  `VisitSource`.
- Algum teste do plano 006 precisa ser alterado para passar.
- O `migrate diff` gera qualquer instrução além das três esperadas.
- Algum leitor de `intel_visits` não listado em "Estado atual" filtra por
  `source` ou por GPS (pode mudar a contagem de um jeito não previsto).
- O card não comporta a ação nova sem redesenho.

## Notas de manutenção

- Se um dia o "raio de distância" voltar à pauta, o `channel` dá o dado para
  decidir: quantos clientes de cada vendedor só são atendidos à distância.
- Um `PilotEventType` próprio (`VISIT_REMOTE`) pode substituir o
  `metadata.remote` se a métrica do piloto precisar separar os dois.
