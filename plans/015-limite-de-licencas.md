# Plano 015: Limite de licenças por contrato e pedido de licenças adicionais

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Pré-requisito**: os planos 013 e 014 mergeados na `staging`. Este plano usa
> modelos, enums, helpers e rotas que eles criam. O Passo 0 confere cada um.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 80fe328..HEAD -- apps/api/src/modules/users/ apps/api/src/modules/companies/companies.service.ts apps/api/src/modules/companies/companies.routes.ts apps/api/src/lib/errors.ts apps/api/src/lib/error-handler.ts apps/api/src/middleware/authenticate.ts apps/api/src/middleware/resolve-tenant.ts apps/api/src/test-utils/prisma-mock.ts apps/web/src/components/users/UserFormModal.tsx apps/web/src/app/\(admin\)/users/page.tsx apps/web/src/app/\(admin\)/layout.tsx apps/web/src/hooks/useUsers.ts apps/web/src/lib/user-profile.ts apps/web/src/lib/api.ts packages/db/prisma/schema.prisma`
>
> Mudanças **esperadas**, vindas do 013 e do 014: `errors.ts` e
> `error-handler.ts` (o `code` do `AppError`), `apps/web/src/lib/api.ts`
> (`getApiErrorCode`), `schema.prisma` (modelos do billing), `(admin)/layout.tsx`
> (grupo "Gestão Addere", item `/contrato`). Se o 016 já tiver entrado, também
> `schema.prisma` (faturas). Qualquer outra mudança nos arquivos do escopo:
> compare com "Estado atual"; se não bater, trate como condição de PARADA.

## Status

- **Prioridade**: P1
- **Esforço**: M
- **Risco**: MEDIUM — passa a recusar escritas que hoje sempre funcionam, nos
  seis caminhos que criam ou ativam vendedor; muda a semântica de concorrência
  dessas escritas; tem migration
- **Depende de**: 014 (contrato ACTIVE só existe depois do aceite) e, por
  tabela, 013
- **Categoria**: feature
- **Planejado em**: commit `80fe328` (`origin/staging`), 2026-10-15
- **Paralelo**: pode andar junto com o 016. Os dois mexem no `schema.prisma` e
  no `/plano` — ver "Notas de manutenção"

## Por que isso importa

O contrato do 014 vende um pacote com **N licenças**. Hoje nada no produto
conta licença: `POST /users` (`users.service.ts:58`) e
`POST /companies/:id/users` (`companies.service.ts:272`) criam quantos
vendedores o ADMIN quiser. Sem a trava, o pacote é só um número no PDF.

Três buracos que este plano fecha:

1. **Não há limite.** Nenhum dos seis caminhos que criam, ativam ou transformam
   alguém em vendedor olha o contrato.
2. **Dois cliques ao mesmo tempo furam qualquer limite ingênuo.** Com 19 de 20
   em uso, dois ADMINs criando ao mesmo tempo contariam 19 os dois e gravariam
   os dois: 21 de 20. A trava precisa serializar as escritas da mesma empresa.
3. **O código do erro se perde.** Os `catch` de `users.routes.ts` trocam
   qualquer erro por 409 ou 404 com a mensagem crua. Um `AppError` com
   `code: 'SEAT_LIMIT_REACHED'` chegaria ao painel sem o código, e o painel não
   saberia mostrar o aviso certo.

Além disso, o contrato promete (tabela "Promessas do contrato × sistema" do
014): **"Licença adicional cobrada a partir do mês seguinte"**. Quem cumpre é
este plano (a aprovação cria termos que valem na hora) junto com o 016 (que
cobra pelos termos da competência). E o ADMIN precisa de um caminho para sair
do limite sem e-mail nem telefone: o botão "Solicitar mais licenças", que
mostra o preço e vale como aceite.

### Regras de negócio que valem aqui (decisão de produto de 15/10/2026)

| Tema | Regra |
|---|---|
| Quem consome licença | Usuário **ativo** com perfil vendedor ou gerente (`SALESPERSON`). ADMIN é grátis. Desativar libera a licença na hora. |
| Pacotes | 10, 20, 30 e Ilimitado. No "Ilimitado" a quantidade é digitada no contrato (ex.: 100 licenças). O Ilimitado passa pela mesma trava dos outros. |
| Adicionais | Licença avulsa, uma a uma, com preço unitário negociado por empresa (`extraSeatPrice` dos termos). |
| Antes do aceite | **Nada começa**: sem limite de licenças. Contrato em DRAFT ou PENDING_ACCEPTANCE não limita. |
| Pedido de licenças | O pedido de licenças extras feito pelo próprio ADMIN mostra o preço e **vale como aceite, sem aditivo**. Aprovado pelo superadmin, vira termos EFFECTIVE na hora (`origin LICENSE_REQUEST`). |
| Mudança no mês | Licença que entra no mês M não é cobrada em M; entra na cobrança a partir de M+1. **O limite muda na hora.** |
| ADMIN do cliente | Vê o pacote, o tipo, as licenças usadas e livres. No limite, pede mais licenças por um botão que avisa a Addere. |
| Piloto | Empresa em piloto fica sem contrato: sem limite. |
| Decisão padrão 1 | Empresa sem contrato aceito continua como hoje: sem limite. |
| Decisão padrão 5 | **Redução de pacote não desativa ninguém.** Ela bloqueia novas ativações e mostra "acima do limite" até o ADMIN desativar usuários. |
| Decisão padrão 8 | Quem opera o módulo é o papel SUPERADMIN atual. O histórico registra quem fez cada ação. |
| Decisão padrão 9 | Licença extra lançada pelo superadmin sem pedido do ADMIN gera aditivo (fluxo do 014, não deste plano). |

### Decisões de desenho deste plano

1. **A trava vale também para o SUPERADMIN.** Ela protege o contrato, não o
   papel. Pela decisão 9, o superadmin que quer passar do limite faz um aditivo
   ou aprova um pedido; não existe atalho.
2. **Um pedido pendente por empresa.** Um segundo `POST` com outro pendente dá
   409 `LICENSE_REQUEST_PENDING`. Evita dois aceites de compra por clique
   duplo.
3. **A aprovação confere o preço e o aditivo em andamento.** Se o
   `extraSeatPrice` dos termos atuais não for o `unitPriceShown` do pedido, a
   aprovação dá 409 `LICENSE_PRICE_CHANGED`: o cliente aceitou outro preço. Se
   houver termos PROPOSED (aditivo em rascunho ou enviado), dá 409
   `AMENDMENT_PENDING`: o aditivo foi montado sobre os termos antigos e, ao ser
   aceito, apagaria as licenças aprovadas.
4. **A frase da declaração sai de uma função pura compartilhada**
   (`licenseRequestDeclaration`, em `packages/types`). O web mostra o resultado
   dela; a API confere que o preço mostrado é o preço atual, gera a mesma frase
   e grava o texto e o SHA-256. Como a função e as entradas são as mesmas, o
   texto gravado é o texto mostrado.
5. **Desativar nunca passa pela trava.** Só a escrita que **passa a ocupar**
   uma licença entra na transação (`consumesSeat`).
6. **Recusa não derruba sessão.** Em `updateUser`, a invalidação de sessões
   (troca de papel ou senha) passa para dentro da escrita travada. Uma troca de
   ADMIN para vendedor recusada pelo limite não desloga o ADMIN.

## Estado atual

### Conferido no commit `80fe328`

**Os seis pontos que criam ou ativam vendedor:**

| # | Onde | O que faz hoje |
|---|---|---|
| 1 | `apps/api/src/modules/users/users.service.ts:58-94` `createUser` | `bcrypt` em `:62`, `prisma.user.create` em `:69`. Sem limite. |
| 2 | `apps/api/src/modules/companies/companies.service.ts:272-303` `createUser` | gerente em `:273`, `bcrypt` (custo 12) em `:274`, `prisma.user.create` em `:275`. Sem limite. |
| 3 | `users.service.ts:96-111` `toggleUserActive(id, requester)` | inverte `active`; apaga sessões em `:102-104` ao desativar; `update` em `:106`. |
| 4 | `companies.service.ts:305-317` `toggleUserActive(companyId, id, active)` | recebe `active` explícito; apaga sessões em `:309-311` ao desativar; `update` em `:312`. |
| 5 | `companies.service.ts:329-370` `updateUser` | troca `role` em `:336`; `bcrypt` em `:344`; apaga sessões em `:346-350` **antes** do `update` de `:352`. |
| 6 | `users.service.ts:129-144` (dentro de `updateUserById`) | vínculo de usuário órfão: `findUnique` em `:120` só seleciona `companyId`; `prisma.user.update({ data: { companyId } })` em `:142`. |

O `PATCH /users/:id` não é um sétimo caminho: depois do vínculo,
`updateUserById` delega a edição para `companies.service:updateUser`
(`users.service.ts:151`, `updateCompanyUser(scopeId, id, profile)`). A trava do
ponto 5 cobre as duas rotas.

Fora dos seis, ninguém mais escreve `role` ou `active` de usuário pela API:
`auth.service.ts:123` só troca a senha; o módulo `permissions` concede
`intel.manager`, mas o gerente já é `SALESPERSON`, então não muda a contagem.
Escrevem usuário direto no banco, de propósito fora da trava: os scripts de
operador `packages/db/prisma/seed.ts:104` e `:135` (banco de desenvolvimento) e
`apps/api/scripts/seed-demo-tenant.ts:106` (tenant sintético "Addere
Demonstração", que nunca terá contrato).

**Os `catch` que engolem o `AppError`** — `apps/api/src/modules/users/users.routes.ts`:

```ts
// :59-64 — POST /users
try {
  const user = await createUser(result.data, request.user)
  return reply.status(201).send(user)
} catch (err) {
  return reply.status(409).send({ message: (err as Error).message })
}
// :89-96 — PATCH /users/:id: ForbiddenError vira 403, o resto vira 404
// :107-112 — PATCH /users/:id/active: tudo vira 404
```

Consequência que já existe hoje: o 422 "Gerente inválido" de
`companies.service.ts:269`, lançado como `AppError`, chega ao painel como 404
pelo `PATCH /users/:id`.

`companies.routes.ts:52-53` não tem `try/catch`: os erros vão para o handler
global (`lib/error-handler.ts:11-15`, que devolve `{ message, details? }` para
`AppError`). As rotas de usuário da empresa estão em `:132` (POST), `:140`
(PATCH) e `:150` (PATCH active).

**Erros e guardas:**

- `apps/api/src/lib/errors.ts:3-14` — `AppError(statusCode, message, details?)`,
  ainda sem `code` (o 013 acrescenta). `conflict` em `:19`.
- `apps/api/src/middleware/authenticate.ts:57-69` — `requireAnyPermission`;
  SUPERADMIN sempre passa.
- `apps/api/src/middleware/resolve-tenant.ts:18-53` — `resolveTenant(request,
  reply, 'query')`: usa `?companyId=` quando vem, senão a empresa do usuário;
  SUPERADMIN sem `companyId` leva 400; ADMIN pedindo outra empresa leva 403.
- `apps/api/src/middleware/require-company.ts:23-40` — `requireCompanyScope`,
  modelo de preHandler por papel.
- Permissões padrão: o ADMIN nasce com `users.view` e `users.manage`
  (`packages/db/src/permission-catalog.ts:42-50`).

**Transação e mock:**

- `apps/api/src/modules/orders/orders.service.ts:195` — o precedente de
  transação interativa (`prisma.$transaction(async (tx) => …)`) que já roda em
  produção, no Neon com pooler.
- `apps/api/src/test-utils/prisma-mock.ts:67-69` — o `$transaction` com
  callback chama o callback **com o próprio `prismaMock`** como `tx`:

  ```ts
  const transactionFn = vi.fn(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prismaMock)
  )
  ```

  `updateMany` devolve `{ count: 0 }` por padrão (`:24-25`) e `count` devolve
  `0` (`:23`). Ou seja: o padrão de `withSeat` funciona no mock sem mexer no
  test-utils, e os testes que já existem continuam vendo "sem contrato" sem
  configurar nada. `resetPrismaMock` (`:72-79`) limpa as chamadas do
  `$transaction` e mantém a implementação.
- `apps/api/src/modules/users/__tests__/users-routes.test.ts` (312 linhas) —
  `targetInCompany` (`:59-63`) faz o `findUnique` responder ao `authenticate` e
  ao lookup do alvo; os casos de vínculo de órfão estão em `:186-268`. O setup
  das rotas de empresa está em
  `apps/api/src/modules/companies/__tests__/companies-scope.test.ts:1-60`.
- `apps/api/vitest.config.ts` não define `RESEND_API_KEY`: nos testes, todo
  e-mail é pulado. Teste o envio mockando o módulo de e-mail.

**E-mail:** `apps/api/src/modules/auth/auth.service.ts:85-107` é o padrão:
sai sem enviar se não houver `RESEND_API_KEY`, `new Resend(...)`,
`resend.emails.send` dentro de `try/catch`, falha só registrada. `WEB_URL` em
`:72`. Nenhum helper de escape de HTML existe na API hoje.

**Banco:** `packages/db/prisma/schema.prisma:151-186` — `User`, com
`role Role @default(SALESPERSON)` e `active Boolean`; `Role` em `:18-22`
(SUPERADMIN, ADMIN, SALESPERSON). Não existe índice por `role`; a contagem por
empresa usa o prefixo `companyId` do `@@unique([companyId, idVendProt])`. A
migration mais recente é `20261014120000_intel_llm_calls`.

**Web:**

- `apps/web/src/components/users/UserFormModal.tsx` — props em `:28-39` (sem
  `seats`); o `catch` de `:131-133` só mostra `getApiErrorMessage`;
  `missingCompany` em `:139`; a caixa de aviso que serve de modelo visual em
  `:224-230`; o botão salvar em `:245`, com `disabled={missingCompany}`. O modal
  só fala com `/users` (`POST /users`, `PATCH /users/:id`). Também é usado em
  modo edição por `apps/web/src/app/(admin)/vendedores/page.tsx:156`.
- `apps/web/src/app/(admin)/users/page.tsx` — `useToggleUser` em `:41`; o botão
  Ativar/Desativar em `:161-168`, com `toggleUser.mutate(u.id)` em `:165`
  **sem `onError`**; o `PageHeader` em `:176-184`, com
  `subtitle="Vendedores, gerentes e administradores"`.
- `apps/web/src/hooks/useUsers.ts:32-41` — `useToggleUser`, sem `onError` e sem
  invalidar nada além de `['users']`. `useCreateUser` (`:15-30`) é código morto.
- `apps/web/src/lib/user-profile.ts:37-45` — `profileToPayload`: Gerente é
  `role: 'SALESPERSON'` + `intelManager: true` (`:42`). Gerente consome
  licença.
- `apps/web/src/components/layout/PageHeader.tsx:3` — `subtitle` é `string`.
- `apps/web/src/lib/api.ts:108-114` — `getApiErrorMessage` (o 013 acrescenta
  `getApiErrorCode` ao lado).
- `apps/web/src/components/ui/`: `Badge`, `Button`, `Card`, `FormField`/
  `FormSelect`, `Input`, `KpiCard`, `Modal`, `StatCard`, `StatusPill`, `Tabs`,
  `Textarea`. O `StatusPill` (`StatusPill.tsx:15`) só aceita `CustomerStatus`:
  para status de pedido use `Badge`.
- Barra de progresso de referência:
  `apps/web/src/app/(admin)/inteligencia/resultado/page.tsx:325-336`
  (`role="progressbar"`, trilha `bg-[var(--border)]`, preenchimento `bg-brand`).
- `onError` com toast, padrão a copiar:
  `apps/web/src/app/(admin)/inteligencia/perdas/page.tsx:105`.
- `NAV_GROUPS` em `apps/web/src/app/(admin)/layout.tsx:61-170`; grupo "Empresa"
  em `:133`.
- Testes do web são funções puras em `apps/web/src/lib/__tests__/*.test.ts`
  (ambiente `node`, sem render de componente).

**Fora do escopo, mas citado:** `apps/api/src/modules/users/users.schema.ts:3-14`
— o `createUserSchema` não declara os campos do vendedor, e o zod os descarta.
É o bug conhecido do "Novo usuário". **Não corrija aqui.**

### Vem do 013 e do 014 (conferir no Passo 0)

| Nome usado neste plano | Quem cria | O que tem que existir |
|---|---|---|
| `CompanyContract` | 013 | 1:1 com `Company` (`companyId` único), `status` (DRAFT, PENDING_ACCEPTANCE, ACTIVE, CANCELLED), `seatGuardVersion Int` |
| `ContractTerms` | 013 | `status` (PROPOSED, EFFECTIVE, WITHDRAWN), `origin` com o valor `LICENSE_REQUEST`, `effectiveFrom`, `proposedEffectiveFrom`, pacote, `licenseType`, `includedSeats`, `extraSeats`, `packagePrice`, `extraSeatPrice` (Decimal), motivo, autor |
| resolvedor de "termos atuais" | 013, `packages/types/src/billing.ts` | função pura: o EFFECTIVE com o maior `effectiveFrom <= agora`. Neste plano aparece como `currentTerms(...)`; use o nome real |
| `BillingSettings.notifyEmail` | 013 | e-mail da Addere que recebe os avisos |
| `BillingEvent` | 013 | tipo, autor (null = job), `payload` só com nomes de campos, `dedupeKey` |
| `AppError.code` | 013 | o `code` sai na resposta junto de `message` e `details` |
| `getApiErrorCode` | 013 | em `apps/web/src/lib/api.ts` |
| requisito `'companyAdmin'` | 013 | em `apps/web/src/lib/nav-gating.ts` (só o ADMIN, sem o SUPERADMIN) |
| grupo "Gestão Addere", layout `/gestao` com `<SuperAdminOnly>`, ficha `/gestao/clientes/[id]` com abas | 013 | — |
| `trustProxy` | 014 | em `apps/api/src/app.ts` (hoje `:34-38` não liga) |
| rotas `/billing/me/*`, guarda do ADMIN, `GET /billing/me` | 014 | o aceite também é só do ADMIN |
| helper de e-mail do billing e formatador de reais sem `Intl` | 014 | o 014 envia o contrato por e-mail e preenche `valores.*` |
| derivação de `intelligenceEnabled` a partir dos termos | 014 | usada no aceite |

## Esboço de tela

**`/plano` — Plano e cobrança (ADMIN), contrato ativo:**

```
Plano e cobrança
Seu contrato, suas licenças e os pedidos de licenças adicionais

┌ Seu plano ────────────────────────────┐ ┌ Licenças ────────────────────────┐
│ Pacote 20 · Com Inteligência          │ │ 20 de 22 em uso · 2 livres       │
│ Contrato ativo desde 03/11/2026       │ │ ████████████████████████░░░ 91 % │
│                                       │ │ Vendedores e gerentes ativos     │
│ Pacote (20 licenças)     R$ 2.400,00  │ │ ocupam licença; administradores  │
│ Adicionais 2 × R$ 99,00     R$ 198,00 │ │ não.                             │
│ ───────────────────────────────────── │ │                                  │
│ Total mensal             R$ 2.598,00  │ │      [ Solicitar mais licenças ] │
└───────────────────────────────────────┘ └──────────────────────────────────┘

Quem ocupa licença (20)                                       [ ver lista ▾ ]

Seus pedidos de licenças
Data         Quantidade   Valor por licença   Situação      Observação
12/11/2026   2            R$ 99,00 / mês      [Aprovado]    liberado em 13/11
02/12/2026   3            R$ 99,00 / mês      [Pendente]    —
```

**O medidor acima do limite** (redução de pacote, decisão padrão 5):

```
┌ Licenças ────────────────────────────────┐
│ 24 de 22 em uso · acima do limite        │
│ ████████████████████████████████  109 %  │
│ ⚠ Desative 2 vendedores ou gerentes para │
│   voltar a criar ou ativar.              │
└──────────────────────────────────────────┘
```

Sem contrato ativo, o lugar dos dois cartões mostra só: "Sua empresa ainda não
tem contrato ativo. Enquanto isso, não há limite de licenças." Com contrato
aguardando aceite, acrescenta o link "Ver contrato" (`/contrato`).

**Modal "Solicitar mais licenças":**

```
┌ Solicitar mais licenças ─────────────────────────────── ✕ ┐
│ Quantidade             [   2   ]                          │
│ Valor por licença      R$ 99,00 por mês                   │
│ Aumento mensal         R$ 198,00                          │
│ Mensagem (opcional)    [_____________________________]    │
│                                                           │
│ ┌───────────────────────────────────────────────────────┐ │
│ │ Ao enviar, você contrata 2 licenças adicionais a      │ │
│ │ R$ 99,00 por mês cada, cobradas a partir do mês       │ │
│ │ seguinte à liberação.                                 │ │
│ └───────────────────────────────────────────────────────┘ │
│                              [ Cancelar ] [ Enviar pedido ]│
└───────────────────────────────────────────────────────────┘
```

Com um pedido pendente, o botão "Solicitar mais licenças" fica desativado com
a frase "Você já tem um pedido em análise."

**`/users` — cabeçalho e modal no limite:**

```
Usuários
Vendedores, gerentes e administradores · Licenças 22/22      [ + Novo usuário ]

┌ Novo usuário ─────────────────────────────────────────── ✕ ┐
│ Nome      [______________________]                         │
│ E-mail    [______________________]                         │
│ Senha     [______________________]                         │
│ Perfil    [ Vendedor            ▾]                         │
│ … campos do vendedor …                                     │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ⚠ Sua empresa já usa 22 de 22 licenças. Vendedores e   │ │
│ │ gerentes ocupam licença; administradores não. Desative │ │
│ │ alguém ou solicite mais licenças →                     │ │
│ └────────────────────────────────────────────────────────┘ │
│                          [ Cancelar ] [ Criar usuário ]    │ ← desativado
└────────────────────────────────────────────────────────────┘
```

Com o perfil "Administrador", o aviso some e o botão volta a funcionar.

**`/gestao/solicitacoes` (SUPERADMIN):**

```
Solicitações de licenças
[ Pendentes (2) ]  [ Todas ]

Empresa           Pedido em      Por        Qtd  Valor/licença  Aumento/mês  Situação
Comercial Silva   02/12 14:10    Ana Lima   3    R$ 99,00       R$ 297,00    [Pendente]  [Aprovar] [Recusar]
Distribuidora XY  28/11 09:02    João Reis  1    R$ 120,00      R$ 120,00    [Recusado]  motivo: aguardar aditivo
```

"Aprovar" abre uma confirmação: "Aprovar libera N licenças agora e cria uma
nova versão dos termos (origem: pedido de licenças). A cobrança começa na
competência seguinte." com a declaração aceita, o IP e o início do hash.
"Recusar" abre um modal com o motivo, obrigatório.

**Aba Licenças da ficha `/gestao/clientes/[id]`:** o mesmo medidor, a lista
"Quem ocupa licença" (nome, e-mail, perfil Vendedor ou Gerente) e a tabela de
solicitações daquela empresa, com as mesmas ações.

## Quem acessa

| Rota ou tela | Quem | Guarda |
|---|---|---|
| `GET /billing/me/seats` | quem tem `users.manage` (o ADMIN por padrão) na própria empresa; SUPERADMIN com `?companyId=` | `requireAnyPermission('users.manage')` + `resolveTenant(request, reply, 'query')` |
| `GET /billing/me` (parte de licenças) | ADMIN | a guarda do ADMIN do 014 |
| `POST /billing/me/license-requests` | ADMIN da empresa | a guarda do ADMIN do 014 (nem SUPERADMIN, nem vendedor) |
| `GET /admin/billing/license-requests` | SUPERADMIN | `requireSuperAdmin` |
| `POST /admin/billing/license-requests/:id/decide` | SUPERADMIN | `requireSuperAdmin` |
| `/plano` | ADMIN | item com `requires: 'companyAdmin'` |
| `/gestao/solicitacoes`, aba Licenças | SUPERADMIN | grupo "Gestão Addere" e layout `/gestao` do 013 |
| contador e aviso em `/users` | ADMIN; SUPERADMIN com empresa ativa | — |

| Perfil | O que muda |
|---|---|
| ADMIN | No limite, não cria nem ativa vendedor ou gerente; vê o motivo e pede licenças pelo `/plano`. Criar outro ADMIN continua livre. |
| SUPERADMIN | Decide os pedidos; vê as licenças de qualquer cliente. Também é barrado pela trava (decisão de desenho 1). |
| Gerente e vendedor | Nada. Não veem `/plano`. |
| App mobile | Nada. O app não cria usuários. |

## Comandos que você vai precisar

| Para quê | Comando | Esperado quando dá certo |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Gerar o client | `npm run db:generate` | exit 0 (não precisa de banco) |
| Validar o schema | `cd packages/db && npx prisma validate` | "The schema … is valid" |
| Checar tipos | `npm run type-check` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Testes da API | `npm test --workspace=apps/api` | todos passam |
| Só os testes deste plano | `npm test --workspace=apps/api -- seat license` | os novos passam |
| Testes do web | `npm test --workspace=apps/web` | todos passam |
| Build da API | `npm run build:api` | exit 0 |
| Build do web | `npm run build:web` (exige `apps/web/.env.local`, cópia do `.env.local.example`) | exit 0 |
| Postgres local | `docker compose up -d db` | container `db` saudável |
| Bancos descartáveis | `docker compose exec db createdb -U addere_dev_user addere_015_clean` e `… addere_015_shadow` | exit 0 |
| Gerar o delta da migration | ver Passo 10 | só o SQL esperado |
| Validar a migration | ver Passo 10 | `migrate deploy` ok e `migrate diff --exit-code` sai com 0 |

## Escopo

**Dentro do escopo:**

- `packages/types/src/billing.ts` — regras puras e DTOs de licença (e o export
  em `packages/types/src/index.ts`, se o 013 não o fez)
- `apps/api/src/modules/billing/seat-guard.ts` (novo)
- `apps/api/src/modules/billing/seats.service.ts` (novo)
- `apps/api/src/modules/billing/license-requests.service.ts` e
  `license-requests.schema.ts` (novos)
- os arquivos de rotas do módulo `billing` que o 013 e o 014 criaram
  (`/admin/billing/*` e `/billing/me/*`) — só para registrar as rotas novas
- `apps/api/src/modules/billing/billing-mail.ts` — **só se** o 014 não tiver
  deixado um helper de e-mail no módulo
- `apps/api/src/middleware/require-company.ts` — **só se** o 014 não tiver
  deixado uma guarda de ADMIN para `/billing/me/*` (ver Passo 5)
- `apps/api/src/modules/users/users.service.ts` e `users.routes.ts`
- `apps/api/src/modules/companies/companies.service.ts`
- testes: `apps/api/src/modules/billing/__tests__/` (novos),
  `apps/api/src/modules/users/__tests__/users-routes.test.ts` (só acréscimos),
  `apps/api/src/modules/companies/__tests__/companies-users-seats.test.ts` (novo)
- `packages/db/prisma/schema.prisma` (enum `LicenseRequestStatus`, modelo
  `LicenseRequest` e os campos de relação em `Company`, `User` e
  `ContractTerms`)
- `packages/db/prisma/migrations/<timestamp>_billing_license_requests/migration.sql`
- web: `apps/web/src/lib/seats.ts` e `apps/web/src/lib/__tests__/seats.test.ts`
  (novos); os hooks do billing (o arquivo que o 013/014 criou em
  `apps/web/src/hooks/`, ou `useBilling.ts` novo); `apps/web/src/hooks/useUsers.ts`;
  `apps/web/src/components/billing/` (novos: `SeatMeter.tsx`,
  `LicenseRequestModal.tsx`, `LicenseRequestsTable.tsx`,
  `DecideLicenseRequestModal.tsx`); `apps/web/src/app/(admin)/plano/page.tsx`;
  `apps/web/src/app/(admin)/gestao/solicitacoes/page.tsx`; a aba Licenças da
  ficha do cliente (na pasta de abas que o 013 criou);
  `apps/web/src/app/(admin)/layout.tsx` (itens de menu);
  `apps/web/src/components/users/UserFormModal.tsx`;
  `apps/web/src/app/(admin)/users/page.tsx`
- `docs/billing/README.md` — seção "Licenças" (o arquivo vem do 013/014)

**Fora do escopo (NÃO toque):**

- Faturas, agendador e cobrança (016); bloqueio e inadimplência (017); painel
  `/gestao` (018).
- **Unificar os dois `createUser`** (`users.service.ts:58` e
  `companies.service.ts:272`). Os dois caminhos continuam separados; os dois
  ganham a trava. A unificação é pendência da segunda etapa.
- **O bug do `createUserSchema`** (`users.schema.ts:3-14`), que descarta os
  campos do vendedor no "Novo usuário". Não corrija, nem "de passagem":
  `git diff --stat` de `users.schema.ts` tem que sair vazio.
- `apps/mobile/**` — o app não cria usuários.
- `apps/api/src/modules/permissions/**` — conceder `intel.manager` não muda
  papel nem ativa ninguém.
- `packages/db/prisma/seed.ts` e `apps/api/scripts/seed-demo-tenant.ts` —
  scripts de operador; o tenant de demonstração não tem contrato.
- O fluxo de aceite do 014 (`/billing/me/documents/*`, modelos de contrato,
  `/contrato`).
- `useCreateUser` em `useUsers.ts:15-30` — é código morto, mas apagar arquivo ou
  função fica para quem decidir (regra do `CLAUDE.md`: nada se apaga sem
  confirmar).
- `apps/web/src/components/layout/PageHeader.tsx` — o `subtitle` continua
  `string`.
- E-mail ao ADMIN quando o pedido é decidido — o status aparece no `/plano`.

## Fluxo de git

- Branch: `advisor/015-limite-de-licencas`, a partir da `staging` atualizada
  depois do merge do 014: `git fetch origin && git switch -c advisor/015-limite-de-licencas origin/staging`.
- **Um commit por passo**, mensagens em português. Estilo:
  `types: regra de quem consome licença`, `api: trava de licenças`,
  `api: trava nos seis caminhos de usuário`, `api: leitura de licenças`,
  `api: pedido de licenças adicionais`, `web: plano e cobrança`,
  `web: limite de licenças no cadastro de usuário`,
  `web: solicitações de licenças na gestão`, `docs: licenças no billing`,
  `db: tabela de pedidos de licenças`.
- **A migration é commitada por último**, sozinha (Passo 10). A mudança do
  `schema.prisma` entra no commit do Passo 5, com o código que a usa.
- NÃO faça push nem abra PR a menos que quem despachou tenha mandado. Se mandar,
  o PR vai direto para `staging` (lição do incidente do #171 em
  `plans/README.md`).
- NÃO rode `eas build` nem `eas update`. Este plano nem toca `apps/mobile`.

> ⚠️ **NÃO rode `npm run db:migrate`, `prisma migrate dev`, `prisma migrate reset`
> nem `prisma db push`. NÃO copie `.env` para o worktree. NÃO conecte no Neon.**
> O `packages/db/.env` do checkout principal aponta para um banco real. A
> migration é gerada e validada só num Postgres local descartável (Passo 10).

## Passos

### Passo 0: Pré-condições (sem commit)

1. Confirme que o 013 e o 014 estão na `staging`: `ls plans/013* plans/014*` e
   `git log --oneline origin/staging | head -20`. Leia os dois planos inteiros.
2. Confira cada linha da tabela "Vem do 013 e do 014":
   - `grep -n "seatGuardVersion" packages/db/prisma/schema.prisma`
   - `grep -n "LICENSE_REQUEST" packages/db/prisma/schema.prisma`
   - `grep -n "notifyEmail" packages/db/prisma/schema.prisma`
   - `grep -n "code" apps/api/src/lib/errors.ts apps/api/src/lib/error-handler.ts`
   - `grep -n "getApiErrorCode" apps/web/src/lib/api.ts`
   - `grep -n "trustProxy" apps/api/src/app.ts`
   - `grep -n "companyAdmin" apps/web/src/lib/nav-gating.ts`
   - `ls apps/api/src/modules/billing/ packages/types/src/billing.ts`
3. Anote, para usar nos passos seguintes, os nomes reais: o resolvedor de termos
   atuais, o enum de status do contrato, os nomes dos campos de motivo e autor
   dos termos, a assinatura do `code` no `AppError`, a guarda do ADMIN, o helper
   de e-mail, o formatador de reais e a derivação de `intelligenceEnabled`.
4. Rode a checagem de deriva do topo.

**PARE** se faltar `seatGuardVersion`, o valor `LICENSE_REQUEST` em `origin`,
`AppError.code`, `getApiErrorCode`, o resolvedor de termos atuais ou o
`trustProxy`. Os outros itens têm alternativa descrita no passo em que
aparecem.

**Verificar**: todos os `grep` acima acham o que procuram.

### Passo 1: Regras puras compartilhadas

Em `packages/types/src/billing.ts` (o arquivo do 013), acrescente:

```ts
/** O que importa de um usuário para a licença, antes e depois de uma escrita. */
export interface SeatSubject {
  role: string
  active: boolean
  companyId: string | null
}

