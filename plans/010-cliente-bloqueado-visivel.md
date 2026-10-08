# Plano 010: Cliente bloqueado aparece como Bloqueado — e não recebe pedido

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 1248049..HEAD -- apps/api/src/modules/sync/customers.sync.ts apps/api/src/modules/customers apps/api/src/modules/orders/orders.service.ts apps/mobile/app/\(app\)/novo-pedido apps/mobile/app/\(app\)/clientes apps/web/src/app/\(admin\)/empresas/\[id\]/tabs/CustomersTab.tsx`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA.

## Status

- **Prioridade**: P1
- **Esforço**: M
- **Risco**: MED — muda quem aparece na carteira e quem pode receber pedido
- **Depende de**: nenhum. Combina com o 009 (o passo 5 de lá traz a exclusão
  do Protheus para `active=false`), mas não depende dele
- **Categoria**: bug + regra de produto
- **Planejado em**: commit `1248049`, 2026-10-08
- **Toca o app**: sim (lista de clientes e escolha de cliente no pedido) —
  segue a regra da série: **nenhum executor publica build/OTA**

## Por que isso importa

**Regras de produto decididas pelo Gustavo em 08/10/2026:**

1. **Bloqueado** = `A1_MSBLQL = '1'`. Qualquer outro valor (`'2'`, vazio) é
   ativo. Cliente bloqueado **aparece** — na carteira, na lista de clientes, no
   plano (seção "Resolver") — com o status Bloqueado. **Só não pode receber
   pedido.**
2. **Excluído** = `D_E_L_E_T_ = '*'` no Protheus: o registro está apagado lá, mas
   continua no banco. No Addere o entendimento é o mesmo: `active = false` (o
   soft delete da regra do projeto), registro preservado.

Hoje o código trata **bloqueado como excluído**:

- `apps/api/src/modules/sync/customers.sync.ts` grava
  `active: c.msblql !== '1'`. O cliente bloqueado vira inativo.
- Tudo que lista cliente filtra `active: true` — a aba Clientes e a Ficha do
  app (`customers.service.ts`), o motor (`engine.service.ts`) e as rotas de
  cliente da Inteligência (`intelligence/app/customers.routes.ts`).

Consequências: o bloqueado **some** da carteira em vez de aparecer bloqueado; a
regra do motor `msblql === '1' → BLOCKED` (`engine/signals.ts` `checkBlocked`)
é **código morto**, porque o motor nunca vê esse cliente; e a seção "Resolver"
do plano do dia, feita exatamente para isso, nunca recebe bloqueado de cadastro.
O vendedor não fica sabendo por que o cliente sumiu, e o gerente não enxerga o
tamanho do problema.

E o inverso também está errado: nada no Addere marca `active=false` quando o
cliente é **excluído** no Protheus — a exclusão simplesmente não chega.

## Estado atual

- `apps/api/src/modules/sync/customers.sync.ts`
  - `customerFields` (~32-53): grava `msblql` **e** `active: c.msblql !== '1'`
    (comentário "Protheus marca bloqueio em A1_MSBLQL='1'").
  - mapeamento do REST (~90): `msblql: toStr(raw['A1_MSBLQL']) || null`.
- `packages/db/prisma/schema.prisma:269`: `msblql String? // A1_MSBLQL: "1"=bloqueado,
  "2"=liberado — inativa cliente se "1"` (comentário a corrigir).
- `packages/types/src/index.ts:200`: `Customer.msblql: string | null` já existe
  — o app já recebe o campo.
- `apps/api/src/modules/customers/customers.service.ts:21,37`: lista e detalhe
  filtram `active: true`.
- `apps/api/src/modules/orders/orders.service.ts` `createOrder` (~197): valida
  transportadora/condição e produtos ativos; **não valida o cliente**.
- `apps/api/src/modules/intelligence/engine/signals.ts` `checkBlocked` (~97-115):
  `msblql === '1'` → `{ blocked: true, reason: 'Bloqueado no cadastro (MSBLQL)' }`.
- `apps/api/src/modules/intelligence/protheus-sql/contracts.ts:63,73`: o
  contrato `CUSTOMERS` já traz `A1_MSBLQL AS bloqueado`, mas
  `persistCustomerEnrichment` (`sync/contract-sync.service.ts`) não grava.
- App, caminhos até o pedido: `pedidos/index.tsx:187` (botão → `novo-pedido`,
  que tem seletor de cliente) e `rota/visita/[itemId].tsx:132` (visita →
  pedido). Item bloqueado do plano **já não tem "Cheguei"** (E13), então pela
  visita o caminho já está fechado.
- Fila offline: `src/services/syncEngine.ts:23` trata 4xx (fora os transitórios)
  como falha permanente — pedido offline de bloqueado recusado pela API não fica
  em loop.
- Painel: `empresas/[id]/tabs/CustomersTab.tsx:83-96` mostra Ativo/Inativo por
  `active` e permite alternar manualmente.

## Decisões de desenho

1. **`active` volta a significar só "não excluído".** Bloqueio vive em
   `msblql`. O sync REST deixa de derivar `active` de `msblql`.
2. **Ao receber o cliente pelo REST, `active = true`.** A API do consultor só
   devolve cliente existente — **confirmado pelo Gustavo em 08/10/2026: todas
   as consultas do Protheus filtram `D_E_L_E_T_ = ' '`**. Consequência: cliente
   excluído simplesmente para de vir pelo REST e **não** é inativado por ele. Isso também **cura
   sozinho** quem hoje está inativo por bloqueio: na primeira sincronização
   depois do deploy, o bloqueado volta a ativo e passa a aparecer como
   Bloqueado. Sem migration de dados. Efeito colateral já existente hoje (não é
   regressão): inativação manual feita no painel é sobrescrita pelo próximo sync.
3. **Exclusão chega pelo SQL incremental do 009** (`excluido='*'` →
   `active=false`). Até o 009 sair, exclusão continua sem chegar — como hoje.
4. **Pedido para bloqueado é recusado na API** (422, mensagem "Cliente bloqueado
   no Protheus — não é possível fazer pedido"), e **o app não oferece** o
   cliente bloqueado como escolhível. A API é a garantia; o app é a experiência.
   Vale para criar **e** editar pedido em rascunho.
5. **Uma fonte só para "está bloqueado"**: helper `isCustomerBlocked(msblql)` →
   `msblql?.trim() === '1'`, um na API e um no app (pacote de tipos, se couber
   lá sem dependência de runtime).

## Quem acessa

Sem mudança de permissão. O bloqueio vale para todo perfil (vendedor, gerente,
admin) — é regra do ERP, não de papel.

## Escopo

**Entra:** `sync/customers.sync.ts`, `orders/orders.service.ts` (+ testes),
`intelligence/sync/contract-sync.service.ts` (gravar `bloqueado` do contrato
`CUSTOMERS` em `msblql`), comentário do `schema.prisma` (sem migration),
`packages/types` (helper), app: seletor de cliente do `novo-pedido`, lista e
Ficha de clientes; painel: `CustomersTab`.

**Não entra:** motor (`checkBlocked` já faz o certo assim que enxergar o
cliente), geocodificação, `apps/mobile` fora das telas citadas, publicação de
build/OTA.

## Fluxo de git

Branch a partir de `origin/staging`, PR para `staging`. Nada de PR empilhado.

## Passos

### Passo 1: Separar bloqueio de exclusão no sync

- `customers.sync.ts`: `active: true` no lugar de `active: c.msblql !== '1'`;
  comentário explicando as duas regras.
- `schema.prisma:269`: corrigir o comentário (sem mudar o campo).
- `persistCustomerEnrichment`: gravar `msblql` a partir da coluna `bloqueado`
  quando vier (mesma normalização do REST).
- Teste: cliente com `A1_MSBLQL='1'` sincroniza com `active=true` e
  `msblql='1'`.

### Passo 2: API recusa pedido para bloqueado

- `createOrder` e a edição de pedido: buscar o cliente da empresa e lançar 422
  se `isCustomerBlocked`. Cliente `active=false` → 404 como os demais recursos
  inativos.
- Testes de rota: bloqueado → 422 com a mensagem; ativo → segue; inexistente →
  404. Nenhuma asserção existente alterada.

### Passo 3: App não oferece bloqueado no pedido

- Seletor de cliente do `novo-pedido`: bloqueado aparece **desabilitado**, com o
  selo "Bloqueado" (cor `colors.status.blocked`, já existe) — não escondido, para
  o vendedor entender por que não consegue.
- Lista e Ficha de clientes (legado e Inteligência): selo "Bloqueado" quando
  `msblql === '1'`. Na Inteligência o status `BLOCKED` já tem cor e rótulo —
  reaproveitar, não criar outro.
- Pedido offline já na fila para cliente que ficou bloqueado depois: a API
  recusa (422) e a fila já trata como falha permanente — só conferir que a
  mensagem chega ao usuário.
- Testes Jest do helper e do seletor.

### Passo 4: Painel

- `CustomersTab`: coluna Status mostra **Bloqueado** (quando `msblql='1'`) além
  de Ativo/Inativo. O toggle manual continua sendo só de `active`.

### Passo 5: Conferir o efeito no motor

- Com o mock (`INTEL_SQL_ADAPTER=mock`), marcar um cliente com `msblql='1'` e
  rodar o motor: ele deve sair com status `BLOCKED`, motivo "Bloqueado no
  cadastro (MSBLQL)", e entrar na seção "Resolver" do plano — sem mudança no
  código do motor. Se precisar mudar o motor, é PARADA.

## Critérios de conclusão

- `type-check`, `lint`, testes da API, web e mobile com exit 0.
- Teste do Passo 1 e do Passo 2 passando; nenhuma asserção existente alterada.
- Motor marca BLOCKED por cadastro sem alteração em `engine/` (Passo 5).
- Nenhum build ou OTA publicado.

## Condições de PARADA

- ~~A API REST de clientes devolver excluídos~~ — resolvido em 08/10/2026: todas
  as consultas filtram `D_E_L_E_T_ = ' '`. Se em algum cliente a resposta vier
  com registro excluído, aí sim é PARADA.
- Encontrar outro caminho de criação de pedido além dos dois citados.
- Qualquer mudança necessária em `engine/`.

## Notas de manutenção

- Depois deste plano, `active=false` em cliente só deve nascer de exclusão no
  Protheus (009) ou de ação manual no painel. Se aparecer outro lugar gravando
  `active=false` por regra de negócio, é regressão desta decisão.
- O mesmo raciocínio vale para produto (`B1_MSBLQL`): hoje o contrato
  `PRODUCTS` usa `B1_MSBLQL='1'` para `ativo='N'`. Produto bloqueado some do
  catálogo — para produto isso provavelmente está certo (não se vende item
  bloqueado), mas não foi decidido explicitamente. Fora deste plano.
