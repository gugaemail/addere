# Plano 004: Medir a conversão em reais, não só em "comprou ou não"

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat b7be724..HEAD -- apps/api/src/modules/intelligence/manager/ apps/api/src/modules/intelligence/engine/ranking.ts packages/db/prisma/schema.prisma`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA.

## Status

- **Prioridade**: P2
- **Esforço**: L
- **Risco**: MED
- **Depende de**: `plans/001-tela-resultado-inteligencia.md` (a tela que recebe estes números)
- **Categoria**: direction
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

## Por que isso importa

Hoje toda métrica de conversão do produto é **binária**: o cliente comprou ou
não comprou. Ninguém sabe **quanto** uma visita rendeu, e `Visit.orderId` —
que liga a visita ao pedido — não é lido por consulta nenhuma. Duas perguntas
comerciais óbvias ficam sem resposta: "a visita sugerida vende mais caro ou só
mais vezes?" e "o valor que o motor projetou para o dia se confirmou?".

A segunda pergunta tem um efeito colateral importante: hoje o motor **nunca é
cobrado pela própria previsão**. Ele estampa um `expectedAmount` em cada parada
e em cada plano, e nada compara isso com o que entrou. Sem esse confronto, não
existe caminho honesto para calibrar as premissas.

## Estado atual

Arquivos e fatos que você precisa:

- `packages/db/prisma/schema.prisma:925-950` — `Visit.orderId` é **String simples,
  sem `@relation`**. Não existe `include` de Prisma para isso: o join é manual,
  com um segundo `findMany` em `Order` filtrando `id: { in: orderIds }`.

- ⚠️ **`Visit.orderId` está sempre nulo hoje.** O backend aceita o campo
  (`patchSchema` em `apps/api/src/modules/intelligence/app/visits.routes.ts:27-31`,
  com validação de posse por `assertOwnOrder`), mas **nenhum ponto do app o
  envia**. Confirme com
  `grep -rn "orderId" apps/mobile/src apps/mobile/app | grep -v node_modules`
  → a única ocorrência é a assinatura do tipo em
  `apps/mobile/src/hooks/useIntel.ts:291`, nunca uma chamada que preencha.

  O pedido nascido de uma visita grava só o desfecho, sem o id
  (`apps/mobile/app/(app)/novo-pedido/index.tsx:673-679`):

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

  A razão provável é offline-first: no momento do enfileiramento o pedido pode
  ainda não ter id do servidor. **Consequência para este plano: sem o passo 1,
  o join não encontra nada e a tela mostra zero em tudo.**
- `packages/db/prisma/schema.prisma:367-395` — modelo `Order`. O valor está em
  `total Decimal @db.Decimal(10, 2)`. O status está em `status OrderStatus`, com
  valores `PENDING | SYNCED | CANCELLED` (enum em `schema.prisma:24`).
- `packages/db/prisma/schema.prisma:898` — `VisitPlanItem.expectedAmount
  Decimal? @db.Decimal(14, 2)`, a projeção do motor por parada.
- `apps/api/src/modules/intelligence/engine/ranking.ts:53 e :81-82` — **a sutileza
  central deste plano**. O `expectedAmount` não é previsão do tamanho do pedido:
  é ticket médio multiplicado pela probabilidade de compra.

```ts
const ticketProb = (signal.avgTicket ?? 0) * signal.purchaseProb
// ...
expectedAmount:
  signal.avgTicket === null ? null : Math.round(ticketProb * 100) / 100,