/** Vendedor ou gerente (SALESPERSON) ativo, dentro de uma empresa, ocupa licença. */
export function holdsSeat(u: SeatSubject): boolean {
  return !!u.companyId && u.active === true && u.role === 'SALESPERSON'
}

/** A escrita passa a ocupar uma licença que antes não ocupava, na mesma empresa? */
export function consumesSeat(before: SeatSubject | null, after: SeatSubject): boolean {
  if (!holdsSeat(after)) return false
  return !(before !== null && holdsSeat(before) && before.companyId === after.companyId)
}

export function seatLimit(terms: { includedSeats: number; extraSeats: number }): number {
  return terms.includedSeats + terms.extraSeats
}

/** "Perto do limite" — o medidor fica em alerta; o 018 usa o mesmo corte. */
export const SEAT_NEAR_LIMIT_RATIO = 0.9
```

Use `u.active === true` e `!!u.companyId` (não `!== null`): os mocks dos testes
existentes devolvem usuários sem `role` nem `active`, e eles têm de cair em
"não ocupa".

Acrescente também os DTOs:

- `SeatHolder` — `{ id, name, email, intelManager: boolean }`;
- `SeatUsage` — `{ contractStatus: <enum do 013> | null, enforced: boolean,
  used: number, limit: number | null, available: number | null,
  overLimit: boolean, holders: SeatHolder[] }`. `enforced` só é `true` com
  contrato ACTIVE; sem isso `limit` e `available` são `null`;
- `LicenseRequestStatus` — `'PENDING' | 'APPROVED' | 'REJECTED'`;
- `LicenseRequestDto` — `id`, `companyId`, `companyName`, `quantity`,
  `message`, `unitPriceShown` (string), `monthlyIncrease` (string, quantidade ×
  preço), `declarationText`, `status`, `requestedAt`, `requestedByName`,
  `decidedAt`, `decidedByName`, `decisionReason`, `resultingTermsId`, e os de
  auditoria `requestedIp` e `declarationSha256` (opcionais: só as rotas de
  superadmin preenchem).

E a frase da declaração:

```ts
export function licenseRequestDeclaration(quantity: number, unitPrice: string | number): string {
  const price = formatBrl(unitPrice)
  return quantity === 1
    ? `Ao enviar, você contrata 1 licença adicional a ${price} por mês, cobrada a partir do mês seguinte à liberação.`
    : `Ao enviar, você contrata ${quantity} licenças adicionais a ${price} por mês cada, cobradas a partir do mês seguinte à liberação.`
}
```

A forma do plural é o texto aprovado em 15/10/2026, palavra por palavra. A do
singular só faz a concordância.

`formatBrl` tem de dar **o mesmo texto no navegador e no Node**: sem `Intl`
(o `Intl` põe espaço não separável e varia com a versão do ICU). Se o 014 já
deixou um formatador de reais assim em `billing.ts`, use-o. Senão, crie
`formatBrl(value: string | number): string` ali: `Number(value).toFixed(2)`,
separador de milhar `.`, decimal `,`, prefixo `R$ ` com espaço comum. Exemplos:
`99` → `R$ 99,00`; `"2400.5"` → `R$ 2.400,50`.

**Testes** — `apps/api/src/modules/billing/__tests__/seat-rules.test.ts`
(o `packages/types` não tem suíte própria; as funções dele são testadas pelos
apps):

- `consumesSeat`, em tabela: criar vendedor → `true`; criar ADMIN → `false`;
  ativar vendedor → `true`; ativar ADMIN → `false`; desativar → `false`;
  ADMIN ativo vira vendedor → `true`; ADMIN **inativo** vira vendedor →
  `false`; editar vendedor que continua vendedor → `false`; vincular órfão
  vendedor ativo → `true`; vincular órfão inativo → `false`; `companyId: null`
  → `false`; objeto sem `role`/`active` → `false`.
- `seatLimit({ includedSeats: 100, extraSeats: 0 })` → 100 (Ilimitado com
  quantidade digitada não é infinito).
- `licenseRequestDeclaration(2, '99')` igual, byte a byte, à frase aprovada com
  `R$ 99,00`; `licenseRequestDeclaration(1, '120.5')` no singular com
  `R$ 120,50`; nenhum caractere ` ` no resultado.

**Verificar**: `npm run type-check && npm test --workspace=apps/api -- seat-rules` → exit 0.

### Passo 2: A trava (`seat-guard.ts`)

Crie `apps/api/src/modules/billing/seat-guard.ts`:

```ts
import { prisma } from '@addere/db'
import type { Prisma } from '@prisma/client'
import { consumesSeat, seatLimit, type SeatSubject } from '@addere/types'
import { AppError } from '../../lib/errors'

