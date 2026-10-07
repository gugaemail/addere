# Plano 006: Fazer o pedido valer como check-in

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat b7be724..HEAD -- apps/api/src/modules/intelligence/app/visits.routes.ts apps/mobile/app/\(app\)/novo-pedido/index.tsx packages/db/prisma/schema.prisma`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA.

## Status

- **Prioridade**: P1
- **Esforço**: M
- **Risco**: MED
- **Depende de**: nenhum
- **Categoria**: bug
- **Planejado em**: commit `6a440c8`, 2026-10-06
- **Revisado em**: 2026-10-07 — a fase 1 (planos 007, 001 e 002) foi mergeada na
  `main` (`b7be724`). Consequência para quem executa este plano: `sellerScopeWhere`,
  `TeamScope`, `resolveTeamScope` e `resolveDataScope` **não existem mais**. Foram
  substituídos pelo resolvedor único — `resolveViewerScope`, `sellerWhere`,
  `customerWhere` e `orderOwnerIds`, todos em
  `apps/api/src/modules/users/data-scope.ts`. Importe de lá e **não crie outro
  resolvedor**: o plano 007 existiu justamente para acabar com os dois que havia.
  Os trechos de "Estado atual" abaixo já refletem esse estado. Refaça a checagem
  de deriva contra `b7be724`.
- **Atenção**: é o **único** plano desta série com migration.

## Por que isso importa

**Regra de produto decidida**: fazer um pedido para um cliente equivale a ter
clicado em "Cheguei" naquele cliente. O sistema assume o atendimento, sem
perguntar nada ao vendedor.

Hoje não é assim, e o buraco é grande. Pedido criado sem check-in prévio — pela
aba Clientes, pela aba Pedidos, pelo botão de novo pedido — **não gera visita
nenhuma**. Consequências medidas no código, todas erradas:

1. **O cooldown não dispara.** O motor filtra por `Visit.arrivedAt` nos últimos
   `visited_cooldown_days` (7). Sem visita, o cliente continua elegível e volta
   ao plano do dia seguinte — tendo comprado hoje.
2. **A aderência conta o dia como não feito.** No painel, `planned` × `done`: o
   vendedor vendeu e aparece como quem não trabalhou.
3. **A positivação da visita ignora a venda**, porque não existe visita para
   receber o desfecho.
4. O motor só percebe a compra depois que o pedido vai ao Protheus e volta como
   `SalesItem` no sync noturno — o engine lê **apenas** `SalesItem`, nunca a
   tabela `Order` do próprio app.

Ou seja: o cliente só sai do topo por "comprou recentemente", com o atraso da
ida e volta pelo ERP, em vez de sair por "foi atendido" já na próxima madrugada.

## Estado atual

- `apps/mobile/app/(app)/novo-pedido/index.tsx:673-679` — o único lugar que liga
  pedido a visita, e **só** quando o formulário foi aberto de dentro da tela de
  visita (que exige o "Cheguei" antes):

```ts
// Pedido nascido de uma visita (E12): registra o resultado ORDER na fila
if (visitParams.visitClientId) {
  useSyncStore.getState().enqueue('visitResult', {
    clientId: visitParams.visitClientId,
    result: 'ORDER',
    leftAt: new Date().toISOString(),
  })
}
```

  Sem check-in não existe `visitClientId`, o `if` é falso e nada acontece.

- `apps/mobile/app/(app)/rota/index.tsx:169-187` — como um check-in de verdade é
  montado. É o formato que você vai reaproveitar:

```ts
const checkIn = useCallback(
  async (item: VisitPlanItemDto) => {
    const clientId = generateUuid()
    const position = await getVisitPosition()
    visits.checkIn({
      clientId,
      planItemId: item.id,
      customerCode: item.customerCode,
      loja: item.loja,
      arrivedAt: new Date().toISOString(),
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
      accuracyM: position?.accuracyM ?? null,
    })
```

- `apps/mobile/src/services/syncHandlers.ts:103-111` — a fila offline já tem o
  tipo `visit`, que faz `POST /intel/app/visits` e é **idempotente por
  `clientId`** no servidor. Você não precisa criar tipo de fila novo.

- `apps/api/src/modules/intelligence/app/visits.routes.ts:63` — o `POST /visits`.
  O schema de entrada já aceita `result`, `orderId` e `planItemId`; o `orderId`
  passa por `assertOwnOrder`, que confirma que o pedido é do próprio usuário.

- `apps/api/src/modules/intelligence/app/visits.routes.ts:37-44` — a promoção do
  plano no primeiro check-in, que a visita implícita também deve disparar:

```ts
// Primeiro check-in do dia: o plano deixa de ser GENERATED. O motor só
// recria planos GENERATED — sem esta promoção, um "Rodar sync agora" no meio
// do dia apagava o plano em andamento (ids novos, visitas com planItemId
// órfão, "Visitado" e pinos do mapa perdidos).
async function markPlanInProgress(planId: string | null): Promise<void> {
```

- `packages/db/prisma/schema.prisma:925-950` — modelo `Visit`, com
  `@@unique([companyId, clientId])` e `@@index([companyId, vendorCode, arrivedAt])`.

- `apps/api/src/modules/intelligence/engine/engine.service.ts:225` e `:259` — o
  cooldown que este plano passa a alimentar:

```ts
const cooldownStart = new Date(now.getTime() - globalParams.visited_cooldown_days * 86_400_000)
// ...
prisma.visit.findMany({
  where: { companyId, arrivedAt: { gte: cooldownStart } },
  select: { customerCode: true, loja: true },
}),
```

## Duas decisões de desenho que este plano toma

**1. A visita implícita não captura GPS, e não tem duração.** O pedido pode ser
criado depois de sair do cliente — no carro, em casa, à noite. Coordenada errada
é pior que coordenada ausente, e uma duração calculada sobre o horário do pedido
seria ficção. Então `lat`, `lng`, `accuracyM` e `leftAt` ficam **nulos**, e
`arrivedAt` é o instante da criação do pedido, com a ressalva de que ele marca
*quando o pedido foi feito*, não *quando o vendedor chegou*.

**2. A origem fica registrada, com um campo novo.** Tratar as duas como
equivalentes é a regra de negócio, mas não saber qual foi qual torna impossível
explicar por que certas visitas não têm duração nem mapa. Daí o campo `source`,
com default `CHECKIN` — a migration não muda nada do que já existe.

## Quem acessa

Nada muda de permissão: a visita implícita nasce das mesmas rotas `/intel/app`,
sob `requireVendorCode`, e pertence ao vendedor que fez o pedido.

| Perfil | Efeito |
|---|---|
| Vendedor | Passa a ter o atendimento registrado sem precisar lembrar do "Cheguei". O cliente sai do plano de amanhã. |
| Gerente | A aderência da equipe passa a contar quem vendeu sem check-in — hoje esses dias aparecem como não trabalhados. |
| Administrador | O mesmo, na empresa inteira. |

## Comandos que você vai precisar

| Para quê | Comando | Esperado quando dá certo |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Gerar o client | `npm run db:generate` | exit 0 (não precisa de banco) |
| Checar tipos | `npm run type-check` | exit 0, sem erros |
| Lint | `npm run lint` | exit 0 |
| Testes da API | `npm test --workspace=apps/api` | todos passam |
| Testes do mobile | `npm run test:unit --workspace=apps/mobile` | todos passam |

## Escopo

**Dentro do escopo:**
- `packages/db/prisma/schema.prisma` (enum `VisitSource` + campo `Visit.source`)
- `packages/db/prisma/migrations/20261007120000_visit_source/migration.sql` (criar à mão — ver passo 1)
- `packages/types/src/intelligence.ts` (`VisitInput.source`)
- `apps/api/src/modules/intelligence/app/visits.routes.ts` (aceitar `source`, deduplicar no dia)
- `apps/api/src/modules/intelligence/app/__tests__/app-routes.test.ts` (casos novos)
- `apps/mobile/app/(app)/novo-pedido/index.tsx` (criar a visita implícita)
- `apps/mobile/src/types/sync.ts` e `apps/mobile/src/services/syncHandlers.ts` (só se o validador do payload precisar do campo novo)

**Fora do escopo (NÃO toque):**
- `apps/api/src/modules/orders/**` — a visita é criada pelo app, não pelo
  servidor de pedidos. O app é quem sabe se veio de um check-in, quem tem a
  fila offline e quem tem o plano do dia em mãos. Criar a visita no backend de
  pedidos acoplaria o núcleo do app à camada de Inteligência.
- `apps/api/src/modules/intelligence/engine/**` — o motor não muda. Ele já lê
  `Visit`; passa a encontrar mais linhas, e isso basta.
- `apps/mobile/app/(app)/rota/index.tsx` — o "Cheguei" explícito continua
  exatamente como está.

## Fluxo de git

- Branch: `advisor/006-pedido-vale-check-in`
- Um commit por passo. Estilo: `db: origem da visita`, `api: visita única por dia`,
  `mobile: pedido registra a visita`.
- NÃO faça push nem abra PR a menos que quem despachou tenha mandado.
- **NÃO publique build do app** (`eas build`, `eas update`, loja). Este plano
  toca `apps/mobile`, e a decisão de entrega de 06/10/2026 é **um build só, no
  fim de todos os planos** — veja "Estratégia de entrega" em `plans/README.md`.
  Termine no código e pare.

## Passos

### Passo 1: Campo de origem

Em `packages/db/prisma/schema.prisma`, junto dos outros enums da Inteligência:

```prisma
enum VisitSource {
  CHECKIN // vendedor tocou em "Cheguei"
  ORDER   // inferida: o pedido vale como check-in (plano 006)
}
```

E no modelo `Visit`, depois de `result`:

```prisma
source VisitSource @default(CHECKIN)
```

O default existente preserva todas as linhas atuais.

> ⚠️ **NÃO rode `npm run db:migrate`, `prisma migrate dev` ou `prisma migrate reset`.
> NÃO copie nenhum arquivo `.env` para o worktree. NÃO conecte em banco nenhum.**
> O `DATABASE_URL` deste projeto aponta para um banco **real** (Neon): `migrate dev`
> aplicaria a mudança lá e, diante de qualquer drift, chega a propor **resetar o
> banco**. A migration vai ser aplicada depois, por `migrate deploy`, no pipeline
> de deploy, sob controle de quem opera.

Em vez disso, **escreva a migration à mão**, no formato das existentes. Crie
`packages/db/prisma/migrations/20261007120000_visit_source/migration.sql` com
exatamente este conteúdo:

```sql
-- O pedido passa a valer como check-in (plano 006): a visita implícita nasce do
-- pedido, sem GPS e sem duração. A origem fica registrada para que a ausência
-- desses dados seja explicável — tratar as duas como equivalentes é a regra de
-- negócio, mas não saber qual foi qual torna impossível explicar a diferença.
-- O default preserva todas as linhas que já existem.
CREATE TYPE "VisitSource" AS ENUM ('CHECKIN', 'ORDER');

ALTER TABLE "intel_visits"
  ADD COLUMN "source" "VisitSource" NOT NULL DEFAULT 'CHECKIN';
```

O nome da tabela é `intel_visits` (vem do `@@map` no modelo `Visit`,
`schema.prisma:949`), **não** `Visit`. Confira o padrão em
`packages/db/prisma/migrations/20261001120000_intel_llm_cache_creation_tokens/migration.sql`,
que é o exemplo vivo mais recente de `ADD COLUMN` com comentário explicativo.

`prisma generate` **não** precisa de banco — ele lê só o `schema.prisma`.

**Verificar**: `npm run db:generate && npm run type-check` → exit 0;
`cat packages/db/prisma/migrations/20261007120000_visit_source/migration.sql` →
só `CREATE TYPE` e `ALTER TABLE ... ADD COLUMN`, nenhum `DROP`, nenhum
`NOT NULL` sem default.

### Passo 2: A API aceita a origem e deduplica o dia

Em `apps/api/src/modules/intelligence/app/visits.routes.ts`:

1. acrescente `source: z.enum(['CHECKIN', 'ORDER']).default('CHECKIN')` ao
   `visitSchema`;
2. **antes** de criar, procure uma visita do mesmo `{companyId, vendorCode,
   customerCode, loja}` cujo `arrivedAt` caia no **mesmo dia civil de São Paulo**
   (use `ymdSaoPaulo` de `../engine/business-days`; a janela em UTC vai de
   `dia-1` a `dia+1` e o recorte fino é pelo dia civil, como
   `manager.service.ts:139-152` faz). Se existir:
   - **não crie outra**. Atualize a existente com o `result` e o `orderId` que
     chegaram, preservando o `arrivedAt` e o `source` originais;
   - devolva 200 com a visita existente.
3. a promoção `markPlanInProgress` vale igual para a visita implícita quando ela
   vier com `planItemId`.

Essa deduplicação é o que impede dois registros quando o vendedor faz check-in,
sai da tela e cria o pedido pela aba Clientes. Ela é a parte mais importante
deste passo — sem ela, a aderência passa a contar visitas duplicadas e o número
fica pior do que era antes.

**Verificar**: `npm run type-check && npm test --workspace=apps/api` → exit 0.

### Passo 3: Testes da API

Em `apps/api/src/modules/intelligence/app/__tests__/app-routes.test.ts`,
acrescente, no estilo dos casos já existentes:

- `POST /visits` com `source: 'ORDER'` cria a visita com `source` gravado;
- segundo `POST` para o mesmo cliente **no mesmo dia** não cria outra linha:
  atualiza a existente e preserva o `arrivedAt` do primeiro;
- mesmo cliente em **dia diferente** cria linha nova;
- visita implícita com `planItemId` promove o plano `GENERATED` → `IN_PROGRESS`;
- `orderId` de pedido de outro usuário continua sendo rejeitado (`assertOwnOrder`).

**Verificar**: `npm test --workspace=apps/api` → passam, incluindo os cinco novos.

### Passo 4: O app cria a visita ao salvar o pedido

Em `apps/mobile/app/(app)/novo-pedido/index.tsx`, no bloco citado em "Estado
atual", transforme o `if` em `if/else`:

- **com** `visitParams.visitClientId` (veio da tela de visita): mantenha o
  comportamento atual, acrescentando `orderId` quando o pedido já tiver id do
  servidor;
- **sem** `visitClientId`: enfileire um `visit` novo com
  - `clientId`: `generateUuid()`;
  - `customerCode` e `loja` do cliente do pedido;
  - `arrivedAt`: agora;
  - `result: 'ORDER'` e `source: 'ORDER'`;
  - `orderId` quando existir — **nunca** um id local de pedido offline, que o
    `assertOwnOrder` rejeitaria, derrubando o PATCH inteiro;
  - `lat`, `lng`, `accuracyM`, `leftAt`: **nulos**, pela decisão de desenho 1;
  - `planItemId`: o id do item do plano de hoje **se** o cliente estiver nele.
    O plano já está em cache (`usePlan`); case por `${customerCode}|${loja}`. Se
    não achar, mande `null` — é uma visita fora do plano, que é a verdade.

Enfileire **depois** de a criação do pedido retornar com sucesso, no mesmo ponto
do código onde hoje o `visitResult` é enfileirado. Pedido que falhou não gera
visita.

**Verificar**: `npm run type-check && npm run lint && npm run test:unit --workspace=apps/mobile` → exit 0.

### Passo 5: Conferir o efeito no motor

Sem alterar nada no engine, confirme por leitura que o novo registro entra no
cooldown: `apps/api/src/modules/intelligence/engine/engine.service.ts:259` busca
`prisma.visit.findMany` por `arrivedAt` sem filtrar `source`, logo a visita
implícita conta. **Se houver filtro por `source` ali, PARE**: alguém mudou o
motor e a premissa deste plano caiu.

**Verificar**: `grep -n "source" apps/api/src/modules/intelligence/engine/engine.service.ts`
→ nenhuma linha referente a `Visit.source`.

## Plano de testes

- Novos: os cinco casos do passo 3, com ênfase no de deduplicação — é o que
  protege a aderência de contar duas vezes.
- Padrão a espelhar: os casos de `POST /visits` já existentes no mesmo arquivo.
- Mobile: se existir helper puro para montar o payload da visita, teste-o em
  `apps/mobile/src/**/__tests__/`; a tela em si não ganha teste de render.

## Critérios de conclusão

- [ ] `npm run db:generate` e `npm run type-check` saem com 0
- [ ] `npm run lint` sai com 0
- [ ] `npm test --workspace=apps/api` passa, incluindo os cinco casos novos
- [ ] `npm run test:unit --workspace=apps/mobile` passa
- [ ] A migration escrita à mão contém só `CREATE TYPE` e `ADD COLUMN`
- [ ] Nenhum comando de banco foi executado: `migrate dev`/`migrate reset`/`db push` não aparecem em lugar nenhum, e nenhum `.env` foi criado ou copiado no worktree
- [ ] `git diff --stat apps/api/src/modules/orders/` vazio
- [ ] `git diff --stat apps/api/src/modules/intelligence/engine/` vazio
- [ ] `grep -n "source" apps/api/src/modules/intelligence/engine/engine.service.ts` não retorna referência a `Visit.source`
- [ ] Linha de status atualizada em `plans/README.md`

## Condições de PARADA

- Parecer necessário conectar em um banco para concluir qualquer passo — não é,
  e conectar no banco deste projeto a partir de um worktree é risco real.
- A migration precisar de qualquer coisa além de `CREATE TYPE` e `ADD COLUMN`.
- O motor já filtrar visitas por `source`.
- A deduplicação do passo 2 exigir índice novo para ter desempenho aceitável —
  reporte o plano de query em vez de criar índice por conta própria (o índice
  `[companyId, vendorCode, arrivedAt]` já existe e deve bastar).
- Parecer necessário criar a visita dentro de `apps/api/src/modules/orders/`.

## Notas de manutenção

- **Este plano muda números históricos de comparação.** A partir dele, aderência
  e positivação da visita sobem, porque passam a contar atendimentos que antes
  eram invisíveis. Qualquer gráfico de série temporal que cruze a data de deploy
  vai ter um degrau — e o degrau é a correção, não o erro. Vale anotar a data em
  algum lugar visível para o gerente.
- Interage diretamente com o **plano 004**: com o `orderId` chegando desde a
  criação, a conciliação por data daquele plano passa a cobrir só o histórico
  anterior a este deploy.
- Interage com o **plano 003**: a tela de histórico precisa tratar
  `source: 'ORDER'` — sem duração e sem mapa. Mostre "registrada pelo pedido" no
  lugar do tempo de visita, em vez de "0 min".
- Quem revisar deve olhar, nesta ordem: (1) a deduplicação do mesmo dia;
  (2) o `orderId` nunca ser um id local; (3) o `planItemId` casando com o plano
  certo, porque um id órfão quebra o "Visitado" e os pinos do mapa.