```

  Consequência obrigatória: **comparar previsto com realizado parada a parada é
  estatisticamente errado** — um cliente com ticket de R$ 3.000 e 30% de
  probabilidade tem `expectedAmount` de R$ 900, e ele nunca vai comprar R$ 900.
  A comparação só faz sentido **somada sobre muitas paradas**. Qualquer tela que
  mostre "previsto × realizado" por cliente está errada, mesmo que compile.

- `apps/api/src/modules/intelligence/manager/pilot-metrics.ts` — o modelo de
  cálculo puro a seguir: função que recebe fatos já carregados e devolve o
  relatório, sem Prisma dentro.
- `apps/api/src/modules/users/data-scope.ts:107` — `sellerWhere`, o recorte
  de equipe **unificado pelo plano 007**, que esta rota tem que reutilizar.
  Puro, recebe um `ViewerScope` já resolvido por `scopeFor`.
- `apps/api/src/modules/intelligence/manager/no-order.service.ts` — exemplar
  **mais recente** de rota de gerente com janela por dia civil e escopo de
  equipe (plano 002). É o padrão vivo; espelhe este arquivo.
- `apps/api/src/modules/intelligence/manager/manager.routes.ts:64` — o guard
  compartilhado, `requireAnyPermission('intel.admin', 'intel.manager')`.

## Esboço de tela

Dois blocos novos na página criada pelo plano 001 (`/inteligencia/resultado`),
abaixo dos cartões de conversão:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Quanto cada visita rendeu                      01/10 a 06/10 · Este mês │
├──────────────────────────────────────────────────────────────────────────┤
│                     Visitas    Viraram pedido    Vendido    Ticket médio  │
│   Do plano             142            84        R$ 268.400     R$ 3.195   │
│   Fora do plano         31            13        R$  29.700     R$ 2.285   │
│   ─────────────────────────────────────────────────────────────────────  │
│   Total                173            97        R$ 298.100     R$ 3.073   │
│                                                                          │
│   ▲ A visita sugerida rendeu R$ 910 a mais por visita realizada          │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  O motor acertou o tamanho do dia?                                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Valor esperado das paradas visitadas     R$ 241.000                    │
│   Vendido nessas mesmas paradas            R$ 268.400                    │
│                                                                          │
│   ████████████████████████████████░░░░  111% do esperado                 │
│                                                                          │
│   ⓘ O valor esperado é ticket médio × probabilidade de compra, somado    │
│     sobre as paradas. Ele não prevê o tamanho de um pedido específico —  │
│     só faz sentido no agregado. Por isso não há esta conta por cliente.  │
└──────────────────────────────────────────────────────────────────────────┘
```

A nota do segundo bloco é **obrigatória na tela**, não opcional. Sem ela, o
primeiro gerente que abrir vai procurar o número por cliente e concluir que o
sistema erra.

## Quem acessa

Igual às demais telas de gerente, porque é a mesma página do plano 001:

| Perfil | Enxerga? | Escopo |
|---|---|---|
| Vendedor (`SALESPERSON`) | **Não** | não entra no painel web |
| Gerente (`intel.manager`) | **Sim** | só a equipe dele, via `sellerWhere` |
| Administrador (`ADMIN` / `intel.admin`) | **Sim** | empresa inteira |
| `SUPERADMIN` | **Sim** | tenant por `companyId` |

**Atenção de privacidade/negócio**: esta rota expõe faturamento por vendedor.
O recorte de equipe deixa de ser detalhe técnico e vira contenção comercial —
um gerente não pode ver o resultado da equipe de outro. É o item número um da
revisão deste plano.

## Comandos que você vai precisar

| Para quê | Comando | Esperado quando dá certo |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Checar tipos | `npm run type-check` | exit 0, sem erros |
| Lint | `npm run lint` | exit 0 |
| Testes da API | `npm test --workspace=apps/api` | todos passam |
| Build do painel | `npm run build:web` | exit 0 |

## Escopo

**Dentro do escopo:**
- `apps/mobile/app/(app)/novo-pedido/index.tsx` (passo 1 — enviar `orderId` no desfecho da visita)
- `apps/api/src/modules/intelligence/manager/conversion.ts` (criar — cálculo puro)
- `apps/api/src/modules/intelligence/manager/conversion.service.ts` (criar — queries)
- `apps/api/src/modules/intelligence/manager/manager.routes.ts` (acrescentar a rota)
- `apps/api/src/modules/intelligence/manager/__tests__/conversion.test.ts` (criar)
- `packages/types/src/intelligence.ts` (acrescentar `ConversionReportDto`)
- `apps/web/src/hooks/useIntel.ts` (acrescentar `useConversionReport`)
- `apps/web/src/app/(admin)/inteligencia/resultado/page.tsx` (os dois blocos novos)

**Fora do escopo (NÃO toque):**
- `apps/api/src/modules/intelligence/engine/**` — em especial `ranking.ts`. A
  definição de `expectedAmount` é premissa deste plano, não alvo. Se você achar
  que ela deveria mudar, isso é um achado para reportar, não uma edição.