type Db = Prisma.TransactionClient

/** Fonte única de "quem ocupa licença": vendedor ou gerente ativo da empresa. */
export function countSeatHolders(db: Db, companyId: string): Promise<number> {
  return db.user.count({ where: { companyId, role: 'SALESPERSON', active: true } })
}

export async function withSeat<T>(companyId: string, write: (tx: Db) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // 1. Trava: o UPDATE prende a linha do contrato até o fim da transação
    const locked = await tx.companyContract.updateMany({
      where: { companyId },
      data: { seatGuardVersion: { increment: 1 } },
    })
    // Sem contrato: implantação, teste ou piloto — sem limite (decisão padrão 1)
    if (locked.count === 0) return write(tx)

    const contract = await tx.companyContract.findUnique({ where: { companyId } })
    if (contract!.status === 'CANCELLED') {
      throw new AppError(409, 'O contrato desta empresa foi cancelado: não é possível criar nem ativar vendedores ou gerentes.' /* code CONTRACT_CANCELLED */)
    }
    // DRAFT e PENDING_ACCEPTANCE: antes do aceite nada começa
    if (contract!.status !== 'ACTIVE') return write(tx)

    const effective = await tx.contractTerms.findMany({
      where: { contractId: contract!.id, status: 'EFFECTIVE' },
    })
    const current = currentTerms(effective, new Date()) // resolvedor do 013
    if (!current) throw new Error(`Contrato ${contract!.id} ACTIVE sem termos vigentes`)

    const limit = seatLimit(current)
    const used = await countSeatHolders(tx, companyId)
    if (used >= limit) {
      throw new AppError(
        409,
        `Limite de licenças atingido: ${used} de ${limit} em uso. Desative um vendedor ou gerente, ou peça mais licenças em Plano e cobrança.`,
        { used, limit }
        /* code SEAT_LIMIT_REACHED */
      )
    }
    return write(tx)
  })
}

/** Só entra na trava a escrita que passa a ocupar uma licença. */
export function writeWithSeatGuard<T>(
  before: SeatSubject | null,
  after: SeatSubject,
  write: (db: Db) => Promise<T>
): Promise<T> {
  return after.companyId && consumesSeat(before, after)
    ? withSeat(after.companyId, write)
    : write(prisma)
}
```

Ajuste ao que o Passo 0 anotou: a assinatura do `code` no `AppError`, o nome do
resolvedor, a chave dos termos (`contractId` ou `companyId`, como o 013
modelou) e o enum de status. Passe o `code` de verdade — `CONTRACT_CANCELLED` e
`SEAT_LIMIT_REACHED` —, não deixe em comentário.

Contrato ACTIVE sem termos vigentes é invariante quebrada (o aceite do 014 cria
os termos na mesma transação): o `Error` genérico vira 500 e vai para o Sentry.
Não trate como "sem limite".

**Por que o `updateMany` serializa as escritas** (copie este raciocínio num
comentário curto no topo do arquivo):

- `updateMany` vira um `UPDATE … SET "seatGuardVersion" = "seatGuardVersion" + 1
  WHERE "companyId" = $1`. Todo `UPDATE` no Postgres prende a linha que altera
  até o fim da transação.
- Uma segunda transação da mesma empresa chega no mesmo `UPDATE` e **espera**
  a primeira terminar (commit ou rollback).
- No READ COMMITTED — o padrão do Postgres e do Neon, e o que o Prisma usa
  quando não se passa `isolationLevel` —, cada comando enxerga o que já estava
  confirmado no instante em que começa. Quando a segunda transação é liberada,
  o `count` que ela roda em seguida é um comando novo: enxerga o vendedor que a
  primeira acabou de gravar. Com 19 de 20, a primeira conta 19 e grava; a
  segunda conta 20 e recusa.
- **Por que não SERIALIZABLE**: a garantia não vem do snapshot da transação,
  vem da fila na linha do contrato. Em SERIALIZABLE (ou REPEATABLE READ) a
  segunda transação, ao ser liberada, falharia com erro de serialização
  ("could not serialize access due to concurrent update") e precisaria de
  retry. Seria pior, não melhor.
- **Por que não SQL cru**: o jeito clássico seria `SELECT … FOR UPDATE`, que o
  Prisma só faz por `$queryRaw`. O `UPDATE` de um contador cumpre o mesmo papel
  com a API normal. O campo `seatGuardVersion` existe só para isso.
- **A ordem é obrigatória**: (1) `updateMany`, (2) ler contrato e termos,
  (3) contar, (4) escrever — tudo com o mesmo `tx`. Contar antes da trava, ou
  escrever com `prisma` em vez de `tx`, desfaz a garantia.
- A trava só prende a linha do contrato **daquela** empresa: empresas
  diferentes não esperam umas pelas outras. Sem contrato não há linha para
  prender — e também não há limite, então não há corrida a evitar.
- O `bcrypt` roda **antes** da transação (já é assim nos dois `createUser` e no
  `updateUser`; não mova para dentro do `write`). Nada de rede — e-mail,
  Protheus — dentro da transação. A trava dura milissegundos e cabe com folga
  no timeout padrão da transação interativa (5 s).

**Testes** — `apps/api/src/modules/billing/__tests__/seat-guard.test.ts`, com
`vi.mock('@addere/db', …mockDb())` e um `write = vi.fn(async () => 'ok')`.
Configure o contrato com `prismaMock.companyContract.updateMany`/`findUnique`,
os termos com `prismaMock.contractTerms.findMany` e a contagem com
`prismaMock.user.count`. Contrato `ACTIVE` com termos EFFECTIVE `includedSeats:
20`, `extraSeats: 2` (limite 22), salvo quando o caso diz outro:

| Caso | Montagem | Esperado |
|---|---|---|
| sem contrato | `updateMany` → `{ count: 0 }` | `write` chamado; `user.count` **não** chamado |
| contrato em rascunho | status `DRAFT`, `count` 500 | `write` chamado |
| contrato aguardando aceite | status `PENDING_ACCEPTANCE`, `count` 500 | `write` chamado |
| contrato cancelado | status `CANCELLED` | 409, `code: 'CONTRACT_CANCELLED'`; `write` não chamado |
| limite − 1 | `count` 21 | `write` chamado |
| no limite | `count` 22 | 409, `code: 'SEAT_LIMIT_REACHED'`, `details: { used: 22, limit: 22 }`; `write` não chamado |
| acima do limite (redução) | `count` 24 | 409 `SEAT_LIMIT_REACHED`; nenhum `user.update`/`updateMany` (ninguém é desativado) |
| Ilimitado com quantidade digitada | termos do pacote Ilimitado, `includedSeats: 100`, `extraSeats: 0`; `count` 99 e depois 100 | passa; depois 409 |
| termos futuros não contam | dois EFFECTIVE: o atual (20 + 0) e um com `effectiveFrom` amanhã (30 + 0); `count` 20 | 409 com `limit: 20` |
| termos do pedido aprovado contam na hora | dois EFFECTIVE: o antigo (20 + 0) e um `LICENSE_REQUEST` com `effectiveFrom` = agora − 1 min (20 + 2); `count` 21 | `write` chamado |
| a consulta só pede EFFECTIVE | qualquer contrato ACTIVE | `contractTerms.findMany` chamado com `where.status === 'EFFECTIVE'` |
| ordem da trava | qualquer contrato ACTIVE | `invocationCallOrder` do `updateMany` menor que o do `user.count`, que é menor que o do `write` |
| `writeWithSeatGuard` sem consumo | `before` = vendedor ativo, `after` = o mesmo | `$transaction` não chamado; `write` recebe o `prismaMock` |

**Verificar**: `npm test --workspace=apps/api -- seat-guard` → todos passam;
`grep -rnE "queryRaw|executeRaw|isolationLevel|FOR UPDATE" apps/api/src/modules/billing/seat-guard.ts`
→ nada.

### Passo 3: A trava nos seis caminhos e os `catch` de `users.routes.ts`

Use `writeWithSeatGuard` nos seis pontos. O `write` sempre recebe `db` e escreve
com ele (`db.user.create`, `db.user.update`), nunca com `prisma`.

1. **`users.service.ts` `createUser`** (`:58`): o `bcrypt` de `:62` fica onde
   está. Troque o `prisma.user.create` de `:69` por
   `writeWithSeatGuard(null, { role: input.role, active: true, companyId }, (db) => db.user.create({...}))`.
   As permissões (`copyUserPermissions`, `applyDefaultPermissions`,
   `grantPermissions`) continuam depois, fora da transação, como hoje.
2. **`companies.service.ts` `createUser`** (`:272`): o mesmo, com
   `{ role: input.role, active: true, companyId }`. `assertValidManager` e o
   `bcrypt` continuam antes.
3. **`users.service.ts` `toggleUserActive`** (`:96`): mantenha o
   `refreshToken.deleteMany` da desativação como está e troque o `update` de
   `:106` por `writeWithSeatGuard(user, { ...user, active: !user.active }, (db) => db.user.update({...}))`.
4. **`companies.service.ts` `toggleUserActive`** (`:305`): o mesmo, com
   `writeWithSeatGuard(exists, { ...exists, active }, …)`.
5. **`companies.service.ts` `updateUser`** (`:329`): o `bcrypt` de `:344` fica
   antes. **Mova** o `refreshToken.deleteMany` de `:346-350` para dentro do
   `write` (decisão de desenho 6):

   ```ts
   return writeWithSeatGuard(exists, { ...exists, role: input.role ?? exists.role }, async (db) => {
     if (sensitiveChange) await db.refreshToken.deleteMany({ where: { userId: id } })
     return db.user.update({ where: { id }, data, select: { … } })
   })
   ```

   Isso cobre também o `PATCH /users/:id`, que delega para cá
   (`users.service.ts:151`).
6. **`users.service.ts` vínculo de órfão** (`:133-144`): amplie o `select` de
   `:120` para `{ companyId: true, role: true, active: true }` e troque o
   `update` de `:142` por
   `writeWithSeatGuard(target, { role: input.role ?? target.role, active: target.active, companyId }, (db) => db.user.update({ where: { id }, data: { companyId } }))`.
   O papel final (`input.role ?? target.role`) decide: um órfão vendedor que
   vira ADMIN na mesma requisição não precisa de licença.

Depois, em `apps/api/src/modules/users/users.routes.ts`, importe `AppError` de
`../../lib/errors` e, nos três `catch` (`:62`, `:91` e `:110`), repasse o
`AppError` antes do mapeamento antigo:

```ts
} catch (err) {
  // AppError (SEAT_LIMIT_REACHED, CONTRACT_CANCELLED, 404 e 422 dos services)
  // segue para o handler global com status, code e details. Só o Error
  // genérico mantém o mapeamento antigo.
  if (err instanceof AppError) throw err
  return reply.status(409).send({ message: (err as Error).message })
}
```

No `PATCH /users/:id`, o `ForbiddenError` (que é `Error`, não `AppError`)
continua virando 403. Efeito colateral esperado: o 422 "Gerente inválido" deixa
de sair como 404.

**Testes de rota** — acrescente um `describe('trava de licenças', …)` em
`users-routes.test.ts` e crie
`apps/api/src/modules/companies/__tests__/companies-users-seats.test.ts`
copiando o setup de `companies-scope.test.ts:1-60`. Num `beforeEach` local,
monte contrato ACTIVE com limite 22 e `prismaMock.user.count` = 22 (no limite).
**Não altere nenhuma asserção dos testes que já existem**; os casos deles
continuam passando porque, sem configurar o contrato, o mock responde "sem
contrato".

| Caso | Requisição | Esperado |
|---|---|---|
| caminho 1 no limite | `POST /users`, ADMIN, perfil vendedor | 409, `code: 'SEAT_LIMIT_REACHED'`, `details: { used: 22, limit: 22 }`; `user.create` não chamado |
| caminho 1, ADMIN é grátis | `POST /users`, SUPERADMIN, `role: 'ADMIN'`, `companyId` | 201; `companyContract.updateMany` não chamado |
| caminho 1, limite − 1 | `count` 21 | 201 |
| caminho 2 no limite | `POST /companies/:id/users`, ADMIN da empresa, vendedor | 409 com o `code` |
| caminho 2, contrato cancelado | status `CANCELLED` | 409, `code: 'CONTRACT_CANCELLED'` |
| caminho 2, contrato aguardando aceite | status `PENDING_ACCEPTANCE`, `count` 500 | 201 |
| caminho 3, reativação no limite | `PATCH /users/:id/active`, alvo vendedor inativo | 409 com o `code` |
| caminho 3, reativação abaixo | `count` 21 | 200 |
| caminho 3, desativar no limite | alvo vendedor ativo | 200; `companyContract.updateMany` não chamado |
| caminho 4, reativação no limite | `PATCH /companies/:id/users/:userId/active` `{ active: true }` | 409 com o `code` |
| caminho 5, ADMIN para vendedor | `PATCH /companies/:id/users/:userId` `{ role: 'SALESPERSON' }`, alvo ADMIN ativo | 409; `refreshToken.deleteMany` **não** chamado |
| caminho 5 pela rota global | `PATCH /users/:id` `{ role: 'SALESPERSON', intelManager: true }`, alvo ADMIN ativo | 409 com o `code` (prova que o `catch` repassa) |
| caminho 6, órfão | `PATCH /users/:id` com `companyId`, alvo órfão vendedor ativo, SUPERADMIN | 409; `user.update` não chamado |
| caminho 6, órfão inativo | o mesmo com alvo inativo | 200 |

**Verificar**: `npm run type-check && npm test --workspace=apps/api` → exit 0;
`git diff 80fe328 -- apps/api/src/modules/users/__tests__/users-routes.test.ts | grep "^-[^-]"`
→ nada (só acréscimos); `grep -rn "writeWithSeatGuard" apps/api/src/modules/users apps/api/src/modules/companies`
→ exatamente 6 chamadas.

### Passo 4: Leitura das licenças

Crie `apps/api/src/modules/billing/seats.service.ts` com
`getSeatUsage(companyId): Promise<SeatUsage>`:

- contrato (`findUnique` por `companyId`) e, se ACTIVE, os termos atuais pelo
  mesmo resolvedor do Passo 2;
- `used` por `countSeatHolders(prisma, companyId)` — a mesma função da trava;
- `holders`: os `SALESPERSON` ativos (`id`, `name`, `email`), ordenados por
  nome, com `intelManager` pela mesma consulta de `users.service.ts:45-49`;
- `enforced` = contrato ACTIVE; `limit` = `seatLimit(termos)`;
  `available` = `max(limit − used, 0)`; `overLimit` = `used > limit`.

Rotas, nos arquivos de rotas do billing do 013/014 (não crie outro prefixo):

- `GET /billing/me/seats` — preHandler `requireAnyPermission('users.manage')`;
  a empresa sai de `resolveTenant(request, reply, 'query')`. Assim o SUPERADMIN
  lê qualquer empresa com `?companyId=` (a empresa ativa da barra lateral) e o
  ADMIN lê só a dele.
- `GET /billing/me` (do 014) ganha `seats: SeatUsage` e
  `licenseRequests: LicenseRequestDto[]` (os 20 mais recentes da empresa — este
  segundo campo entra no Passo 5, quando o modelo existir). O cartão do plano
  usa os termos que o `GET /billing/me` já devolve: pacote, tipo,
  `includedSeats`, `extraSeats`, `packagePrice`, `extraSeatPrice` e o total
  mensal (`packagePrice + extraSeats × extraSeatPrice`, pela função do 013).
  Se o 014 não devolver algum desses, acrescente com o nome que ele usa para o
  resto. Se o `GET /billing/me` não existir, **PARE**: ele é do 014.

**Testes** — `apps/api/src/modules/billing/__tests__/seats-routes.test.ts`:

- ADMIN, contrato ACTIVE 20 + 2, 20 ativos → `{ enforced: true, used: 20,
  limit: 22, available: 2, overLimit: false }`;
- acima do limite: 24 ativos, limite 22 → `overLimit: true`, `available: 0`;
- sem contrato → `enforced: false`, `limit: null`;
- contrato aguardando aceite → `enforced: false`;
- SUPERADMIN sem `companyId` → 400; com `companyId` → 200;
- ADMIN pedindo `?companyId=` de outra empresa → 403;
- vendedor sem `users.manage` → 403.

**Verificar**: `npm test --workspace=apps/api -- seats` → passam.

### Passo 5: Pedido de licenças adicionais (`LicenseRequest`)

**5.1 Schema.** Em `packages/db/prisma/schema.prisma`, junto dos modelos do
billing do 013:

```prisma
enum LicenseRequestStatus {
  PENDING  // aguardando o superadmin
  APPROVED // virou termos EFFECTIVE (origin LICENSE_REQUEST)
  REJECTED // recusado, com motivo
}