- `packages/db/prisma/schema.prisma` — **não** acrescente `@relation` entre
  `Visit` e `Order`. O join manual é intencional: `Visit` é da Inteligência e
  `Order` é do núcleo do app, e eles têm ciclos de vida independentes.
- `apps/api/src/modules/intelligence/app/visits.routes.ts` — o backend já aceita
  `orderId` e já valida a posse com `assertOwnOrder`. O que falta está no app.
- `apps/mobile/**` **fora** do arquivo citado no passo 1.
- `pilot-metrics.ts` — não reescreva as métricas binárias existentes. Este plano
  acrescenta um eixo, não substitui o outro.

## Fluxo de git

- Branch: `advisor/004-conversao-em-reais`
- Um commit por passo. Estilo: `api: conversão em reais por origem da visita`.
- NÃO faça push nem abra PR a menos que quem despachou tenha mandado.
- **NÃO publique build do app** (`eas build`, `eas update`, loja). Este plano
  toca `apps/mobile`, e a decisão de entrega de 06/10/2026 é **um build só, no
  fim de todos os planos** — veja "Estratégia de entrega" em `plans/README.md`.
  Termine no código e pare.

## Passos

### Passo 1: Fazer o app gravar o `orderId` na visita

**Sem este passo, todo o resto deste plano produz zeros.** Hoje a ligação entre
visita e pedido nunca é escrita.

Em `apps/mobile/app/(app)/novo-pedido/index.tsx`, no bloco citado em "Estado
atual" (linhas 673-679), inclua o id do pedido no payload **quando ele existir**:

- se a criação voltou com o pedido já sincronizado, envie `orderId` junto do
  `result: 'ORDER'`;
- se o pedido ficou offline e ainda não tem id do servidor, **não invente nada**:
  mantenha o enfileiramento como está hoje e deixe `orderId` de fora. Enfileirar
  um id local faria o `assertOwnOrder` do backend rejeitar o PATCH inteiro e
  perder também o desfecho da visita, que hoje funciona.

O backend já aceita o campo e já valida a posse; **não altere
`visits.routes.ts`**. O handler de fila (`apps/mobile/src/services/syncHandlers.ts:112-120`)
repassa o corpo inteiro, então não precisa de mudança.

**Verificar**: `npm run type-check && npm run test:unit --workspace=apps/mobile` → exit 0;
e `grep -rn "orderId" apps/mobile/app/\(app\)/novo-pedido/index.tsx` → retorna a
linha nova.

### Passo 2: Confirmar as demais premissas

**Verificar**:
1. `grep -n "orderId" packages/db/prisma/schema.prisma` → em `Visit`, `orderId` é
   `String?` **sem** `@relation`. Se já houver relação declarada, PARE: o plano
   foi escrito para o join manual.
2. `grep -n "ticketProb" apps/api/src/modules/intelligence/engine/ranking.ts` →
   confirma que `expectedAmount` é ticket × probabilidade. Se a fórmula mudou,
   PARE e reporte: a nota da tela depende dela.

### Passo 3: Decidir o que fazer com o histórico sem `orderId`

O passo 1 só conserta daqui para a frente. **Todas as visitas já registradas
têm `orderId` nulo** e continuarão assim — e são elas que dão volume à primeira
versão da tela. O plano resolve isso com conciliação por data, declarada:

- quando a visita tem `orderId`, use-o. É o vínculo forte;
- quando não tem, procure um `Order` do **mesmo cliente**, do **mesmo vendedor**,
  no **mesmo dia civil de São Paulo** da visita. Se houver exatamente um,
  concilie. Se houver mais de um, some todos — o vendedor atendeu uma vez e
  fez dois pedidos;
- marque cada conciliação como `strong` ou `byDate` e **conte as duas no DTO**.

A tela mostra isso: um rodapé do tipo
`38 de 97 pedidos conciliados por data, não por vínculo direto`. Não esconda —
número inferido apresentado como medido é a forma mais rápida de perder a
confiança do gerente no painel inteiro.

Se, no futuro, todas as visitas da janela tiverem vínculo forte, o rodapé some
sozinho. Esse é o sinal de que o passo 1 pegou.

**Verificar**: nada a rodar ainda — este passo é desenho, e se materializa nos
passos 4 e 6.

### Passo 4: Cálculo puro