// Pedido de licenças do ADMIN (plano 015). A declaração aceita é o aceite:
// aprovado, vira termos na hora, sem aditivo.
model LicenseRequest {
  id                 String               @id @default(uuid())
  quantity           Int
  message            String?              // texto livre do ADMIN, até 500 caracteres
  unitPriceShown     Decimal              @db.Decimal(14, 2) // preço por licença mostrado no modal
  declarationText    String               // a frase exata que o ADMIN viu
  declarationSha256  String               // SHA-256 (hex) de declarationText
  requestedByName    String               // congelado no pedido, como no aceite do contrato
  requestedByEmail   String
  requestedIp        String?
  requestedUserAgent String?
  status             LicenseRequestStatus @default(PENDING)
  decidedAt          DateTime?
  decisionReason     String?              // obrigatório na recusa
  createdAt          DateTime             @default(now())
  updatedAt          DateTime             @updatedAt

  companyId        String
  company          Company        @relation(fields: [companyId], references: [id])
  requestedById    String
  requestedBy      User           @relation("LicenseRequestRequester", fields: [requestedById], references: [id])
  decidedById      String?
  decidedBy        User?          @relation("LicenseRequestDecider", fields: [decidedById], references: [id])
  resultingTermsId String?        @unique
  resultingTerms   ContractTerms? @relation(fields: [resultingTermsId], references: [id])

  @@index([companyId, status])
  @@index([status, createdAt])
  @@map("billing_license_requests")
}
```

Acrescente os campos de relação do outro lado: `licenseRequests
LicenseRequest[]` em `Company`; `licenseRequestsMade LicenseRequest[]
@relation("LicenseRequestRequester")` e `licenseRequestsDecided
LicenseRequest[] @relation("LicenseRequestDecider")` em `User`;
`licenseRequest LicenseRequest?` em `ContractTerms`. Se o 013 usou outro padrão
de nome de tabela no billing (outro prefixo no `@@map`), siga o dele e registre
no relatório.

Se `BillingEvent.type` for um enum, acrescente os valores
`LICENSE_REQUEST_CREATED`, `LICENSE_REQUEST_APPROVED` e
`LICENSE_REQUEST_REJECTED`. Se for `String`, crie as constantes onde o 013
guarda as outras.

Rode `npm run db:generate`. **Não gere a migration agora** — ela é o Passo 10.

**5.2 Validação.** `apps/api/src/modules/billing/license-requests.schema.ts`:

- `createLicenseRequestSchema`: `quantity: z.number().int().min(1).max(100)`,
  `message: z.string().trim().max(500).optional()`,
  `unitPriceShown: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/)`;
- `decideLicenseRequestSchema`: `z.discriminatedUnion('decision', [...])` com
  `{ decision: 'APPROVE' }` e `{ decision: 'REJECT', reason: z.string().trim().min(3).max(500) }`;
- `listLicenseRequestsQuerySchema`: `status` opcional (o enum) e `companyId`
  opcional (uuid).

**5.3 Criar — `POST /billing/me/license-requests`.** Guarda: a do ADMIN do 014
(só `role === 'ADMIN'` com `companyId`). Se não houver uma, crie
`requireCompanyAdmin()` em `apps/api/src/middleware/require-company.ts`, ao lado
de `requireCompanyScope`: `authenticate`, depois 403
`Acesso restrito ao administrador da empresa` se o papel não for ADMIN ou não
houver `companyId`.

`createLicenseRequest(requester, body, { ip, userAgent })`, em
`license-requests.service.ts`:

1. Numa transação, faça primeiro a **mesma trava** do Passo 2
   (`companyContract.updateMany` com `increment`). Ela serializa dois pedidos
   simultâneos da mesma empresa.
2. Contrato ausente ou fora de ACTIVE → 409 `CONTRACT_NOT_ACTIVE`: "Sua
   empresa ainda não tem contrato ativo: não há limite de licenças para
   ampliar."
3. Termos atuais pelo resolvedor do 013. Se
   `!new Prisma.Decimal(body.unitPriceShown).equals(current.extraSeatPrice)` →
   409 `LICENSE_PRICE_CHANGED`, `details: { unitPrice: current.extraSeatPrice.toString() }`,
   mensagem "O valor por licença mudou. Confira o novo valor antes de enviar."
4. Pedido PENDING da empresa → 409 `LICENSE_REQUEST_PENDING`: "Você já tem um
   pedido de licenças em análise."
5. `declarationText = licenseRequestDeclaration(body.quantity, current.extraSeatPrice.toString())`;
   `declarationSha256 = createHash('sha256').update(declarationText, 'utf8').digest('hex')`
   (`node:crypto`).
6. Grave o `LicenseRequest` com nome e e-mail do requerente lidos do banco,
   `requestedIp: request.ip` (com o `trustProxy` do 014, é o IP do cliente),
   `requestedUserAgent` = cabeçalho `user-agent` cortado em 512 caracteres, e um
   `BillingEvent` `LICENSE_REQUEST_CREATED` com autor = o ADMIN e
   `payload: { licenseRequestId }`.
7. **Depois** da transação, o e-mail (5.5). Responda 201 com o DTO.

**5.4 Listar e decidir (SUPERADMIN).**

- `GET /admin/billing/license-requests?status=&companyId=` — DTOs com nome da
  empresa, quem pediu, quem decidiu e os campos de auditoria (`requestedIp`,
  `declarationSha256`), do mais novo para o mais antigo, `take: 200`.
- `POST /admin/billing/license-requests/:id/decide` —
  `decideLicenseRequest(id, body, actor)`, numa transação só:
  1. lê o pedido; inexistente → 404 "Pedido não encontrado";
  2. faz a trava da empresa do pedido (`companyContract.updateMany` com
     `increment`) — serializa com a trava de licenças e com outra decisão;
  3. **REJECT**: `licenseRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'REJECTED', decidedAt, decidedById, decisionReason } })`;
     `count === 0` → 409 `LICENSE_REQUEST_ALREADY_DECIDED`; `BillingEvent`
     `LICENSE_REQUEST_REJECTED`;
  4. **APPROVE**:
     - contrato fora de ACTIVE → 409 `CONTRACT_NOT_ACTIVE`;
     - existe termo PROPOSED no contrato → 409 `AMENDMENT_PENDING`: "Há um
       aditivo em andamento. Aprove depois do aceite do aditivo, ou cancele o
       aditivo antes." (decisão de desenho 3);
     - termos atuais com `extraSeatPrice` diferente de `unitPriceShown` → 409
       `LICENSE_PRICE_CHANGED`;
     - cria os termos novos: copie todos os campos de valor dos termos atuais
       (pacote, `licenseType`, `includedSeats`, `packagePrice`,
       `extraSeatPrice` e o que mais o 013 tiver), mudando só
       `extraSeats: current.extraSeats + quantity`, `status: 'EFFECTIVE'`,
       `origin: 'LICENSE_REQUEST'`, `effectiveFrom: agora`,
       `proposedEffectiveFrom: null`, motivo `Pedido de licenças <id>` e autor =
       o superadmin;
     - `licenseRequest.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'APPROVED', decidedAt, decidedById, resultingTermsId } })`;
       `count === 0` → 409 `LICENSE_REQUEST_ALREADY_DECIDED` (desfaz tudo);
     - grava `Company.intelligenceEnabled` pela derivação do 014 sobre os termos
       novos (o tipo não muda, mas a regra do plano aprovado é gravar o campo na
       mesma transação dos termos);
     - `BillingEvent` `LICENSE_REQUEST_APPROVED`,
       `payload: { licenseRequestId, termsId, fields: ['extraSeats'] }`.
  5. responde com o DTO atualizado.

`effectiveFrom = agora` faz o limite subir na hora, e o 016 cobra pelos termos
vigentes no **início** de cada competência — então as licenças entram na
cobrança a partir do mês seguinte, como a declaração promete.

**5.5 E-mail para a Addere.** Use o helper de e-mail do 014. Se não houver um,
crie `apps/api/src/modules/billing/billing-mail.ts` com
`sendBillingMail({ to, subject, html })` no padrão de `auth.service.ts:85-107`
(sem `RESEND_API_KEY`, só `console.warn`; envio em `try/catch`; falha vai para
`captureError`, nunca para a resposta) e um `escapeHtml` local.

- Para: `BillingSettings.notifyEmail`. Vazio → não envia e registra um aviso; o
  pedido continua criado e aparece em `/gestao/solicitacoes`.
- Assunto: `Pedido de N licença(s) — <empresa>`.
- Corpo, com **todo** valor dinâmico escapado: empresa; nome e e-mail de quem
  pediu; quantidade; valor por licença; aumento mensal; a declaração aceita; a
  mensagem; botão "Abrir solicitações" para `${WEB_URL}/gestao/solicitacoes`.
  Sem IP no e-mail.

**5.6 `GET /billing/me`** ganha `licenseRequests` (Passo 4).

**Testes** — `apps/api/src/modules/billing/__tests__/license-requests.test.ts`,
com `vi.mock` do módulo de e-mail:

- criar: ADMIN, contrato ACTIVE, `extraSeatPrice` 99 → 201; o `create` recebe
  `declarationText` igual a `licenseRequestDeclaration(2, '99')`,
  `declarationSha256` igual ao SHA-256 dele, `requestedIp` do cabeçalho
  encaminhado (use o mesmo cabeçalho do teste de `trustProxy` do 014) e o
  `user-agent` cortado em 512; `BillingEvent` gravado; e-mail chamado com o
  `notifyEmail`;
- `notifyEmail` vazio → 201 e e-mail não chamado; e-mail que lança → 201;
- sem contrato, `DRAFT`, `PENDING_ACCEPTANCE` e `CANCELLED` → 409
  `CONTRACT_NOT_ACTIVE`;
- `unitPriceShown` diferente do atual → 409 `LICENSE_PRICE_CHANGED` com
  `details.unitPrice`;
- pedido pendente → 409 `LICENSE_REQUEST_PENDING`;
- SUPERADMIN e vendedor → 403; `quantity` 0 ou 101, mensagem com 501
  caracteres → 400;
- **aprovação de pedido criando termos**: `contractTerms.create` recebe
  `status: 'EFFECTIVE'`, `origin: 'LICENSE_REQUEST'`, `extraSeats` = antigo + N,
  `includedSeats`, `packagePrice` e `extraSeatPrice` iguais aos atuais e
  `effectiveFrom` ≈ agora; o pedido vai a APPROVED com `resultingTermsId`;
  `BillingEvent` gravado; `company.update` grava `intelligenceEnabled`;
- segunda decisão → 409 `LICENSE_REQUEST_ALREADY_DECIDED`, sem `create`;
- preço mudou entre o pedido e a aprovação → 409 `LICENSE_PRICE_CHANGED`;
- termo PROPOSED no contrato → 409 `AMENDMENT_PENDING`;
- recusa sem motivo → 400; com motivo → REJECTED e `decisionReason` gravado,
  sem termos;
- ADMIN chamando `decide` ou a listagem → 403.

**Verificar**: `npm run db:generate && npm run type-check && npm test --workspace=apps/api` → exit 0.

### Passo 6: Web — `/plano` v1

1. **Hooks**, no arquivo de hooks do billing do 013/014 (ou
   `apps/web/src/hooks/useBilling.ts` novo), com chaves sob `['billing', …]`:
   `useSeats(companyId?: string | null)` (desligado para o SUPERADMIN sem
   empresa ativa), `useBillingMe()` (se o 014 não tiver criado),
   `useCreateLicenseRequest()`, `useLicenseRequests(filters)` e
   `useDecideLicenseRequest()`. As mutações invalidam `['billing']`.
2. **`apps/web/src/lib/seats.ts`** (puro):
   - `seatsSubtitle(seats)` → `null` sem `enforced`; `Licenças 20/22`; acima do
     limite, `Licenças 24/22 · acima do limite`;
   - `seatMeterTone(seats)` → `'brand'` abaixo de `SEAT_NEAR_LIMIT_RATIO`,
     `'warning'` a partir dele, `'danger'` no limite ou acima;
   - `seatBlocksSave(seats, before, after)` → `true` só com `enforced`,
     `consumesSeat(before, after)` e `used >= limit`.
3. **`components/billing/SeatMeter.tsx`**: a barra de
   `inteligencia/resultado/page.tsx:325-336` (`role="progressbar"`, largura
   presa em 100 %), cor de preenchimento por `seatMeterTone` com as classes
   `bg-brand`/`bg-warning`/`bg-danger`, a linha "20 de 22 em uso · 2 livres" e,
   acima do limite, o aviso "Desative N vendedores ou gerentes para voltar a
   criar ou ativar." com o ícone `AlertTriangle`.
4. **`components/billing/LicenseRequestModal.tsx`**: `Modal`, `FormField` para
   a quantidade (1 a 100), `Textarea` para a mensagem, o valor por licença e o
   aumento mensal formatados por `formatBrl`, a declaração dentro de um bloco
   destacado, sempre gerada por `licenseRequestDeclaration(quantity,
   extraSeatPrice)`. Envia `{ quantity, message, unitPriceShown: extraSeatPrice }`.
   No `catch`, `LICENSE_PRICE_CHANGED` mostra a mensagem e recarrega o
   `GET /billing/me`, para o modal passar a mostrar o preço novo;
   `LICENSE_REQUEST_PENDING` fecha o modal com a mensagem.
5. **`components/billing/LicenseRequestsTable.tsx`**: `Table` com data,
   quantidade, valor por licença, situação em `Badge` (Pendente `warning`,
   Aprovado `success`, Recusado `danger`) e observação (data da liberação ou o
   motivo). Prop opcional de ações, usada no Passo 8.
6. **`app/(admin)/plano/page.tsx`** — "Plano e cobrança", conforme o esboço:
   cartão do plano (`Card`), medidor, botão "Solicitar mais licenças" (só com
   contrato ACTIVE; desativado com pedido pendente), "Quem ocupa licença"
   recolhível com os `holders`, e "Seus pedidos de licenças". Sem contrato
   ativo, a frase do esboço; com contrato aguardando aceite, o link para
   `/contrato`. Gate de página: o mesmo que o 014 usou em `/contrato`.
   **Se o `/plano` já existir** (o 016 pode ter chegado antes, com a tabela de
   faturas), acrescente estes blocos acima das faturas, sem mexer nelas.
7. **Menu**: em `NAV_GROUPS`, grupo "Empresa" (`layout.tsx:133`), o item
   `{ href: '/plano', label: 'Plano e cobrança', match: (p) => p.startsWith('/plano'), icon: CreditCard, requires: 'companyAdmin' }`.

Sem cor fixa: só classes da marca e tokens `var(--…)`. Ícones só do
`lucide-react`. Espaçamentos múltiplos de 4.

**Verificar**: `npm run type-check && npm run lint && npm test --workspace=apps/web` → exit 0.

### Passo 7: Web — limite no cadastro de usuário

1. **`UserFormModal.tsx`**: nova prop opcional `seats?: SeatUsage | null`.
   Calcule:
   - `before` = no modo `edit`, `{ role: user.role, active: user.active, companyId: user.companyId ?? null }`;
     em `create` e `copy`, `null`;
   - `after` = `{ role: profileToPayload(profile).role, active: mode === 'edit' ? user.active : true, companyId: orphan ? companyId : (mode === 'edit' ? user.companyId ?? null : companyId) }`;
   - `seatBlocked = seatBlocksSave(seats, before, after)`.

   Com `seatBlocked`, mostre o aviso do esboço no estilo da caixa de
   `:224-230`. Para o ADMIN, "solicite mais licenças" é um link para `/plano`;
   para o SUPERADMIN, a frase termina em "Ajuste o contrato em Gestão Addere ›
   Clientes."; para quem não é nenhum dos dois, sem link. O botão de `:245`
   passa a `disabled={missingCompany || seatBlocked}`. Como o perfil é
   observado (`watch('profile')`), trocar para "Administrador" tira o aviso e
   libera o botão.

   No `catch` de `:131-133`: se `getApiErrorCode(err)` for
   `SEAT_LIMIT_REACHED` ou `CONTRACT_CANCELLED`, mostre a mensagem da API
   (`toast.error`), marque um estado local `seatRefused` que exibe o aviso e
   desativa o salvar, e invalide `['billing', 'seats']`. É o caso do outro ADMIN
   que ocupou a última licença enquanto o modal estava aberto. Os outros erros
   seguem como hoje.
2. **`users/page.tsx`**: `const { data: seats } = useSeats(isSuperAdmin ? companyId : undefined)`.
   - Subtítulo: `['Vendedores, gerentes e administradores', seatsSubtitle(seats)].filter(Boolean).join(' · ')`.
   - Passe `seats` ao `UserFormModal`.
   - Em `:165`: `toggleUser.mutate(u.id, { onError: (err) => toast.error(getApiErrorMessage(err, 'Erro ao alterar o usuário.')) })`,
     no padrão de `inteligencia/perdas/page.tsx:105`. É necessário porque a
     reativação acima do limite agora falha, e hoje a mutação não tem
     `onError`: o clique não daria retorno nenhum.
3. **`hooks/useUsers.ts`**: `useToggleUser` invalida também
   `['billing', 'seats']` no sucesso.
4. `vendedores/page.tsx` **não** muda: ele só edita vendedores existentes, que
   não consomem licença nova; se algo consumir, a API recusa e o `catch` novo
   mostra o motivo.

**Testes** — `apps/web/src/lib/__tests__/seats.test.ts`:

- `seatsSubtitle`: sem `enforced` → `null`; 20/22 → `Licenças 20/22`; 24/22 →
  com "acima do limite";
- `seatMeterTone`: 15/22 → `brand`; 20/22 → `warning`; 22/22 e 24/22 →
  `danger`;
- `seatBlocksSave` no limite: criar vendedor → `true`; criar gerente
  (`SALESPERSON`) → `true`; criar ADMIN → `false`; editar vendedor ativo →
  `false`; ADMIN ativo para vendedor → `true`; ADMIN inativo para vendedor →
  `false`; vincular órfão vendedor ativo → `true`; abaixo do limite → `false`;
  sem `enforced` → `false`; `seats` indefinido → `false`.

**Verificar**: `npm run type-check && npm run lint && npm test --workspace=apps/web` → exit 0.

### Passo 8: Web — solicitações na Gestão Addere

1. **`app/(admin)/gestao/solicitacoes/page.tsx`**: `Tabs` "Pendentes (N)" e
   "Todas"; `LicenseRequestsTable` com as colunas do esboço (empresa, pedido em,
   por, quantidade, valor por licença, aumento por mês, situação) e as ações
   "Aprovar" e "Recusar" nas linhas pendentes. O layout `/gestao` do 013 já põe
   o `<SuperAdminOnly>`.
2. **`components/billing/DecideLicenseRequestModal.tsx`**: na aprovação, o
   texto "Aprovar libera N licenças agora e cria uma nova versão dos termos
   (origem: pedido de licenças). A cobrança começa na competência seguinte.",
   com a declaração aceita, o IP e os 12 primeiros caracteres do hash; na
   recusa, `Textarea` de motivo obrigatório. Os 409 (`AMENDMENT_PENDING`,
   `LICENSE_PRICE_CHANGED`, `LICENSE_REQUEST_ALREADY_DECIDED`) aparecem com a
   mensagem da API.
3. **Aba Licenças** da ficha `/gestao/clientes/[id]`, na pasta de abas do 013:
   `SeatMeter` com `useSeats(id)`, a lista "Quem ocupa licença" (nome, e-mail,
   perfil por `profileLabel`) e `LicenseRequestsTable` filtrada pela empresa,
   com as mesmas ações.
4. **Menu**: se o 013 não deixou o item, acrescente ao grupo "Gestão Addere"
   `{ href: '/gestao/solicitacoes', label: 'Solicitações', match: (p) => p.startsWith('/gestao/solicitacoes'), icon: Inbox, requires: 'superadmin' }`.

**Verificar**: `npm run type-check && npm run lint && npm run build:web` → exit 0.

### Passo 9: Documentação

Em `docs/billing/README.md` (do 013/014), seção "Licenças", curta:

- quem consome licença e a fonte única (`countSeatHolders`);
- os seis pontos que passam por `writeWithSeatGuard` e a regra: **todo caminho
  novo que cria, ativa, vincula ou muda alguém para `SALESPERSON` tem de passar
  por ele**;
- por que o `updateMany` serializa (o resumo do Passo 2), e as três coisas que
  quebram a garantia: mudar o nível de isolamento, contar antes da trava,
  escrever fora do `tx`;
- o ciclo do pedido (PENDING → APPROVED/REJECTED), os 409 da aprovação e o
  efeito na cobrança (competência seguinte);
- retenção: o pedido guarda IP, navegador e o texto aceito, tratados por
  execução de contrato (art. 7º, V), com a mesma retenção do registro de aceite.

**Verificar**: `grep -n "writeWithSeatGuard" docs/billing/README.md` → acha.

### Passo 10: Migration (último commit)

Nome: `packages/db/prisma/migrations/<YYYYMMDDHHMMSS>_billing_license_requests/migration.sql`,
com o carimbo do momento da execução. Ele tem de ser posterior a **todas** as
pastas que já existem em `packages/db/prisma/migrations/` (hoje a última é
`20261014120000_intel_llm_calls`; depois do 013 e do 014 haverá outras, e talvez
a do 016).

Gere o delta contra um Postgres local limpo, nunca contra o Neon (procedimento
de `docs/intelligence/README.md:202-228`):

```bash
docker compose up -d db
docker compose exec db createdb -U addere_dev_user addere_015_shadow
docker compose exec db createdb -U addere_dev_user addere_015_clean
cd packages/db
LOCAL=postgresql://addere_dev_user:addere_dev_password@localhost:5432
mkdir -p prisma/migrations/<carimbo>_billing_license_requests
npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url $LOCAL/addere_015_shadow \
  --script > prisma/migrations/<carimbo>_billing_license_requests/migration.sql
```

Ponha no topo do arquivo um comentário em português no estilo de
`20261014120000_intel_llm_calls/migration.sql`: "Pedidos de licenças adicionais
do ADMIN (plano 015) …; tabela nova e vazia". O conteúdo esperado é **só**:

- `CREATE TYPE "LicenseRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');`
- `CREATE TABLE "billing_license_requests" (…)`;
- os índices `(companyId, status)`, `(status, createdAt)` e o único de
  `resultingTermsId`;
- quatro `ADD CONSTRAINT … FOREIGN KEY`: `companies`, `users` (duas vezes) e a
  tabela dos termos do 013;
- se `BillingEvent.type` for enum, os três `ALTER TYPE … ADD VALUE`.

Valide num banco limpo. **Passe as duas variáveis**: o `schema.prisma` usa
`directUrl = env("DATABASE_URL_DIRECT")`, e sem ela o Prisma lê o valor do
`packages/db/.env` — que aponta para o Neon.

```bash
echo "$LOCAL"   # tem de mostrar localhost
DATABASE_URL=$LOCAL/addere_015_clean DATABASE_URL_DIRECT=$LOCAL/addere_015_clean \
  npx prisma migrate deploy
npx prisma migrate diff \
  --from-url $LOCAL/addere_015_clean \
  --to-schema-datamodel ./prisma/schema.prisma \
  --exit-code
```