Crie `apps/api/src/modules/intelligence/manager/conversion.ts`, sem Prisma,
espelhando a forma de `pilot-metrics.ts`:

```ts
export interface VisitValueFact {
  ymd: string
  vendorCode: string
  planned: boolean          // planItemId !== null
  orderTotal: number | null // null = não virou pedido (ou pedido cancelado)
  expectedAmount: number | null // do VisitPlanItem; null fora do plano
  link: 'strong' | 'byDate' | 'none' // como o pedido foi conciliado (passo 3)
}

export interface ConversionSlice {
  visits: number
  withOrder: number
  soldAmount: number
  avgTicket: number | null  // soldAmount / withOrder; null com withOrder === 0
}

export interface ConversionReport {
  range: { fromYmd: string; toYmd: string }
  planned: ConversionSlice
  outOfPlan: ConversionSlice
  total: ConversionSlice
  /** soldAmount/visits do plano − soldAmount/visits fora do plano; null se algum lado tiver visits 0 */
  valuePerVisitDiff: number | null
  /** Transparência da conciliação (passo 3) — alimenta o rodapé da tela. */
  reconciliation: { strong: number; byDate: number }
  expected: {
    expectedAmount: number   // Σ expectedAmount das paradas que viraram visita
    soldAmount: number       // Σ total vendido nessas mesmas paradas
    ratioPct: number | null  // null quando expectedAmount === 0
  }
}
```

Regras que o cálculo tem que respeitar:

- Pedido com `status === 'CANCELLED'` conta como **não convertido**: `orderTotal`
  chega `null`. Cancelado contado como venda é o jeito mais fácil de produzir um
  painel que mente.
- Dinheiro em `number` com duas casas, arredondado só na saída. `Decimal` do
  Prisma vira `Number(...)` na camada de serviço, nunca dentro desta função.
- O bloco `expected` usa **apenas** paradas com `expectedAmount !== null` **e**
  que viraram visita. Parada não visitada não entra em nenhum dos dois lados —
  senão o "esperado" infla contra um realizado que nunca teve chance.

**Verificar**: `npm run type-check` → exit 0.

### Passo 5: Testes do cálculo

Crie `apps/api/src/modules/intelligence/manager/__tests__/conversion.test.ts`.
Casos obrigatórios:

- visita com pedido `CANCELLED` não entra em `withOrder` nem em `soldAmount`;
- `avgTicket` é `null` quando `withOrder === 0` (e não `0`, nem `NaN`);
- `valuePerVisitDiff` é `null` quando um dos lados tem `visits === 0`;
- parada com `expectedAmount: null` fica fora dos dois lados de `expected`;
- `ratioPct` é `null` quando `expectedAmount` somado é `0`.

**Verificar**: `npm test --workspace=apps/api` → passam, incluindo os novos.

### Passo 6: Serviço com o join manual

Crie `apps/api/src/modules/intelligence/manager/conversion.service.ts`:

1. carregue as visitas da janela, com escopo por `sellerWhere` e a técnica
   de janela UTC larga + recorte por dia civil de São Paulo de
   `manager.service.ts:113-130`;
2. colete os `orderId` não nulos e faça **um** `prisma.order.findMany({ where: { companyId, id: { in: orderIds } }, select: { id: true, total: true, status: true } })`
   — um único round-trip, nunca uma query por visita;
3. colete os `planItemId` não nulos e busque `visitPlanItem` em lote, para o
   `expectedAmount`;
4. monte os `VisitValueFact` e chame a função pura.

Em `manager.routes.ts`, acrescente `GET /conversion` depois de `/pilot-metrics`,
com o mesmo `guard` e a mesma resolução de escopo das rotas vizinhas.

**Verificar**: `npm run type-check && npm test --workspace=apps/api` → exit 0.

### Passo 7: Hook e blocos na tela

Acrescente `useConversionReport` em `apps/web/src/hooks/useIntel.ts`, no formato
de `usePilotMetrics`. Acrescente os dois blocos do esboço em
`apps/web/src/app/(admin)/inteligencia/resultado/page.tsx`, reaproveitando o
seletor de período que já existe lá — **um período só para a página inteira**,
não um por bloco. Ele abre no **mês corrente** e trabalha sempre em meses
civis — nunca em janelas de 30 ou 90 dias —, porque a meta do vendedor é mensal
e a do gerente é a soma das metas da equipe dele (decisão de 06/10/2026). Use o
`monthRange` criado no plano 001; não escreva outro.