No PowerShell, use `$env:DATABASE_URL = '…'` e `$env:DATABASE_URL_DIRECT = '…'`
antes do `migrate deploy`, e confira os dois com `echo`.

**Verificar**: `migrate deploy` aplica todas as migrations sem erro; o
`migrate diff --exit-code` sai com 0 (vazio); `grep -nE "DROP|ALTER TABLE \"(users|companies)\"" <migration.sql>`
só acha, se achar, o `ADD CONSTRAINT` das chaves estrangeiras da tabela nova.

## Plano de testes

Todos os casos estão descritos nos passos. Resumo do que é obrigatório:

| Caso | Onde |
|---|---|
| limite − 1 | `seat-guard.test.ts`; `POST /users` em `users-routes.test.ts` |
| no limite | `seat-guard.test.ts`; os dois caminhos de criação |
| Ilimitado com quantidade digitada | `seat-guard.test.ts`; `seat-rules.test.ts` |
| sem contrato | `seat-guard.test.ts`; todos os testes antigos (mock padrão) |
| contrato aguardando aceite | `seat-guard.test.ts`; `POST /companies/:id/users` |
| contrato cancelado | `seat-guard.test.ts`; `POST /companies/:id/users` |
| ADMIN para vendedor | `PATCH /companies/:id/users/:userId` e `PATCH /users/:id` |
| usuário órfão | `PATCH /users/:id` com `companyId` |
| os dois caminhos de criação | `users-routes.test.ts` e `companies-users-seats.test.ts` |
| reativação | `PATCH /users/:id/active` e `PATCH /companies/:id/users/:userId/active` |
| aprovação de pedido criando termos | `license-requests.test.ts` |
| acima do limite não desativa ninguém | `seat-guard.test.ts`; `seats-routes.test.ts` |
| regras de tela | `apps/web/src/lib/__tests__/seats.test.ts` |