Valores em reais usam o mesmo formatador de moeda já usado no painel; procure-o
com `grep -rn "toLocaleString\|Intl.NumberFormat" apps/web/src/lib` e reutilize,
em vez de criar outro.

**Verificar**: `npm run type-check && npm run lint && npm run build:web` → exit 0.

## Plano de testes

- Novos: `apps/api/src/modules/intelligence/manager/__tests__/conversion.test.ts`,
  com os cinco casos do passo 5.
- Padrão a espelhar: os testes de função pura em
  `apps/api/src/modules/intelligence/manager/__tests__/`.
- Se acrescentar teste de rota, espelhe
  `apps/api/src/modules/intelligence/app/__tests__/app-routes.test.ts` e cubra
  **o recorte de equipe**: gerente A não pode ver visita de vendedor da equipe B.

## Critérios de conclusão

- [ ] `npm run type-check` sai com 0
- [ ] `npm run lint` sai com 0
- [ ] `npm test --workspace=apps/api` passa, incluindo os testes novos
- [ ] `npm run build:web` sai com 0
- [ ] `git diff --stat packages/db/prisma/schema.prisma` vazio (nenhuma migration)
- [ ] `git diff --stat apps/api/src/modules/intelligence/engine/` vazio
- [ ] `git diff --stat apps/api/src/modules/intelligence/app/visits.routes.ts` vazio
- [ ] `grep -rn "orderId" apps/mobile/app/\(app\)/novo-pedido/index.tsx` retorna a linha do passo 1
- [ ] O rodapé de conciliação por data aparece na tela quando `reconciliation.byDate > 0`
- [ ] A nota sobre "ticket médio × probabilidade" aparece literalmente na tela
- [ ] Linha de status atualizada em `plans/README.md`

## Condições de PARADA

- `Visit.orderId` já tiver `@relation` declarada no schema.
- O app já estiver enviando `orderId` (então o passo 1 está feito: confira e siga).
- A conciliação por data do passo 3 casar mais de três pedidos para a mesma
  visita em dados reais — isso indica que a regra "mesmo cliente, mesmo
  vendedor, mesmo dia" não serve nessa operação; reporte em vez de ajustar o
  critério por conta própria.
- A fórmula de `expectedAmount` em `ranking.ts` não for mais ticket ×
  probabilidade.
- Parecer necessário uma migration para a consulta ficar aceitável — reporte o
  plano de query em vez de criar índice por conta própria.
- O plano 001 não tiver sido executado: a página `/inteligencia/resultado` não
  existe e este plano não deve criá-la do zero.

## Notas de manutenção

- Se o `plans/006-pedido-vale-check-in.md` for executado antes deste, o passo 1
  daqui já estará feito (lá ele é parte do fluxo novo) — confira e siga para o
  passo 2 em vez de duplicar a mudança.
- A conciliação por data é dívida temporária, não desenho permanente: ela existe
  só porque o histórico anterior ao passo 1 não tem vínculo. Quando a janela de
  análise for toda posterior, o caminho `byDate` pode ser removido.
- Pedido feito **sem** check-in nenhum (direto por "Novo pedido", sem "Cheguei")
  não gera visita alguma e, portanto, não entra em nenhuma das duas conciliações:
  ele aparece no faturamento do Protheus e em lugar nenhum desta tela. Isso é
  comportamento do produto hoje, não bug deste plano — mas é a explicação de por
  que a soma daqui pode ser menor que a venda real do período, e a tela precisa
  deixar isso claro se a diferença for grande.
- `Order.total` é o valor do pedido como foi criado no app, não o faturado no
  Protheus. Se um dia a reconciliação passar a corrigir valor, esta conta tem
  que escolher explicitamente qual das duas fontes usa — e dizer na tela.
- Quem revisar deve olhar, nesta ordem: (1) recorte de equipe, porque agora
  vaza faturamento; (2) tratamento de `CANCELLED`; (3) ausência de qualquer
  comparação previsto × realizado por cliente.
- Desdobramento deixado de fora de propósito: calibrar as premissas do motor a
  partir do desvio medido aqui. É o passo seguinte natural e precisa de decisão
  de produto antes de código.