Padrões a espelhar: `users-routes.test.ts` (rota com `buildApp` + `app.inject`
e `prismaMock`) e `companies-scope.test.ts:1-60` (setup das rotas de empresa).

O mock não prova concorrência: o teste de ordem (`invocationCallOrder`) prova
que a trava vem antes da contagem e da escrita, e o raciocínio do Passo 2 prova
o resto. Depois do deploy, a conferência de ponta a ponta é a do staging do
plano aprovado (passos 3, 7 e 8 da lista de 12): antes do aceite, 12 vendedores
passam; depois do aceite do Pacote 10, o 11º é recusado com o aviso; o ADMIN
pede 2 licenças vendo o preço; o superadmin aprova e o 11º passa.

## Critérios de conclusão

- [ ] `npm run db:generate`, `npm run type-check` e `npm run lint` saem com 0
- [ ] `npm test --workspace=apps/api` e `npm test --workspace=apps/web` passam,
      com todos os casos novos
- [ ] `npm run build:api` e `npm run build:web` saem com 0
- [ ] `grep -rn "writeWithSeatGuard" apps/api/src/modules/users apps/api/src/modules/companies`
      mostra exatamente 6 chamadas
- [ ] `grep -rnE "queryRaw|executeRaw|isolationLevel|FOR UPDATE" apps/api/src/modules/billing/`
      não acha nada nos arquivos deste plano
- [ ] os três `catch` de `users.routes.ts` repassam o `AppError`
- [ ] nenhuma asserção pré-existente de `users-routes.test.ts` foi alterada
      (o diff do arquivo só tem acréscimos)
- [ ] `git diff --stat 80fe328 -- apps/api/src/modules/users/users.schema.ts` vazio
- [ ] `git diff --stat 80fe328 -- apps/mobile/` vazio
- [ ] a migration é o último commit, contém só o esperado e foi validada em
      banco limpo (deploy + diff vazio)
- [ ] nenhum `.env` criado ou copiado; nenhum `migrate dev`, `migrate reset` ou
      `db push`; nenhum comando contra o Neon
- [ ] nenhuma cor hexadecimal nova em `apps/web/src` (`git diff | grep -nE "#[0-9A-Fa-f]{6}"` vazio)
- [ ] linha de status atualizada em `plans/README.md`

## Condições de PARADA

- A checagem de deriva acusa mudança no escopo que não é do 013, do 014 ou do
  016, e o "Estado atual" não bate.
- Falta no código um item obrigatório do Passo 0 (`seatGuardVersion`,
  `LICENSE_REQUEST`, `AppError.code`, `getApiErrorCode`, resolvedor de termos
  atuais, `trustProxy`) ou o `GET /billing/me`.
- Qualquer passo parecer exigir SQL cru (`$queryRaw`, `$executeRaw`,
  `SELECT … FOR UPDATE`) ou `isolationLevel` SERIALIZABLE ou REPEATABLE READ.
- Achar um **sétimo** caminho, alcançável por HTTP, que cria, ativa, vincula ou
  transforma alguém em `SALESPERSON` além dos seis. Os scripts
  `packages/db/prisma/seed.ts` e `apps/api/scripts/seed-demo-tenant.ts` já estão
  listados e não contam.
- O mock de `$transaction` não suportar o padrão de `withSeat` sem reescrever
  `apps/api/src/test-utils/prisma-mock.ts`.
- Algum teste pré-existente só passar mudando uma asserção (acrescentar mock
  é permitido; mudar o que se espera, não).
- O `migrate diff` gerar qualquer coisa além do listado no Passo 10 — sinal de
  que o schema local divergiu das migrations.
- Parecer necessário conectar num banco que não seja o Postgres local, ou o
  `echo` do Passo 10 não mostrar `localhost`.
- Parecer necessário corrigir o `createUserSchema` ou unificar os dois
  `createUser` para a trava funcionar.

## Notas de manutenção

- **A trava depende de três coisas**: o nível de isolamento padrão (READ
  COMMITTED), a ordem trava → contagem → escrita, e a escrita feita com o `tx`.
  Mudar qualquer uma reabre a corrida dos "21 de 20" sem nenhum teste ficar
  vermelho — o mock não simula concorrência. Quem revisar deve olhar, nesta
  ordem: (1) o `updateMany` antes do `count`; (2) o `write` usando `db`, nunca
  `prisma`; (3) os seis pontos chamando `writeWithSeatGuard`.
- **Caminho novo de usuário** (importação em lote, SSO, convite) tem de passar
  por `writeWithSeatGuard`. Quando a segunda etapa unificar os dois
  `createUser`, o critério "exatamente 6 chamadas" vira 5 — atualize o
  `docs/billing/README.md` junto.
- O efeito colateral nos `catch` de `users.routes.ts` é intencional: o 422
  "Gerente inválido" do `PATCH /users/:id` deixa de chegar como 404.
- **Com o 016** (em paralelo): os dois mexem no `schema.prisma` (relações em
  `Company`, que não geram SQL na tabela `companies`) e no `/plano`. As
  migrations são independentes; quem fizer o merge depois roda de novo a
  validação do Passo 10 com as duas. O 016 cobra pelos termos vigentes no
  início da competência: termos `LICENSE_REQUEST` aprovados no meio do mês
  **não** podem entrar na fatura daquele mês.
- **Com o 017**: `GET /billing/me/seats`, `GET /billing/me` e
  `POST /billing/me/license-requests` precisam ficar na lista de exceções do
  bloqueio (`/billing/me/*`), e o `/plano` continua aberto ao ADMIN de empresa
  bloqueada (decisão padrão 2).
- **Com o 018**: o painel deve contar licenças com `countSeatHolders` e usar
  `SEAT_NEAR_LIMIT_RATIO` para "clientes com ≥ 90 % do limite". Não crie outra
  definição de "quem ocupa licença".
- **Com o 014**: o aceite de aditivo que muda `includedSeats` ou `extraSeats`
  muda o limite na hora (termos atuais). Aditivo em andamento barra a aprovação
  de pedido (`AMENDMENT_PENDING`); se isso incomodar na operação, a saída é o
  aditivo carregar as licenças aprovadas, não tirar a trava.
- `RESEND_API_KEY` e `WEB_URL` não estão no `render.yaml` (são segredos do
  painel do Render). Sem a chave, o pedido é gravado e o e-mail é pulado com
  aviso no log; o superadmin continua vendo o pedido em `/gestao/solicitacoes`.
- O bug do `createUserSchema` continua: o "Novo usuário" ainda descarta código
  de vendedor, veículo, cidades, gerente e tom. Quando for corrigido, a trava
  não muda.
- `useCreateUser` (`useUsers.ts:15-30`) segue morto. Se alguém o reviver, a
  rota que ele chama (`POST /companies/:id/users`) já passa pela trava.
