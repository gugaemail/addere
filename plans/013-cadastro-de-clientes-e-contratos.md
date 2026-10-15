# Plano 013: Cadastro de clientes, pacotes e contrato em rascunho

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha deste plano na
> tabela da Fase 6 em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 80fe328..HEAD -- packages/db/prisma/ packages/types/src/index.ts apps/api/src/lib/errors.ts apps/api/src/lib/error-handler.ts apps/api/src/app.ts apps/api/src/modules/companies/ 'apps/web/src/app/(admin)/layout.tsx' 'apps/web/src/app/(admin)/dashboard/' 'apps/web/src/app/(admin)/empresas/' apps/web/src/lib/api.ts apps/web/src/lib/nav-gating.ts apps/web/src/lib/home-redirect.ts apps/web/src/lib/schemas.ts apps/web/src/hooks/useCompanies.ts`
> Se algum arquivo do escopo mudou desde que este plano foi escrito, compare os
> trechos de "Estado atual" com o código vivo antes de prosseguir; se não bater,
> trate como condição de PARADA. Uma migration nova em
> `packages/db/prisma/migrations/` não é PARADA: ela só obriga o timestamp da sua
> a ser posterior ao da mais recente.
>
> **Banco**: `apps/api/.env` e `packages/db/.env` apontam para o banco **real**
> (Neon). O Prisma lê esses arquivos sozinho. Todo comando Prisma que fala com
> banco leva `DATABASE_URL` **e** `DATABASE_URL_DIRECT` na própria linha,
> apontando para `localhost`. O `migrate deploy` usa o `DATABASE_URL_DIRECT`:
> esquecer só ele aplica a migration no banco real. Ver o passo 11.

## Status

- **Prioridade**: P1
- **Esforço**: L
- **Risco**: MED — as seis tabelas são novas e só aditivas, mas o plano muda a
  navegação e a home do SUPERADMIN e o corpo aceito pelo `POST /companies`
- **Depende de**: nenhum
- **Categoria**: feature (gestão comercial)
- **Planejado em**: commit `80fe328` (`origin/staging`), 2026-10-15
- **Fase**: primeiro plano da Fase 6 — Gestão de clientes Addere (planos 013 a 018)
- **Entrega**: o 013 e o 014 vão **juntos para produção**. Sem o aceite (plano
  014), o contrato não sai do rascunho. O 013 pode ir sozinho para a `staging`,
  que tem banco próprio.

## Por que isso importa

O Addere não tem nenhum controle comercial dentro do produto. A `Company` só
guarda nome, CNPJ, código Protheus, `active` e `intelligenceEnabled`. Não há
pacote, licença, contrato, endereço nem contato. O primeiro cliente pago está
chegando, e tudo o que vem depois — aceite eletrônico (014), limite de licenças
(015), faturas (016), bloqueio por atraso (017) e painel (018) — precisa de três
coisas que não existem:

1. **O cadastro comercial do cliente**: razão social, endereço, representante
   legal (vai no contrato) e contato de cobrança (recebe as faturas).
2. **O catálogo de pacotes** (10, 20, 30 e Ilimitado) e as regras globais de
   cobrança.
3. **O contrato com termos versionados**, porque o limite e a cobrança dependem
   de quais termos valiam em cada momento.

Este plano cria essa base, mais as peças que os planos seguintes reaproveitam:
o código de erro legível por máquina (`AppError.code`), o módulo puro de
calendário e de situação do cliente e a área **Gestão Addere** no painel. As
telas de superadmin hoje são rotas soltas (`/dashboard`, `/piloto`); a Gestão
Addere passa a reuni-las.

Nada aqui muda o que o cliente vê ou paga. O contrato fica em rascunho até o
plano 014 criar o envio e o aceite.

### Regras de produto que valem neste plano

Todas são **decisão de produto de 15/10/2026**:

- **Pacotes**: 10, 20, 30 e Ilimitado. Todo contrato tem **quantidade de
  licenças e valor total do pacote**. No 10, no 20 e no 30 a quantidade vem do
  pacote; no Ilimitado ela é digitada no contrato (ex.: 100 licenças por R$ X).
  O catálogo tem preço de tabela, que só preenche o contrato; o valor é
  negociado por empresa.
- **Adicionais**: licença avulsa, uma a uma, com preço unitário negociado por
  empresa.
- **Tipo de licença**: por empresa, **Padrão** (sem Inteligência) ou **Com
  Inteligência**. Cada pacote × tipo tem preço próprio.
- **Quem consome licença**: usuário ativo com perfil vendedor ou gerente
  (`SALESPERSON`). ADMIN é grátis.
- **Antes do aceite nada começa**: sem limite de licenças, sem mudança na
  Inteligência, sem cobrança. A data de início do contrato é a data do aceite.
- **Ciclo**: mensal e pós-pago. A fatura da competência M é gerada no início de
  M+1 e vence no dia de vencimento cadastrado por empresa, sempre entre 1 e 10.
- **Mudança no mês**: o que entra no mês M não é cobrado em M; entra na cobrança
  a partir de M+1.
- **Carência**: opcional; 0 é "sem carência". O mês do aceite não é cobrado;
  depois correm os N meses de carência e só então começa a cobrança.
- **Dias para suspender**: padrão global, com exceção por empresa.
- **Piloto**: empresa em piloto fica sem contrato, sem limite e sem cobrança.
- **Decisão padrão 1**: empresa sem contrato aceito continua como hoje, sem
  limite e sem cobrança.
- **Decisão padrão 4**: o bloqueio automático nasce desligado
  (`autoBlockEnabled = false`). Só o plano 017 o liga, depois do OTA do app.
- **Decisão padrão 8**: quem opera o módulo é o papel SUPERADMIN atual. O
  histórico registra quem fez cada ação.
- **Decisão padrão 11**: mexer no rascunho depois de enviar cancela o documento
  enviado. O envio é do 014; aqui só o `DRAFT` é editável.
- **LGPD**: só o SUPERADMIN lê o cadastro. O histórico grava o **nome** do
  campo alterado, nunca o valor.

### Decisões de desenho deste plano

Não vieram do desenho aprovado; foram tomadas aqui para fechar o plano:

1. **`BillingEvent.type` é `String`**, com a lista fechada no TypeScript
   (`BILLING_EVENT_TYPES` em `@addere/types`), como `IntelLlmCall.kind`. Os
   planos 014 a 017 acrescentam tipos sem migration de enum.
2. **`ContractTerms.version`** (1, 2, 3… por contrato) desempata termos com o
   mesmo `effectiveFrom` e numera o histórico de versões.
3. **No Ilimitado (`seats = null`), o formulário não pré-preenche o valor total
   do pacote**, porque a quantidade varia. Só pré-preenche o preço do adicional.
4. **Situação do cliente, por precedência** (alinhada com o plano 018 na
   revisão de 15/10/2026): bloqueado (por atraso ou manual) → vencido →
   cancelado → bloqueado (empresa desativada) → sem contrato (inclui o
   rascunho) → aguardando aceite → em carência → em dia. A função recebe o
   **motivo** do bloqueio, o mesmo que o `authenticate` do 017 usa: a tela não
   pode dizer "em dia" para quem não consegue entrar. A empresa desativada com
   contrato cancelado aparece como "cancelado", porque o cancelamento do 016
   desativa a empresa por padrão, e senão nenhum cliente encerrado apareceria
   como cancelado. "Vencido" vem antes de "cancelado" porque uma dívida de
   contrato encerrado ainda precisa ser cobrada. "Em carência" só aparece com `graceMonths > 0`. No mês do aceite
   com carência 0 a situação é "em dia", porque nada está sendo cobrado nem
   devido.
5. **Limites dos campos**: carência de 0 a 12 meses; dias para suspender de 1 a
   90; lembrete antes do vencimento com padrão de 3 dias; e-mail de avisos da
   Addere nulo até alguém preencher.
6. **CPF e CEP são gravados só com dígitos**, e a tela formata ao exibir. O CNPJ
   continua como hoje (gravado como digitado).
7. **A lista de Clientes não tem coluna de ações.** A linha abre a ficha, e o
   "Desativar empresa" fica no cabeçalho da ficha, como em `/empresas/[id]`. O
   rótulo "Bloquear empresa" da lista antiga some, porque "bloqueio" passa a ser
   outra coisa no plano 017.
8. **A ficha usa o componente `Tabs`** (`components/ui/Tabs.tsx`), que tem o
   mesmo visual da barra escrita à mão em `empresas/[id]/page.tsx`.

## Estado atual

Conferido no commit `80fe328`.

**Banco**

- `packages/db/prisma/schema.prisma:56-116` — `Company`, sem nenhum campo
  comercial. Em `:80` está o campo que este plano **não** toca:

  ```prisma
  intelligenceEnabled Boolean @default(false) // liga a camada de inteligência (plano Business+)
  ```

- `schema.prisma:276` — a convenção de dinheiro, que este plano segue:
  `creditLimit Decimal? @db.Decimal(14, 2)`. A convenção de dia civil está em
  `:898`: `VisitPlan.date` é `@db.Date`, "dia civil em America/Sao_Paulo", gravado
  como meia-noite UTC.
- `schema.prisma:151-186` — `User`. Ele ganha duas relações de volta (autor dos
  termos e autor do evento), sem coluna nova.
- `packages/db/prisma/migrations/20261014120000_intel_llm_calls/migration.sql` —
  a migration mais recente e o modelo de formato: comentário no topo explicando
  o porquê, `CREATE TABLE`, índices e chaves estrangeiras.
- `docs/intelligence/README.md:202-228` — o procedimento de migration da casa:
  delta contra Postgres local, nunca `--from-empty` para delta, e a validação
  "banco limpo → `migrate deploy` → `migrate diff` vazio".
- `packages/db/prisma/seed.ts:61-72` cria a "Empresa Demonstração". **O seed não
  precisa dos pacotes**: a própria migration os insere, e o `migrate reset` de
  desenvolvimento aplica as migrations antes de rodar o seed. Não mexa no seed.

**API**

- `apps/api/src/lib/errors.ts:3-21` — o `AppError` não tem código legível por
  máquina:

  ```ts
  export class AppError extends Error {
    readonly statusCode: number
    /** Payload estruturado opcional (ex.: violações da guarda SQL) — vai na resposta */
    details?: unknown

    constructor(statusCode: number, message: string, details?: unknown) {
  ```

  Os atalhos (`notFound`, `badRequest`, `forbidden`, `conflict`,
  `unprocessable`, `badGateway`) estão em `:16-21`. Só um lugar passa `details`
  (`intelligence/admin/queries.service.ts:168`).

- `apps/api/src/lib/error-handler.ts:11-15` — o handler responde `{ message }` ou
  `{ message, details }`:

  ```ts
  if (err instanceof AppError) {
    return reply
      .status(err.statusCode)
      .send(err.details === undefined ? { message: err.message } : { message: err.message, details: err.details })
  }
  ```

  Precedente de formato com código: `intelligence/app/messages.routes.ts:101`
  responde `{ code: 'CUSTOMER_BLOCKED', message }` à mão. Não mexa nele.

- `apps/api/src/lib/__tests__/error-handler.test.ts:34-74` — os testes usam
  `toEqual`, então um `code` a mais na resposta derruba os casos existentes. É
  isso que garante que o código só aparece quando foi passado.
- `apps/api/src/app.ts:88-103` — onde as rotas são registradas. O piloto
  (`modules/pilot/pilot.routes.ts:137`) já usa o prefixo `/admin/...` com
  `requireSuperAdmin` (`middleware/authenticate.ts:26-36`).
- `apps/api/src/modules/companies/companies.routes.ts:66-70` — o
  `POST /companies` (SUPERADMIN) chama `createCompany` com
  `createCompanySchema` (`companies.schema.ts:8-12`: `name`, `cnpj`,
  `idProtheus`).
- `companies.service.ts:69-77` — `createCompany` é um `prisma.company.create`
  solto, sem transação.
- `companies.service.ts:13-21` — `listCompanies` usa `include` e devolve a linha
  inteira da empresa, inclusive o `passProtheus` criptografado. Não copie esse
  padrão: a lista nova usa `select` explícito.
- `companies/__tests__/companies-scope.test.ts:1-57` — o padrão de teste de rota:
  `vi.mock('@addere/db', …mockDb())`, `buildApp()`, `app.jwt.sign(...)` e
  `app.inject`.
- `apps/api/src/test-utils/prisma-mock.ts:67-68` — o `$transaction` do mock
  executa o callback com o próprio mock. `tx.company.create` é
  `prismaMock.company.create`. Em `:21`, `groupBy` devolve `[]` por padrão.
- `apps/api/src/modules/intelligence/engine/business-days.ts:3-13` — o
  `ymdSaoPaulo`, com `Intl.DateTimeFormat('en-CA', { timeZone:
  'America/Sao_Paulo' })` criado no carregamento do módulo. Em `:83-88` está o
  `ymdToDate` (dia civil → meia-noite UTC, a convenção de `@db.Date`).
- `packages/types/src/index.ts:6` — `export * from './intelligence'`. Em
  `:215-217`, `isCustomerBlocked` mostra que o pacote já exporta função pura, e
  quem a testa é o app (`apps/mobile/src/utils/__tests__/customerBlock.test.ts`).
  O `packages/types` não tem script de teste. O Vitest da API só procura
  `src/**/*.test.ts` (`apps/api/vitest.config.ts`), então os testes do módulo
  puro moram em `apps/api`.

**Web**

- `apps/web/src/app/(admin)/layout.tsx:61-170` — `NAV_GROUPS`. O grupo Empresa
  está em `:132-169`. O item Empresas (`:151-160`) leva o SUPERADMIN à lista e o
  ADMIN à ficha da própria empresa:

  ```ts
  {
    href: '/dashboard',
    label: 'Empresas',
    match: (p) => p.startsWith('/dashboard') || p.startsWith('/empresas'),
    icon: Building2,
    requires: 'admin',
    hrefForCompany: (companyId) => `/empresas/${companyId}`,
  },
  ```

  O Piloto está em `:161-167`. O `hrefForCompany` só vale para quem não é
  SUPERADMIN (`:346-353`).

- `apps/web/src/lib/nav-gating.ts:3-6` e `:19-32`:

  ```ts
  export type NavRequirement =
    | 'superadmin'
    | 'admin'
    | { permission: string | string[]; orAdmin?: boolean }
  // ...
  if (requires === 'superadmin') return ctx.isSuperAdmin
  if (requires === 'admin') return ctx.isAdmin || ctx.isSuperAdmin
  if (ctx.isSuperAdmin) return true // SUPERADMIN tem o catálogo inteiro
  ```

  `isAdmin` é só `role === 'ADMIN'` (`contexts/AuthContext.tsx:92`).

- `apps/web/src/lib/home-redirect.ts:17-20`:

  ```ts
  // Home por papel: SUPERADMIN cai nas Empresas; demais na Inteligência
  export function resolveHome(user: PanelUser): string {
    return user.role === 'SUPERADMIN' ? '/dashboard' : '/inteligencia'
  }
  ```

  Quem usa: `app/login/page.tsx:48` e `app/page.tsx:18`. Três comentários citam
  `/dashboard` como home ou lista: `app/page.tsx:3-4`, `middleware.ts:24` e
  `app/(admin)/empresas/layout.tsx:3-4`.

- `lib/__tests__/home-redirect.test.ts:27-33` espera `'/dashboard'`.
  `lib/__tests__/nav-gating.test.ts:91-109` usa um item `'/dashboard'` sintético
  e continua válido. `lib/__tests__/middleware.test.ts:37-50` usa `/dashboard`
  como caminho qualquer e continua passando.
- `app/(admin)/dashboard/layout.tsx:1-6` — `<SuperAdminOnly>`, que manda quem
  não é SUPERADMIN para `/inteligencia` (`components/SuperAdminOnly.tsx:12-29`).
  O ADMIN nunca chegou ao `/dashboard`.
- `app/(admin)/dashboard/page.tsx` — a lista atual: `StatCard` Total, Ativas e
  Inativas (`:124-136`), colunas (`:39-105`), o botão "Bloquear empresa", que na
  verdade alterna `active` (`:87-101`), e o `EditCompanyModal` (`:247-299`). O
  `CreateCompanyModal.tsx:16-61` usa `useState` em vez de react-hook-form.
- `app/(admin)/empresas/[id]/page.tsx:90-102` — o "Voltar", só para o
  SUPERADMIN:

  ```tsx
  {isSuperAdmin && (
    <Button
      variant="ghost"
      size="sm"
      leftIcon={ArrowLeft}
      onClick={() => router.push('/dashboard')}
  ```

  O "Desativar empresa" está em `:111-121` e a barra de abas em `:133-149`.

- `app/(admin)/empresas/[id]/EntityModals.tsx` — o padrão de formulário:
  `useForm` com `zodResolver` (`:3-21`, `:88-108`), `SECTION_TITLE` (`:25`) e
  seções com `FormField`/`FormSelect`. A lista `UF_OPTIONS` (`:58-86`) é local e
  não exportada. Não mexa nesse arquivo.
- `apps/web/src/lib/schemas.ts:23-37` — `branchSchema`, o modelo dos schemas de
  formulário.
- `apps/web/src/lib/api.ts:108-114` — `getApiErrorMessage`. O teste dele
  (`lib/__tests__/api-errors.test.ts:1-19`) faz mock de `config/env`.
- `apps/web/src/hooks/useCompanies.ts` — `companiesKeys` (`:7-12`) e
  `useCompanies` (`:14-23`), usados pelo seletor de empresa do layout.
  `useCreateCompany` (`:25-32`) e `useUpdateCompany` (`:34-48`) só são usados
  pelo `/dashboard`. `useToggleCompanyActive` está em `:50-57`.
- `apps/web/src/lib/utils.ts:15-21` — `formatDate` formata no fuso do navegador.
  Um `@db.Date` (meia-noite UTC) aparece como **o dia anterior** no Brasil. Para
  competência e vencimento, use o formatador do passo 3.
- `apps/web/src/lib/reconciliation.ts:27-41` — `parseOfficialNumber(text,
  'currency')` já lê "1.234,56" e "1234.56". Reaproveite para os campos de
  dinheiro.
- `components/ui/` tem `Tabs`, `Badge`, `StatCard`, `Table`, `Modal`,
  `FormField`/`FormSelect`, `Textarea`, `Switch` e `Button`. Use esses
  componentes; não crie outros para a mesma função.

## Esboço de tela

**Clientes** (`/gestao/clientes`, home do SUPERADMIN):

```
┌ Clientes ─────────────────────────────────────────────── [+ Novo cliente] ┐
│                                                                           │
│ ┌ Total ────┐ ┌ Ativas ───┐ ┌ Inativas ─┐                                 │
│ │ 7         │ │ 6         │ │ 1         │                                 │
│ └───────────┘ └───────────┘ └───────────┘                                 │
│                                                                           │
│ Cliente                Situação         Pacote             Licenças  Valor│
│ ───────────────────────────────────────────────────────────────────────── │
│ Distribuidora Vale     Sem contrato     Pacote 20 · Padrão  14 / —    —   │
│ 12.345.678/0001-90     rascunho         (proposto)                        │
│ Empresa Demonstração   Sem contrato     —                    3 / —    —   │
│ 00.000.000/0001-00                                                Inativa │
└───────────────────────────────────────────────────────────────────────────┘
  Licenças = vendedores e gerentes ativos / limite ("—" = sem limite).
  A linha inteira abre a ficha. "Próximo vencimento" entra com o plano 016.
```

**Novo cliente** (`ClientFormModal`, o mesmo modal edita):

```
┌ Novo cliente ─────────────────────────────────────────── ✕ ┐
│ EMPRESA                                                    │
│ Nome no sistema *          CNPJ *                          │
│ Código Protheus            Inscrição estadual              │
│ Razão social *             Nome fantasia                   │
│ ENDEREÇO                                                   │
│ Logradouro                 Número                          │
│ Complemento                Bairro                          │
│ Cidade                     UF ▾        CEP                 │
│ REPRESENTANTE LEGAL (vai no contrato)                      │
│ Nome                       CPF                             │
│ Cargo                                                      │
│ CONTATOS                                                   │
│ Contato principal: nome · e-mail · telefone                │
│ Cobrança: nome · e-mail · telefone                         │
│ OBSERVAÇÕES (só a Addere vê)                               │
│ [                                                       ]  │
│                              [Cancelar]  [Criar cliente]   │
└────────────────────────────────────────────────────────────┘
  Duas colunas a partir de sm; uma coluna no celular.
```

**Ficha do cliente** (`/gestao/clientes/[id]`), aba Contrato:

```
← Voltar
Distribuidora Vale Verde Ltda               [Integração ↗] [Desativar empresa]
Vale Verde · 12.345.678/0001-90 · Protheus: 01   (Sem contrato)

┌ Licenças em uso ─┐ ┌ Pacote ──────────┐ ┌ Valor mensal ┐ ┌ Empresa ┐
│ 14 / sem limite  │ │ — (rascunho:     │ │ —            │ │ Ativa   │
│                  │ │   Pacote 20)     │ │              │ │         │
└──────────────────┘ └──────────────────┘ └──────────────┘ └─────────┘

 Cadastro   Contrato   Histórico
            ────────
 Rascunho — o cliente ainda não vê este contrato.

 Pacote                   [Pacote 20 (20 licenças)            ▾]
 Tipo de licença          (•) Padrão   ( ) Com Inteligência
 Licenças incluídas       [ 20 ]  vem do pacote
 Valor do pacote (R$/mês) [ 1.800,00 ]  tabela: R$ 1.800,00
 Licenças adicionais      [ 0 ]   Preço do adicional (R$/mês) [ 95,00 ]
 Total mensal             R$ 1.800,00

 Carência (meses)         [ 0 ]   0 = sem carência
 Dia de vencimento        [ 10 ▾ ]  entre 1 e 10
 Dias para suspender      [x] usar o padrão (15)   [    ]
 Observação               [                                      ]

 ┌ Se aceito hoje (15/10/2026) ──────────────────────────────────────┐
 │ 1ª competência cobrada 11/2026 · 1ª fatura vence em 10/12/2026     │
 │ O mês do aceite não é cobrado.                                     │
 └────────────────────────────────────────────────────────────────────┘
                                                   [Salvar rascunho]

 Versões dos termos
 v1  Proposto  Pacote 20 · Padrão · 20 + 0  R$ 1.800,00  Gustavo · 15/10/2026
```

A aba **Cadastro** mostra as mesmas seções do modal, só leitura, com o botão
"Editar cadastro". Empresa criada antes deste plano não tem cadastro: a aba
mostra "Cadastro comercial não preenchido" e o botão "Preencher cadastro".

A aba **Histórico**:

```
 15/10/2026 14:32  Rascunho do contrato alterado      Gustavo Costa
                   Campos: valor do pacote, dia de vencimento
 15/10/2026 14:10  Cliente cadastrado                 Gustavo Costa
```

**Pacotes e regras** (`/gestao/pacotes`):

```
┌ Pacotes e regras ─────────────────────────────────────────────────────────┐
│ Pacotes                                                  [+ Novo pacote]  │
│ Código     Nome       Licenças     Padrão    Com Intel.  Adicional  Status │
│ P10        Pacote 10  10           —         —           — / —      Ativo  │
│ P20        Pacote 20  20           —         —           — / —      Ativo  │
│ P30        Pacote 30  30           —         —           — / —      Ativo  │
│ UNLIMITED  Ilimitado  no contrato  —         —           — / —      Ativo  │
│ O preço de tabela só pré-preenche o contrato; o valor é negociado.        │
│                                                                           │
│ Regras de cobrança                                                        │
│ Dias de atraso para suspender (padrão)   [ 15 ]                           │
│ Lembrete antes do vencimento (dias)      [ 3 ]                            │
│ E-mail da Addere para os avisos          [                    ]           │
│ Bloqueio automático   Desligado. Liga depois que a versão nova do app     │
│                       estiver no ar.                                      │
│                                                     [Salvar regras]       │
└───────────────────────────────────────────────────────────────────────────┘
```

## Quem acessa

| Perfil | O que muda |
|---|---|
| SUPERADMIN | Ganha o grupo **Gestão Addere** (Clientes, Pacotes e regras e Piloto, que sai do grupo Empresa). A home passa a ser `/gestao/clientes`. O item "Empresas" some para ele: a lista virou Clientes, e a ficha técnica abre pelo botão "Integração". |
| ADMIN | Nada muda. Continua com "Empresas" levando à ficha da própria empresa. Não vê a Gestão Addere: `/gestao/*` passa pelo `SuperAdminOnly`, que o manda para `/inteligencia`, e `/admin/billing/*` responde 403. |
| Gerente e vendedor | Nada muda. |

Na API, todas as rotas `/admin/billing/*` usam `requireSuperAdmin`. O
`POST /companies` já era só do SUPERADMIN.

## Comandos que você vai precisar

Comandos em sintaxe bash (Git Bash no Windows), a partir da raiz do monorepo.

| Para quê | Comando | Esperado |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Formatar o schema | `npx prisma format --schema packages/db/prisma/schema.prisma` | exit 0 (não conecta em banco) |
| Gerar o client | `npm run db:generate` | exit 0 (não conecta em banco) |
| Tipos | `npm run type-check` | exit 0 (api, web e mobile) |
| Lint | `npm run lint` | exit 0 |
| Testes da API | `npm test --workspace=apps/api` | todos passam |
| Um arquivo de teste da API | `npm test --workspace=apps/api -- billing-rules` | o arquivo passa |
| Testes do web | `npm test --workspace=apps/web` | todos passam |
| Testes do mobile | `npm run test:unit --workspace=apps/mobile` | todos passam (o barrel de `@addere/types` muda) |
| Build da API | `npm run build:api` | exit 0 |
| Build do web | `npm run build:web` | exit 0; exige `apps/web/.env.local` (num worktree, copie o `apps/web/.env.local.example`) |
| Postgres local | `docker compose up -d db` | container `db` saudável |
| Bancos descartáveis | `docker compose exec db createdb -U addere_dev_user addere_p013` e `… addere_p013_shadow` | exit 0 |
| Migration (gerar, aplicar, conferir) | ver o passo 11 | — |

No Windows, o checkout está em CRLF (`core.autocrlf=true`). Por isso o
`npm run format:check` acusa todos os arquivos, inclusive os não tocados. Não o
use como critério. Garanta só que as linhas novas seguem o estilo da casa: sem
ponto e vírgula, aspas simples e largura 100.

## Escopo

**Dentro do escopo:**

- `packages/db/prisma/schema.prisma` — quatro enums e seis modelos novos, mais
  as relações de volta em `Company` e `User`
- `packages/db/prisma/migrations/<timestamp>_billing_clients_contracts/migration.sql` (novo)
- `packages/types/src/billing.ts` (novo) e `packages/types/src/index.ts` (uma linha)
- `apps/api/src/lib/errors.ts`, `apps/api/src/lib/error-handler.ts` e
  `apps/api/src/lib/__tests__/error-handler.test.ts`
- `apps/api/src/modules/billing/` (novo): `billing.routes.ts`,
  `billing.schema.ts`, `billing-events.ts`, `catalog.service.ts`,
  `clients.service.ts`, `contract.service.ts` e `__tests__/`
- `apps/api/src/app.ts` (só o registro das rotas)
- `apps/api/src/modules/companies/companies.schema.ts`, `companies.service.ts`
  e `companies.routes.ts` (só o `POST /companies`)
- `apps/web/src/lib/api.ts` e `lib/__tests__/api-errors.test.ts`
- `apps/web/src/lib/nav-gating.ts`, `lib/home-redirect.ts` e os testes deles
- `apps/web/src/lib/schemas.ts` (schemas novos) e `apps/web/src/lib/billing-ui.ts`
  (novo), com teste
- `apps/web/src/hooks/useBilling.ts` (novo) e `apps/web/src/hooks/useCompanies.ts`
  (remover os dois hooks que ficam sem uso)
- `apps/web/src/app/(admin)/layout.tsx` (`NAV_GROUPS` e imports de ícone)
- `apps/web/src/app/(admin)/gestao/` (novo)
- `apps/web/src/app/(admin)/dashboard/page.tsx` (vira redirect) e
  `dashboard/CreateCompanyModal.tsx` (removido)
- `apps/web/src/app/(admin)/empresas/[id]/page.tsx` (só o "Voltar")
- Comentários que citam `/dashboard`: `app/page.tsx:3-4`, `middleware.ts:24` e
  `app/(admin)/empresas/layout.tsx:3-4`
- `plans/README.md` (só a linha de status do 013)

**Fora do escopo (NÃO toque):**

- **`intelligenceEnabled`, em qualquer lugar.** É do plano 014. Não mexa em
  `intelligence/admin/config.routes.ts`, `components/intel/IntelConfigForm.tsx`,
  `app/(admin)/configuracoes/page.tsx`, `empresas/[id]/tabs/IntelligenceTab.tsx`,
  `auth.routes.ts` nem `middleware/require-vendor-code.ts`. Salvar um rascunho
  "Com Inteligência" não liga nada.
- Aceite e documentos (014): `ContractTemplate`, `ContractDocument`, envio por
  e-mail, `/contrato`, prévia do documento, "Enviar para aceite", "Propor
  aditivo", `trustProxy`.
- Trava de licenças e pedidos (015): `users.service.ts`, `users.routes.ts`, os
  dois `createUser`, `toggleUserActive`, `LicenseRequest`, `/plano` e
  `UserFormModal`.
- Faturas e jobs (016): `Invoice`, `InvoiceItem`, agendador,
  `BILLING_JOBS_ENABLED`, a coluna "Próximo vencimento" e o cancelamento do
  contrato.
- Bloqueio (017): os campos de bloqueio da `Company`, `authenticate.ts`,
  `/auth/me` e qualquer escrita de `autoBlockEnabled`.
- Painel `/gestao` (018). Até lá, a home do SUPERADMIN é `/gestao/clientes`.
- `apps/mobile` — nada.
- Os achados colaterais das pendências: o `createUserSchema`
  (`users/users.schema.ts:3-14`) descartando campos, os dois `createUser`
  divergentes (`users.service.ts:58` e `companies.service.ts:272`), o
  `useCreateUser` morto e o ativar/desativar de `/users` sem mensagem.
- `empresas/[id]/EntityModals.tsx`: é só o modelo de formulário.
- `toggleCompanyActive` e o `PATCH /companies/:id/active`: continuam sem evento
  de cobrança. O 017 decide o que a desativação grava.
- `listCompanies`: não mexa; só não copie o `include` dele.
- `messages.routes.ts:101`: o `CUSTOMER_BLOCKED` feito à mão continua como está.
- `seed.ts`, `env.ts`, os `.env.example` e o `render.yaml`: este plano **não
  tem env nova**.
- O site (`termos.html`, `privacidade.html`): é do plano 014.

## Fluxo de git

- Branch: `advisor/013-cadastro-de-clientes`, criada da `staging`:
  `git fetch origin && git switch -c advisor/013-cadastro-de-clientes origin/staging`,
  com a árvore limpa. Se preferir um worktree
  (`git worktree add ../addere-wt-013 -b advisor/013-cadastro-de-clientes origin/staging`),
  rode `npm install` nele e **não copie `.env` nenhum** para lá.
- Se este arquivo ainda não estiver na `staging`, leia-o da branch de docs:
  `git show origin/docs/plano-gestao-clientes:plans/013-cadastro-de-clientes-e-contratos.md`.
- **Um commit por passo**, em português, no estilo da casa:
  `feat(db): modelos da gestão de clientes`,
  `feat(api): código de erro legível por máquina`,
  `feat(types): calendário de cobrança e situação do cliente`,
  `feat(billing): pacotes e regras`,
  `feat(billing): cadastro e contrato em rascunho`,
  `feat(companies): cadastro comercial na criação da empresa`,
  `feat(web): código de erro e gating companyAdmin`,
  `feat(web): Gestão Addere e lista de Clientes`,
  `feat(web): ficha do cliente`,
  `feat(web): Pacotes e regras`,
  `feat(db): migration da gestão de clientes (billing_*)`,
  `docs(plans): 013 concluído`.
- **A migration é commitada por último**, em commit próprio (passo 11). O
  `schema.prisma` entra no passo 1.
- **Não faça push nem abra PR** sem pedido de quem despachou. Push na `staging`
  dispara o deploy da API (`deploy-api.yml`).
- **Não rode build do app** (`eas build`, `eas update`). Este plano não toca
  `apps/mobile`.

## Passos

### Passo 1: Modelos no `schema.prisma` (sem migration ainda)

Arquivo: `packages/db/prisma/schema.prisma`.

1. No fim do arquivo, depois de `CustomerWindow`, acrescente o bloco abaixo.
   Os nomes de modelo, campo e enum são os que o resto do plano usa; não os
   troque.

   ```prisma
   // ═════════════════════════════════════════
   // Gestão Addere — cadastro comercial, contrato e cobrança (planos 013 a 018)
   // Só o SUPERADMIN escreve. Dinheiro Decimal(14,2). Competência e vencimento
   // são @db.Date: meia-noite UTC do dia civil em America/Sao_Paulo, como
   // VisitPlan.date. Antes do aceite nada começa: sem limite e sem cobrança.
   // ═════════════════════════════════════════

   enum LicenseType {
     STANDARD // Padrão — sem Inteligência
     INTELLIGENCE // Com Inteligência
   }

   enum ContractStatus {
     DRAFT // rascunho: só a Addere vê
     PENDING_ACCEPTANCE // enviado, esperando o aceite do ADMIN (plano 014)
     ACTIVE // aceito: limite e cobrança valem
     CANCELLED // encerrado (plano 016)
   }

   enum ContractTermsStatus {
     PROPOSED // ainda não vale; nunca conta para limite nem para cobrança
     EFFECTIVE // vale a partir de effectiveFrom; nunca mais é alterado
     WITHDRAWN // proposta descartada
   }

   enum ContractTermsOrigin {
     CONTRACT // termos do contrato original
     AMENDMENT // aditivo aceito pelo ADMIN (plano 014)
     LICENSE_REQUEST // pedido de licenças aprovado (plano 015)
   }

   // Catálogo de pacotes. O preço de tabela só pré-preenche o contrato; o valor
   // negociado mora em ContractTerms.
   model LicensePackage {
     id                             String   @id @default(uuid())
     code                           String   @unique // P10 | P20 | P30 | UNLIMITED; não muda depois de criado
     name                           String
     seats                          Int? // null = quantidade digitada no contrato (Ilimitado)
     listPriceStandard              Decimal? @db.Decimal(14, 2) // total mensal do pacote, Padrão
     listPriceIntelligence          Decimal? @db.Decimal(14, 2) // total mensal do pacote, Com Inteligência
     listExtraSeatPriceStandard     Decimal? @db.Decimal(14, 2) // por licença adicional, Padrão
     listExtraSeatPriceIntelligence Decimal? @db.Decimal(14, 2) // por licença adicional, Com Inteligência
     active                         Boolean  @default(true)
     sortOrder                      Int      @default(0)
     createdAt                      DateTime @default(now())
     updatedAt                      DateTime @updatedAt

     terms ContractTerms[]

     @@map("billing_license_packages")
   }

   // Cadastro comercial, 1:1 com Company. Separado de Company para os dados
   // pessoais (representante legal e contatos) não vazarem nas listagens técnicas.
   model ClientProfile {
     companyId String  @id
     company   Company @relation(fields: [companyId], references: [id])

     legalName         String // razão social
     tradeName         String? // nome fantasia
     stateRegistration String? // inscrição estadual; "ISENTO" vale

     addressStreet     String?
     addressNumber     String?
     addressComplement String?
     addressDistrict   String? // bairro
     addressCity       String?
     addressState      String? // UF
     addressZip        String? // CEP, só dígitos

     // Representante legal — entra no quadro-resumo do contrato (plano 014)
     legalRepName String?
     legalRepCpf  String? // só dígitos
     legalRepRole String? // cargo

     contactName  String?
     contactEmail String?
     contactPhone String?

     // Contato de cobrança — recebe as faturas e os avisos (planos 016 e 017)
     billingContactName String?
     billingEmail       String?
     billingPhone       String?

     notes String? // observação interna da Addere; nunca vai ao contrato

     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt

     @@map("billing_client_profiles")
   }

   // Contrato, 1:1 com Company. Sem linha = empresa sem contrato (teste, piloto
   // ou implantação): sem limite e sem cobrança.
   model CompanyContract {
     id        String  @id @default(uuid())
     companyId String  @unique
     company   Company @relation(fields: [companyId], references: [id])

     status                ContractStatus @default(DRAFT)
     startDate             DateTime?      @db.Date // dia do aceite em São Paulo (plano 014)
     graceMonths           Int            @default(0) // 0 = sem carência
     firstBilledCompetence DateTime?      @db.Date // gravada no aceite: mês do aceite + 1 + carência
     dueDay                Int // 1 a 10, validado no zod
     overdueBlockDays      Int? // null = padrão de BillingSettings
     seatGuardVersion      Int            @default(0) // linha de trava da criação de usuários (plano 015); não é dado

     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt

     terms ContractTerms[]

     @@map("billing_company_contracts")
   }

   // Versões dos termos. EFFECTIVE nunca é alterado: mudança vira versão nova.
   // Só o PROPOSED de um contrato em DRAFT é editado no lugar.
   model ContractTerms {
     id         String              @id @default(uuid())
     contractId String
     contract   CompanyContract     @relation(fields: [contractId], references: [id])
     version    Int // 1, 2, 3… por contrato
     status     ContractTermsStatus @default(PROPOSED)
     origin     ContractTermsOrigin @default(CONTRACT)

     proposedEffectiveFrom DateTime? // "vale a partir de" do aditivo (plano 014)
     effectiveFrom         DateTime? // gravado no aceite ou na aprovação

     packageId      String
     package        LicensePackage @relation(fields: [packageId], references: [id])
     licenseType    LicenseType
     includedSeats  Int // sempre preenchido: do pacote, ou digitado no Ilimitado
     extraSeats     Int            @default(0)
     packagePrice   Decimal        @db.Decimal(14, 2) // valor total mensal do pacote, negociado
     extraSeatPrice Decimal        @db.Decimal(14, 2) // por licença adicional, negociado
     reason         String?

     createdById String?
     createdBy   User?   @relation("ContractTermsAuthor", fields: [createdById], references: [id])

     createdAt DateTime @default(now())
     updatedAt DateTime @updatedAt

     @@unique([contractId, version])
     @@index([contractId, status])
     @@map("billing_contract_terms")
   }

   // Histórico e auditoria. O payload guarda só os NOMES dos campos alterados,
   // nunca os valores (LGPD). `type` segue a lista fechada BILLING_EVENT_TYPES
   // de @addere/types.
   model BillingEvent {
     id        String   @id @default(uuid())
     type      String
     companyId String? // null nos eventos globais (pacotes e regras)
     company   Company? @relation(fields: [companyId], references: [id])
     actorId   String? // null = job (planos 016 e 017)
     actor     User?    @relation("BillingEventActor", fields: [actorId], references: [id])
     payload   Json     @default("{}")
     dedupeKey String?  @unique // idempotência dos e-mails (planos 016 e 017)
     createdAt DateTime @default(now())

     @@index([companyId, createdAt])
     @@map("billing_events")
   }

   // Regras globais, linha única (id "global", criada pela migration).
   model BillingSettings {
     id               String   @id @default("global")
     overdueBlockDays Int      @default(15) // dias de atraso para suspender; o contrato pode ter exceção
     dueReminderDays  Int      @default(3) // lembrete antes do vencimento (plano 016)
     autoBlockEnabled Boolean  @default(false) // nasce desligado; só o plano 017 liga, depois do OTA
     notifyEmail      String? // e-mail da Addere que recebe os avisos
     updatedAt        DateTime @updatedAt

     @@map("billing_settings")
   }
   ```

2. Em `model Company`, junto das outras relações (depois de `customerWindows`):

   ```prisma
     // ─── Gestão Addere (plano 013) ───
     clientProfile ClientProfile?
     contract      CompanyContract?
     billingEvents BillingEvent[]
   ```

3. Em `model User`, junto das outras relações (depois de `permissions`):

   ```prisma
     billingEvents        BillingEvent[]  @relation("BillingEventActor")
     contractTermsCreated ContractTerms[] @relation("ContractTermsAuthor")
   ```

4. Rode `npx prisma format --schema packages/db/prisma/schema.prisma`.

**Não crie a migration agora.** Ela é gerada e validada no passo 11 e entra no
último commit.

**Verificar**: `npm run db:generate && npm run type-check` → exit 0;
`git status --short packages/db/prisma/migrations` → vazio.

### Passo 2: `AppError.code`

Arquivos: `apps/api/src/lib/errors.ts`, `apps/api/src/lib/error-handler.ts` e
`apps/api/src/lib/__tests__/error-handler.test.ts`.

1. Em `errors.ts`, acrescente o código como quarto parâmetro opcional. A ordem
   atual dos parâmetros não muda, e a única chamada com `details` continua
   valendo:

   ```ts
   export class AppError extends Error {
     readonly statusCode: number
     /** Payload estruturado opcional (ex.: violações da guarda SQL) — vai na resposta */
     details?: unknown
     /** Código legível por máquina (ex.: 'CONTRACT_NOT_DRAFT'); vai na resposta como `code` */
     readonly code?: string

     constructor(statusCode: number, message: string, details?: unknown, code?: string) {
       super(message)
       this.name = 'AppError'
       this.statusCode = statusCode
       this.details = details
       this.code = code
     }
   }

   export const notFound = (message: string, code?: string) => new AppError(404, message, undefined, code)
   export const badRequest = (message: string, code?: string) => new AppError(400, message, undefined, code)
   export const forbidden = (message: string, code?: string) => new AppError(403, message, undefined, code)
   export const conflict = (message: string, code?: string) => new AppError(409, message, undefined, code)
   export const unprocessable = (message: string, details?: unknown, code?: string) =>
     new AppError(422, message, details, code)
   export const badGateway = (message: string, code?: string) => new AppError(502, message, undefined, code)
   ```

2. Em `error-handler.ts`, o ramo do `AppError` passa a montar o corpo assim:

   ```ts
   if (err instanceof AppError) {
     return reply.status(err.statusCode).send({
       message: err.message,
       ...(err.code === undefined ? {} : { code: err.code }),
       ...(err.details === undefined ? {} : { details: err.details }),
     })
   }
   ```

   Atualize o comentário do topo: o formato passa a ser `{ message, code?,
   details? }`.

3. No teste, acrescente três rotas e três casos, sem alterar os existentes:
   - `conflict('Já saiu do rascunho', 'CONTRACT_NOT_DRAFT')` →
     `toEqual({ message: 'Já saiu do rascunho', code: 'CONTRACT_NOT_DRAFT' })`;
   - `unprocessable('x', { a: 1 }, 'X')` → `{ message, code, details }`;
   - `new AppError(409, 'x').code` é `undefined`.

**Verificar**: `npm test --workspace=apps/api -- error-handler` → os 7 casos
antigos e os 3 novos passam; `npm run type-check` → exit 0.

### Passo 3: Módulo puro `packages/types/src/billing.ts`

Arquivos: `packages/types/src/billing.ts` (novo), `packages/types/src/index.ts`
e `apps/api/src/modules/billing/__tests__/billing-rules.test.ts` (novo).

**Por que replicar em vez de importar.** O `packages/types` não pode importar de
`apps/api`: a dependência vai no sentido contrário, e o web e o app também
importam dele. Por isso a conversão instante → dia civil em São Paulo é uma
réplica mínima do `ymdSaoPaulo` de `business-days.ts:3-13`. Diga isso no
comentário do topo do arquivo.

**Diferença proposital em relação ao `business-days.ts`**: o formatador é criado
na primeira chamada, não no carregamento do módulo. O barrel de
`@addere/types` também é carregado pelo app mobile, que não usa nada daqui.

1. Em `index.ts`, logo abaixo de `export * from './intelligence'` (`:6`):

   ```ts
   // ─── Gestão Addere (planos 013 a 018) ──────────────────────────────────────
   export * from './billing'
   ```

   Tudo que `billing.ts` exporta passa a fazer parte de `@addere/types`. Funções
   auxiliares internas ficam **sem** `export`.

2. O núcleo de datas, que deve ficar assim:

   ```ts
   let spFormatter: Intl.DateTimeFormat | null = null

   function civilDateInSaoPaulo(date: Date): { year: number; month: number; day: number } {
     spFormatter ??= new Intl.DateTimeFormat('en-CA', {
       timeZone: 'America/Sao_Paulo',
       year: 'numeric',
       month: '2-digit',
       day: '2-digit',
     })
     const [year, month, day] = spFormatter.format(date).split('-').map(Number)
     return { year, month, day }
   }

   /** Competência (mês civil em São Paulo) do instante, como @db.Date: dia 1 à meia-noite UTC. */
   export function startOfCompetence(date: Date): Date {
     const { year, month } = civilDateInSaoPaulo(date)
     return new Date(Date.UTC(year, month - 1, 1))
   }

   export function addCompetenceMonths(competence: Date, months: number): Date {
     return new Date(Date.UTC(competence.getUTCFullYear(), competence.getUTCMonth() + months, 1))
   }

   /**
    * 00:00 de São Paulo no dia 1 da competência. UTC−3 fixo: o Brasil não tem
    * horário de verão desde 2019 (Decreto 9.772). Se voltar a ter, revise aqui.
    */
   export function competenceStartInstant(competence: Date): Date {
     return new Date(Date.UTC(competence.getUTCFullYear(), competence.getUTCMonth(), 1, 3))
   }

   /** A fatura da competência M sai no início de M+1 e vence no dia `dueDay` de M+1. */
   export function dueDateForCompetence(competence: Date, dueDay: number): Date {
     return new Date(Date.UTC(competence.getUTCFullYear(), competence.getUTCMonth() + 1, dueDay))
   }

   export const DUE_DAY_MIN = 1
   export const DUE_DAY_MAX = 10
   export const GRACE_MONTHS_MAX = 12

   export function computeBillingCalendar(input: {
     acceptDate: Date
     graceMonths: number
     dueDay: number
   }): { firstBilledCompetence: Date; firstDueDate: Date } {
     const { acceptDate, graceMonths, dueDay } = input
     if (!Number.isInteger(dueDay) || dueDay < DUE_DAY_MIN || dueDay > DUE_DAY_MAX) {
       throw new RangeError('dueDay fora de 1 a 10')
     }
     if (!Number.isInteger(graceMonths) || graceMonths < 0) {
       throw new RangeError('graceMonths negativo')
     }
     // O mês do aceite não é cobrado; depois correm os meses de carência
     const firstBilledCompetence = addCompetenceMonths(startOfCompetence(acceptDate), 1 + graceMonths)
     return { firstBilledCompetence, firstDueDate: dueDateForCompetence(firstBilledCompetence, dueDay) }
   }
   ```

   Conferência com o exemplo do desenho aprovado: aceite em 15/10/2026,
   carência de 2 meses e vencimento no dia 10 dão "1ª competência cobrada
   01/2027 · 1ª fatura vence em 10/02/2027". Com carência 0, o mesmo aceite dá
   11/2026 e 10/12/2026.

3. A resolução de termos. Só `EFFECTIVE` conta; `PROPOSED` e `WITHDRAWN` nunca
   contam, nem com `effectiveFrom` preenchido.

   ```ts
   export interface TermsForResolution {
     status: ContractTermsStatus
     effectiveFrom: Date | null
     version: number
   }

   function latestEffective<T extends TermsForResolution>(terms: readonly T[], limit: Date): T | null {
     let best: T | null = null
     let bestTime = -Infinity
     for (const t of terms) {
       if (t.status !== 'EFFECTIVE' || !t.effectiveFrom) continue
       const time = t.effectiveFrom.getTime()
       if (time > limit.getTime()) continue
       if (time > bestTime || (time === bestTime && best !== null && t.version > best.version)) {
         best = t
         bestTime = time
       }
     }
     return best
   }

   /** Termos atuais: valem para o limite de licenças e para a Inteligência, na hora. */
   export function resolveCurrentTerms<T extends TermsForResolution>(terms: readonly T[], now: Date): T | null {
     return latestEffective(terms, now)
   }

   /**
    * Termos da competência M: o EFFECTIVE de maior effectiveFrom ESTRITAMENTE
    * anterior ao início de M. Entrou no mês (inclusive às 00:00 do dia 1), cobra
    * no seguinte. Decisão da revisão de 15/10/2026.
    */
   export function resolveCompetenceTerms<T extends TermsForResolution>(
     terms: readonly T[],
     competence: Date
   ): T | null {
     return latestEffective(terms, new Date(competenceStartInstant(competence).getTime() - 1))
   }
   ```

4. O total mensal, em centavos inteiros, para não ter erro de ponto flutuante.
   Entrada e saída são strings `'1234.56'`, como o `Decimal` serializado:

   ```ts
   function toCents(value: string): number {
     const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim())
     if (!m) throw new RangeError(`valor monetário inválido: ${value}`)
     return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'))
   }

   /** packagePrice + extraSeats × extraSeatPrice. Cobra o contratado, não o uso. */
   export function contractMonthlyTotal(t: {
     packagePrice: string
     extraSeats: number
     extraSeatPrice: string
   }): string {
     const cents = toCents(t.packagePrice) + t.extraSeats * toCents(t.extraSeatPrice)
     return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
   }
   ```

5. A situação do cliente, já com os sete estados. As entradas de fatura e de
   bloqueio são opcionais, porque só existem a partir dos planos 016 e 017:

   ```ts
   export type ClientStatus =
     | 'NO_CONTRACT'
     | 'AWAITING_ACCEPTANCE'
     | 'IN_GRACE'
     | 'CURRENT'
     | 'OVERDUE'
     | 'BLOCKED'
     | 'CANCELLED'

   export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
     NO_CONTRACT: 'Sem contrato',
     AWAITING_ACCEPTANCE: 'Aguardando aceite',
     IN_GRACE: 'Em carência',
     CURRENT: 'Em dia',
     OVERDUE: 'Vencido',
     BLOCKED: 'Bloqueado',
     CANCELLED: 'Cancelado',
   }

   export interface ClientStatusInput {
     contract: { status: ContractStatus; graceMonths: number; firstBilledCompetence: Date | null } | null
     now: Date
     hasOverdueInvoice?: boolean // existe a partir do plano 016
     // existe a partir do plano 017: o mesmo motivo que o authenticate usa.
     // OVERDUE/MANUAL = accessBlockedAt gravado; INACTIVE = empresa desativada.
     accessBlockReason?: 'OVERDUE' | 'MANUAL' | 'INACTIVE' | null
   }

   export function deriveClientStatus(input: ClientStatusInput): ClientStatus {
     const { contract, now } = input
     const reason = input.accessBlockReason ?? null
     if (reason === 'OVERDUE' || reason === 'MANUAL') return 'BLOCKED'
     if (input.hasOverdueInvoice) return 'OVERDUE'
     if (contract?.status === 'CANCELLED') return 'CANCELLED'
     // Desativada e não cancelada: ninguém da empresa entra, então é bloqueada
     if (reason === 'INACTIVE') return 'BLOCKED'
     if (!contract || contract.status === 'DRAFT') return 'NO_CONTRACT'
     if (contract.status === 'PENDING_ACCEPTANCE') return 'AWAITING_ACCEPTANCE'
     if (
       contract.graceMonths > 0 &&
       contract.firstBilledCompetence &&
       startOfCompetence(now) < contract.firstBilledCompetence
     ) {
       return 'IN_GRACE'
     }
     return 'CURRENT'
   }
   ```

6. O resto do arquivo:
   - os tipos literais `LicenseType`, `ContractStatus`, `ContractTermsStatus` e
     `ContractTermsOrigin`, com os mesmos valores dos enums do Prisma;
   - `BRAZIL_UFS`, a lista das 27 UFs `as const` (serve ao `z.enum` da API e ao
     select do web);
   - `isValidCpf(value: string): boolean`: 11 dígitos depois de tirar a
     pontuação, recusa os 11 iguais, confere os dois dígitos verificadores;
   - `formatCompetence(c: Date): string` → `'MM/AAAA'` e
     `formatBillingDate(d: Date): string` → `'DD/MM/AAAA'`, os dois lendo com
     `getUTC*`. Comente que o `formatDate` de `apps/web/src/lib/utils.ts` não
     serve para `@db.Date`, porque formata no fuso do navegador e mostra o dia
     anterior;
   - `BILLING_EVENT_TYPES`, a lista fechada `as const`, e o tipo
     `BillingEventType`: `CLIENT_CREATED`, `CLIENT_UPDATED`,
     `CONTRACT_DRAFT_CREATED`, `CONTRACT_DRAFT_UPDATED`, `PACKAGE_CREATED`,
     `PACKAGE_UPDATED`, `PACKAGE_ACTIVATED`, `PACKAGE_DEACTIVATED` e
     `SETTINGS_UPDATED`;
   - o tipo `BillingErrorCode`: `CONTRACT_NOT_DRAFT`, `PACKAGE_INACTIVE`,
     `INCLUDED_SEATS_REQUIRED`, `PACKAGE_CODE_TAKEN` e `CNPJ_TAKEN`;
   - os DTOs que a API devolve e o web consome. Datas como string ISO e dinheiro
     como string `'1234.56'`:
     - `LicensePackageDto`: `id`, `code`, `name`, `seats`, os quatro preços de
       tabela, `active`, `sortOrder`;
     - `BillingSettingsDto`: `overdueBlockDays`, `dueReminderDays`,
       `autoBlockEnabled`, `notifyEmail`, `updatedAt`;
     - `ClientProfileDto`: todos os campos de `ClientProfile`, menos as datas;
     - `ContractTermsDto`: `id`, `version`, `status`, `origin`,
       `proposedEffectiveFrom`, `effectiveFrom`, `packageId`, `packageCode`,
       `packageName`, `licenseType`, `includedSeats`, `extraSeats`,
       `packagePrice`, `extraSeatPrice`, `monthlyTotal`, `reason`,
       `createdByName`, `createdAt`;
     - `CompanyContractDto`: `id`, `status`, `startDate`, `graceMonths`,
       `firstBilledCompetence`, `dueDay`, `overdueBlockDays` e `terms`;
     - `ClientListItemDto`: `id`, `name`, `cnpj`, `idProtheus`, `active`,
       `createdAt`, `legalName`, `tradeName`, `status`, `contractStatus`,
       `current` (`packageName`, `licenseType`, `seatLimit`, `monthlyTotal`, ou
       `null`), `proposed` (`packageName`, `licenseType`, ou `null`) e
       `usedSeats`;
     - `ClientDetailDto`: `company` (`id`, `name`, `cnpj`, `idProtheus`,
       `active`, `createdAt`), `profile`, `contract`, `status`, `usedSeats` e
       `seatLimit`;
     - `BillingEventDto`: `id`, `type`, `actorName`, `fields` e `createdAt`;
     - as entradas `ClientProfileInput`, `ClientInput` (`name`, `cnpj`,
       `idProtheus`, `profile`) e `ContractDraftInput` (`packageId`,
       `licenseType`, `includedSeats?`, `extraSeats`, `packagePrice`,
       `extraSeatPrice`, `graceMonths`, `dueDay`, `overdueBlockDays`, `reason`).

   Os nomes não podem colidir com nenhum export de `index.ts` nem de
   `intelligence.ts` (hoje não colidem). Os enums do `@prisma/client` têm os
   mesmos nomes: num arquivo da API que precise dos dois, importe um com alias.

7. Testes em `apps/api/src/modules/billing/__tests__/billing-rules.test.ts`,
   importando de `@addere/types`:
   - **calendário**: aceite às 00:00 de São Paulo do dia 1
     (`2026-10-01T03:00:00Z`), carência 0 e vencimento no dia 1 → competência
     `2026-11-01`, vencimento `2026-12-01`;
   - **o caso do fuso**: aceite às 23:30 de 31/10 em São Paulo
     (`2026-11-01T02:30:00Z`), carência 0 → competência 11/2026, não 12/2026;
   - virada de dezembro para janeiro: aceite em 15/12/2026, carência 0,
     vencimento no dia 10 → competência 01/2027, vencimento 10/02/2027;
   - carência 0 contra carência 3, a partir do mesmo aceite;
   - vencimento nos dias 1 e 10 passa; nos dias 0 e 11 lança `RangeError`;
     carência −1 lança `RangeError`;
   - o exemplo do desenho (15/10/2026, carência 2, dia 10 → 01/2027 e
     10/02/2027);
   - `competenceStartInstant`: o instante devolvido cai no dia 1 em São Paulo e
     1 ms antes cai no último dia do mês anterior. Confira com
     `Intl.DateTimeFormat` com `timeZone: 'America/Sao_Paulo'` no próprio teste;
   - **termos**: `PROPOSED` e `WITHDRAWN` nunca contam, nem com
     `effectiveFrom`; sem `EFFECTIVE` devolve `null`; v1 efetivo em 15/10/2026 e
     v2 em 15/11/2026 → atual em 20/11 é v2, competência 11/2026 é v1 e
     competência 12/2026 é v2 (a mudança do dia 15 é cobrada no mês seguinte);
     termos com `effectiveFrom` exatamente em `competenceStartInstant(dez)`
     NÃO contam para dezembro (só a partir de janeiro); 1 ms antes contam; empate de `effectiveFrom` → vence a maior `version`;
   - **total mensal**: `'1800.00' + 3 × '95.50'` → `'2086.50'`; `'0.10' + 2 ×
     '0.20'` → `'0.50'` (sem erro de ponto flutuante); `'1800'` é aceito;
     `'18,00'` lança `RangeError`;
   - **situação**: um caso por estado; precedência (ativo com motivo
     `OVERDUE` e fatura vencida → `BLOCKED`; cancelado com fatura vencida →
     `OVERDUE`; cancelado e `INACTIVE` → `CANCELLED`; ativo e `INACTIVE` →
     `BLOCKED`; sem contrato e `INACTIVE` → `BLOCKED`); `DRAFT` → `NO_CONTRACT`; ativo com carência 2 antes da 1ª
     competência → `IN_GRACE`; ativo com carência 0 no mês do aceite →
     `CURRENT`;
   - **CPF**: `'111.444.777-35'` é válido; `'111.111.111-11'`,
     `'111.444.777-36'` e `'1234'` não são;
   - **formatação**: `formatBillingDate(new Date('2027-02-10T00:00:00Z'))` →
     `'10/02/2027'`; `formatCompetence(new Date('2027-01-01T00:00:00Z'))` →
     `'01/2027'`.

**Verificar**: `npm test --workspace=apps/api -- billing-rules` → passa;
`npm run type-check` → exit 0 (o mobile também compila o barrel);
`npm run test:unit --workspace=apps/mobile` → passa.

### Passo 4: API — módulo de cobrança, eventos, pacotes e regras

Arquivos novos em `apps/api/src/modules/billing/`: `billing.schema.ts`,
`billing-events.ts`, `catalog.service.ts`, `billing.routes.ts`,
`__tests__/billing-events.test.ts` e `__tests__/billing-routes.test.ts`. Além
deles, `apps/api/src/app.ts`.

1. **`billing.schema.ts`** (zod). Todo texto passa por `trim`, e string vazia
   vira `null`:
   - `money`: `z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Valor inválido')`;
   - `packageCreateSchema`: `code` (`/^[A-Z0-9_]{2,20}$/`), `name` (1 a 60),
     `seats` (inteiro de 1 a 10000, ou `null`), os quatro preços de tabela
     (`money` ou `null`) e `sortOrder` (inteiro de 0 a 1000);
     `packageUpdateSchema` é o mesmo **sem** `code`;
   - `settingsSchema`: `overdueBlockDays` (1 a 90), `dueReminderDays` (0 a 15)
     e `notifyEmail` (e-mail ou `null`). **Não declare `autoBlockEnabled`**: o
     zod remove a chave, e o valor gravado continua `false` (decisão padrão 4);
   - `clientProfileSchema`: `legalName` obrigatório (2 a 200); o resto opcional.
     `addressState` usa `z.enum(BRAZIL_UFS)`. `addressZip` aceita só 8 dígitos e
     é gravado sem pontuação. `legalRepCpf` passa por `isValidCpf` e é gravado só
     com dígitos. E-mails passam por `toLowerCase`. `notes` vai até 2000
     caracteres;
   - `clientSchema`: `name` (1 a 200), `cnpj` (`z.string().trim().min(1)`, a
     mesma regra de hoje), `idProtheus` (até 20, ou `null`) e `profile`
     (`clientProfileSchema`);
   - `contractDraftSchema`: `packageId` (uuid), `licenseType`, `includedSeats`
     (inteiro de 1 a 10000, opcional), `extraSeats` (inteiro de 0 a 10000,
     padrão 0), `packagePrice` e `extraSeatPrice` (`money`), `graceMonths` (0 a
     `GRACE_MONTHS_MAX`), `dueDay` (`DUE_DAY_MIN` a `DUE_DAY_MAX`),
     `overdueBlockDays` (1 a 90, ou `null` = padrão global) e `reason` (até 500,
     ou `null`);
   - `companyIdParam`: `{ companyId: z.string().uuid() }`.

2. **`billing-events.ts`**:
   - `changedFields(before, after, keys, moneyKeys = []): string[]` devolve os
     nomes, entre `keys`, cujo valor normalizado mudou. Na normalização, `null`,
     `undefined` e `''` são iguais; `Date` vira ISO; as chaves de `moneyKeys`
     são comparadas por `new Prisma.Decimal(v).toFixed(2)` dos dois lados.
     Assim `'1800'` e o `Decimal` `1800.00` não contam como mudança, e um texto
     como o número do endereço nunca é tratado como dinheiro;
   - `recordBillingEvent(db, { type, companyId, actorId, fields, ref? })` faz
     `db.billingEvent.create` com `payload: { fields, ...ref }`. O `ref` só
     aceita identificadores que não são dado pessoal (`packageCode`,
     `termsVersion`). O `db` é o `prisma` ou o `tx` de uma transação
     (`Prisma.TransactionClient`). Comentário obrigatório: **o payload nunca
     leva valor de campo**.
   - Regra: o evento é gravado na **mesma transação** da escrita, e uma
     alteração sem campo mudado não grava evento.

3. **`catalog.service.ts`**:
   - `listPackages()`: todos os pacotes, ativos e inativos, por `sortOrder` e
     `code`;
   - `createPackage(input, actorId)`: um código repetido (P2002) vira
     `conflict('Já existe um pacote com este código', 'PACKAGE_CODE_TAKEN')`.
     Grava `PACKAGE_CREATED`;
   - `updatePackage(id, input, actorId)`: grava `PACKAGE_UPDATED` com os campos
     mudados. Mudar o `seats` de um pacote não mexe em contrato nenhum, porque a
     quantidade é copiada para `ContractTerms.includedSeats`;
   - `setPackageActive(id, active, actorId)`: grava `PACKAGE_ACTIVATED` ou
     `PACKAGE_DEACTIVATED`;
   - `getSettings()`: lê a linha `global`. Se ela não existir (banco criado sem a
     migration de dados), cria com os padrões por `upsert`;
   - `updateSettings(input, actorId)`: grava `SETTINGS_UPDATED`;
   - mapeie `Decimal` para string com `.toFixed(2)`. Não confie no `toJSON` do
     `Decimal`, que devolve `'1800'` em vez de `'1800.00'`.

4. **`billing.routes.ts`**: `export default async function
   billingAdminRoutes(app)`, com `const superadmin = { preHandler:
   requireSuperAdmin }` em todas as rotas. O autor de cada ação é
   `request.user.sub`. Neste passo entram as rotas de pacotes e de regras:

   | Método | Rota | Corpo | Resposta |
   |---|---|---|---|
   | GET | `/admin/billing/packages` | — | `LicensePackageDto[]` |
   | POST | `/admin/billing/packages` | `packageCreateSchema` | 201 `LicensePackageDto` |
   | PATCH | `/admin/billing/packages/:id` | `packageUpdateSchema` | `LicensePackageDto` |
   | PATCH | `/admin/billing/packages/:id/active` | `{ active }` | `LicensePackageDto` |
   | GET | `/admin/billing/settings` | — | `BillingSettingsDto` |
   | PUT | `/admin/billing/settings` | `settingsSchema` | `BillingSettingsDto` |

5. **`app.ts`**: importe `billingAdminRoutes` e registre-o depois de
   `permissionsRoutes` (`:103`):
   `await app.register(billingAdminRoutes, { prefix: '/admin/billing' })`.

6. **Testes**:
   - `billing-events.test.ts`: `changedFields` com CPF trocado devolve
     `['legalRepCpf']`; mesmo valor com formatação diferente (`'1800'` contra
     `Decimal('1800.00')`) devolve `[]`; `null` contra `''` devolve `[]`;
   - `billing-routes.test.ts`, no padrão de `companies-scope.test.ts:1-57`:
     ADMIN e vendedor levam 403 em `GET /admin/billing/packages` e em
     `PUT /admin/billing/settings`, sem nenhuma escrita no mock;
     `POST /packages` com código repetido → 409 com `code:
     'PACKAGE_CODE_TAKEN'`; `PUT /settings` com `autoBlockEnabled: true` no
     corpo → 200, e o `update` do mock **não** recebe `autoBlockEnabled`;
     `PUT /settings` grava `SETTINGS_UPDATED` com os nomes dos campos.

**Verificar**: `npm test --workspace=apps/api -- billing` → passa;
`npm run type-check && npm run lint` → exit 0.

### Passo 5: API — clientes e contrato em rascunho

Arquivos: `apps/api/src/modules/billing/clients.service.ts` (novo),
`contract.service.ts` (novo), `billing.routes.ts` e
`__tests__/billing-routes.test.ts`.

1. **`clients.service.ts`**:
   - `listClients(now)`: um `prisma.company.findMany` com **`select`
     explícito** (`id`, `name`, `cnpj`, `idProtheus`, `active`, `createdAt`;
     do cadastro só `legalName` e `tradeName`; do contrato `status`,
     `graceMonths`, `firstBilledCompetence` e os termos `PROPOSED` e
     `EFFECTIVE` com o pacote), `orderBy: { name: 'asc' }` e `take: 500`.
     Nenhuma credencial do Protheus e nenhum dado pessoal do cadastro saem
     daqui;
   - as licenças em uso vêm de um `prisma.user.groupBy({ by: ['companyId'],
     where: { role: 'SALESPERSON', active: true, companyId: { not: null } },
     _count: { _all: true } })`. ADMIN não conta (regra de produto);
   - por empresa: `current` = `resolveCurrentTerms(terms, now)`, com
     `seatLimit = includedSeats + extraSeats` e `monthlyTotal` de
     `contractMonthlyTotal`; `proposed` = o `PROPOSED` de maior `version`;
     `status` = `deriveClientStatus({ contract, now })`. Neste plano nenhum
     termo é `EFFECTIVE`, então `current` sai `null` e o limite aparece como
     "sem limite";
   - `getClient(companyId, now)`: empresa (o mesmo `select` básico), cadastro
     completo, contrato com todos os termos (pacote e nome do autor),
     `usedSeats`, `seatLimit` e `status`. Empresa inexistente →
     `notFound('Cliente não encontrado')`;
   - `updateClient(companyId, input, actorId)`: numa transação, atualiza
     `name`, `cnpj` e `idProtheus` da `Company` e faz `upsert` do
     `ClientProfile` (empresa criada antes deste plano não tem cadastro). Grava
     `CLIENT_UPDATED` com os campos mudados, da empresa e do cadastro. CNPJ
     repetido (P2002) → `conflict('Já existe uma empresa com este CNPJ',
     'CNPJ_TAKEN')`;
   - `listClientEvents(companyId)`: os 100 eventos mais recentes da empresa,
     com o nome do autor (`include: { actor: { select: { name: true } } }`),
     mapeados para `BillingEventDto`;
   - `createClientProfile(tx, companyId, profile)`: exportada para o passo 6.

2. **`contract.service.ts`** — `saveContractDraft(companyId, input, actorId)`,
   toda numa `prisma.$transaction`:
   1. empresa inexistente → `notFound('Cliente não encontrado')`;
   2. pacote inexistente → `notFound('Pacote não encontrado')`; pacote
      desativado → `unprocessable('Pacote desativado: escolha outro',
      undefined, 'PACKAGE_INACTIVE')`;
   3. `includedSeats = pacote.seats ?? input.includedSeats`. No pacote de
      quantidade fixa, o valor do corpo é ignorado. No Ilimitado sem quantidade
      → `unprocessable('Informe a quantidade de licenças do pacote', undefined,
      'INCLUDED_SEATS_REQUIRED')`;
   4. contrato existente fora de `DRAFT` →
      `conflict('Este contrato já saiu do rascunho', 'CONTRACT_NOT_DRAFT')`,
      sem escrever nada. O plano 014 muda isto: editar em `PENDING_ACCEPTANCE`
      vai cancelar o documento enviado e voltar para `DRAFT` (decisão padrão
      11);
   5. sem contrato, cria o `CompanyContract` em `DRAFT` e os termos versão 1,
      `PROPOSED`, origem `CONTRACT`, com `createdById = actorId`. Para a versão,
      use `findFirst` ordenado por `version` desc, não `aggregate`: o mock
      devolve `{}` para `aggregate`;
   6. com contrato em `DRAFT`, atualiza o contrato (`graceMonths`, `dueDay`,
      `overdueBlockDays`) e os termos `PROPOSED` existentes **no lugar**, sem
      versão nova. Se o rascunho não tiver termos `PROPOSED`, cria a próxima
      versão;
   7. grava `CONTRACT_DRAFT_CREATED` ou `CONTRACT_DRAFT_UPDATED`, com os campos
      mudados do contrato e dos termos e `ref: { termsVersion }`. Nada mudou →
      nenhum evento;
   8. **nunca** lê nem escreve `company.intelligenceEnabled`. O tipo "Com
      Inteligência" só passa a ligar alguma coisa no aceite (plano 014).

   Dois SUPERADMIN criando o mesmo contrato ao mesmo tempo esbarram no
   `companyId @unique` (P2002 → 409 "Registro duplicado", pelo handler
   global). É aceitável: quem perdeu recarrega a ficha.

3. **Rotas novas** em `billing.routes.ts`, todas com `requireSuperAdmin`:

   | Método | Rota | Corpo | Resposta |
   |---|---|---|---|
   | GET | `/admin/billing/clients` | — | `ClientListItemDto[]` |
   | GET | `/admin/billing/clients/:companyId` | — | `ClientDetailDto` |
   | PUT | `/admin/billing/clients/:companyId` | `clientSchema` | `ClientDetailDto` |
   | GET | `/admin/billing/clients/:companyId/events` | — | `BillingEventDto[]` |
   | PUT | `/admin/billing/clients/:companyId/contract` | `contractDraftSchema` | `CompanyContractDto` |

4. **Testes** em `billing-routes.test.ts`:
   - ADMIN e vendedor → 403 nas cinco rotas, e o mock não recebe nenhuma
     consulta de cliente;
   - `GET /clients`: `usedSeats` vem do `groupBy`; sem contrato e com contrato
     `DRAFT` → `status: 'NO_CONTRACT'`; com `DRAFT` → `proposed` preenchido e
     `current: null`; a resposta não tem `legalRepCpf`, `contactEmail`,
     `billingEmail` nem `passProtheus` (confira as chaves);
   - `PUT /clients/:id` trocando só o CPF → o evento sai com `payload: {
     fields: ['legalRepCpf'] }`, e `JSON.stringify` da chamada ao
     `billingEvent.create` **não** contém os dígitos do CPF;
   - `PUT /clients/:id` com os mesmos valores → nenhum evento;
   - `PUT /clients/:id` com CNPJ repetido (mock lança P2002) → 409 com `code:
     'CNPJ_TAKEN'`;
   - `PUT /contract` sem contrato → cria `DRAFT` e termos v1 `PROPOSED` dentro
     do `$transaction`; com o pacote P10, `includedSeats` sai 10 mesmo com 99 no
     corpo; evento `CONTRACT_DRAFT_CREATED`;
   - `PUT /contract` com o Ilimitado sem `includedSeats` → 422
     `INCLUDED_SEATS_REQUIRED`; com 100 → `includedSeats` 100;
   - `PUT /contract` com pacote desativado → 422 `PACKAGE_INACTIVE`;
   - `PUT /contract` com contrato `ACTIVE` no mock → 409 `CONTRACT_NOT_DRAFT`, e
     nenhum `create` nem `update` foi chamado;
   - `PUT /contract` com `dueDay` 0 ou 11, ou com `graceMonths` −1 → 400;
   - `PUT /contract` com `DRAFT` existente → atualiza os mesmos termos (nenhum
     `contractTerms.create`), e o evento `CONTRACT_DRAFT_UPDATED` lista só os
     campos mudados;
   - `PUT /contract` com `licenseType: 'INTELLIGENCE'` → `prismaMock.company.update`
     **não** é chamado.

**Verificar**: `npm test --workspace=apps/api -- billing` → passa;
`npm run type-check && npm run lint` → exit 0;
`grep -rn "intelligenceEnabled" apps/api/src/modules/billing` → vazio.

### Passo 6: API — `POST /companies` aceita o cadastro

Arquivos: `apps/api/src/modules/companies/companies.schema.ts`,
`companies.service.ts`, `companies.routes.ts` e
`apps/api/src/modules/billing/__tests__/billing-routes.test.ts`.

1. `companies.schema.ts:8-12`: acrescente `profile:
   clientProfileSchema.optional()`, importado de `../billing/billing.schema`. O
   corpo antigo, sem `profile`, continua válido.
2. `companies.service.ts:69-77`: `createCompany(input, actorId)` passa a rodar
   numa `prisma.$transaction`. Cria a `Company` (`name`, `cnpj`,
   `idProtheus`); se houver `profile`, cria o cadastro com
   `createClientProfile`; e grava sempre `CLIENT_CREATED`, com os nomes dos
   campos preenchidos (`[]` quando veio só o básico). CNPJ repetido (P2002) →
   `conflict('Já existe uma empresa com este CNPJ', 'CNPJ_TAKEN')`.
3. `companies.routes.ts:66-70`: passe `request.user.sub` como `actorId`. A
   resposta continua sendo a empresa criada, com 201.
4. Testes (`describe('POST /companies com cadastro')` em
   `billing-routes.test.ts`):
   - com `profile` → `company.create`, `clientProfile.create` e
     `billingEvent.create` (tipo `CLIENT_CREATED`) dentro do `$transaction`;
   - sem `profile` → 201, como antes, sem `clientProfile.create`, com o evento;
   - CNPJ repetido → 409 `CNPJ_TAKEN`;
   - CPF inválido no `profile` → 400, sem nenhuma escrita;
   - ADMIN → 403 (já era, mas fica registrado junto).

**Verificar**: `npm test --workspace=apps/api` → todos passam, inclusive
`companies-scope.test.ts` sem alteração; `npm run type-check` → exit 0.

### Passo 7: Web — código de erro e requisito `companyAdmin`

Arquivos: `apps/web/src/lib/api.ts`, `lib/__tests__/api-errors.test.ts`,
`lib/nav-gating.ts` e `lib/__tests__/nav-gating.test.ts`.

1. Em `api.ts`, ao lado de `getApiErrorMessage` (`:108-114`):

   ```ts
   // Código legível por máquina da API (AppError.code), ex.: 'CNPJ_TAKEN'
   export function getApiErrorCode(err: unknown): string | null {
     if (err && typeof err === 'object' && 'response' in err) {
       const code = (err as { response?: { data?: { code?: unknown } } }).response?.data?.code
       if (typeof code === 'string' && code) return code
     }
     return null
   }
   ```

   Testes: devolve o código de um erro axios; `null` sem `code`, com `code` que
   não é string, com `null` e com `new Error()`.

2. Em `nav-gating.ts`, acrescente `'companyAdmin'` ao `NavRequirement` e trate-o
   **antes** da linha `if (ctx.isSuperAdmin) return true` (`:26`):

   ```ts
   // Só o ADMIN da empresa — o SUPERADMIN tem o equivalente na Gestão Addere
   if (requires === 'companyAdmin') return ctx.isAdmin && !ctx.isSuperAdmin
   ```

   Testes: ADMIN vê; SUPERADMIN, gerente e "sem permissão" não veem. Mais um
   caso de `filterNavGroups` com o grupo Empresa como fica depois do passo 8
   (Vendedores `'admin'`, Configurações `'admin'`, Empresas `'companyAdmin'`):
   o ADMIN vê os três e o SUPERADMIN vê só os dois primeiros. Os casos
   existentes não mudam.

**Verificar**: `npm test --workspace=apps/web` → passa; `npm run type-check` →
exit 0.

### Passo 8: Web — Gestão Addere, lista de Clientes e redirect do `/dashboard`

Arquivos: `apps/web/src/app/(admin)/layout.tsx`, `lib/home-redirect.ts`,
`lib/__tests__/home-redirect.test.ts`, `lib/schemas.ts`, `lib/billing-ui.ts`
(novo), `lib/__tests__/billing-ui.test.ts` (novo), `hooks/useBilling.ts`
(novo), `hooks/useCompanies.ts`, `app/(admin)/gestao/layout.tsx` (novo),
`app/(admin)/gestao/clientes/page.tsx` (novo),
`app/(admin)/gestao/clientes/ClientFormModal.tsx` (novo),
`app/(admin)/dashboard/page.tsx`, `dashboard/CreateCompanyModal.tsx` (removido)
e os três comentários.

1. **Menu** (`layout.tsx`):
   - novo grupo, o **primeiro** de `NAV_GROUPS`:

     ```ts
     {
       // Gestão Addere (plano 013): cadastro comercial, contrato e pacotes — só
       // o SUPERADMIN. Painel, Faturas, Solicitações e Modelos de contrato
       // entram nos planos 014 a 018.
       title: 'Gestão Addere',
       items: [
         {
           href: '/gestao/clientes',
           label: 'Clientes',
           // A ficha técnica (/empresas/[id]) é aberta a partir do cliente
           match: (p) => p.startsWith('/gestao/clientes') || p.startsWith('/empresas'),
           icon: Building2,
           requires: 'superadmin',
         },
         {
           href: '/gestao/pacotes',
           label: 'Pacotes e regras',
           match: (p) => p.startsWith('/gestao/pacotes'),
           icon: Package,
           requires: 'superadmin',
         },
         // o item Piloto, movido do grupo Empresa sem outra mudança
       ],
     },
     ```

   - no grupo Empresa, o item Empresas passa a `href: '/empresas'`, `match:
     (p) => p.startsWith('/empresas')` e `requires: 'companyAdmin'`, com o mesmo
     `hrefForCompany`. Atualize o comentário dele. O Piloto sai deste grupo;
   - importe `Package` do `lucide-react`. Nada de ícone de fora do Lucide.

2. **Home** (`home-redirect.ts:17-20`): o SUPERADMIN cai em
   `'/gestao/clientes'`. O comentário diz "até o plano 018 criar `/gestao`". No
   teste (`:27-33`), troque o esperado e o título do caso.

3. **`lib/billing-ui.ts`** (puro, testável):
   - `CLIENT_STATUS_BADGE: Record<ClientStatus, …>`: sem contrato e cancelado →
     `neutral`; aguardando aceite e em carência → `info`; em dia → `success`;
     vencido → `warning`; bloqueado → `danger`. Nenhuma cor nova;
   - `BILLING_EVENT_LABELS: Record<BillingEventType, string>` ("Cliente
     cadastrado", "Cadastro alterado", "Rascunho do contrato criado", "Rascunho
     do contrato alterado", "Pacote criado", "Pacote alterado", "Pacote
     ativado", "Pacote desativado", "Regras de cobrança alteradas"). O `Record`
     obriga cada tipo novo dos planos seguintes a ganhar rótulo;
   - o tipo do mapa de variantes repete a união do `Badge`
     (`'success' | 'warning' | 'danger' | 'info' | 'neutral'`), que não é
     exportada. Não mexa em `components/ui/Badge.tsx`;
   - `BILLING_FIELD_LABELS`: o rótulo em português de cada campo que aparece no
     histórico (`legalRepCpf` → "CPF do representante", `packagePrice` → "Valor
     do pacote", `dueDay` → "Dia de vencimento" etc.). Campo sem rótulo aparece
     com o nome cru;
   - `LICENSE_TYPE_LABELS` e `CONTRACT_STATUS_LABELS`;
   - `moneyInputToApi(text): string | null`: usa `parseOfficialNumber(text,
     'currency')` de `lib/reconciliation.ts` e devolve `toFixed(2)`, ou `null`
     para vazio ou inválido.
   - Teste (`billing-ui.test.ts`): `'1.800,00'` → `'1800.00'`, `'95,5'` →
     `'95.50'`, `''` → `null`, `'abc'` → `null`; `CLIENT_STATUS_BADGE` tem as
     sete chaves.

4. **`hooks/useBilling.ts`**: `billingKeys` (`all: ['billing']`, `clients`,
   `client(id)`, `events(id)`, `packages`, `settings`); as queries
   `useClients`, `useClient(id)`, `useClientEvents(id)`, `usePackages` e
   `useBillingSettings`; as mutations `useCreateClient` (`POST /companies`),
   `useUpdateClient(id)`, `useSaveContractDraft(id)`, `useCreatePackage`,
   `useUpdatePackage`, `useSetPackageActive` e `useUpdateBillingSettings`.
   Mutação de cliente invalida `billingKeys.all` **e** `companiesKeys.all`,
   porque o seletor de empresa do menu lê `GET /companies`.

5. **`hooks/useCompanies.ts`**: depois de trocar o `/dashboard`, confirme com
   `grep -rn "useCreateCompany\|useUpdateCompany" apps/web/src` que ninguém mais
   os usa e remova os dois. `companiesKeys`, `useCompanies` e
   `useToggleCompanyActive` ficam.

6. **`lib/schemas.ts`**: `clientFormSchema`, no padrão do `branchSchema`
   (`:23-37`): strings do formulário, com obrigatórios "Nome no sistema",
   "CNPJ" (14 dígitos depois de tirar a pontuação) e "Razão social". O CPF, se
   preenchido, passa por `isValidCpf` de `@addere/types`; e-mails passam por
   `z.string().email()` quando preenchidos. Exporte `ClientFormData`.

7. **`app/(admin)/gestao/layout.tsx`**: cópia de `dashboard/layout.tsx`
   (`<SuperAdminOnly>`), com o comentário "Gestão Addere — só o SUPERADMIN".

8. **`gestao/clientes/ClientFormModal.tsx`**: react-hook-form com
   `zodResolver(clientFormSchema)`, no padrão do `BranchModal`
   (`EntityModals.tsx:88-160`). Ele tem os modos `create` e `edit`:
   - seções Empresa, Endereço, Representante legal, Contatos e Observações, com
     `SECTION_TITLE` igual ao do `EntityModals` (copie a constante; não importe
     de lá);
   - grade `grid-cols-1 sm:grid-cols-2`. Nunca duas ou três colunas fixas: o
     plano 008 corrigiu modais quebrando a 390 px;
   - máscaras de `lib/utils.ts`: `maskDocument` no CNPJ e no CPF e `maskCEP` no
     CEP. UF com `FormSelect` sobre `BRAZIL_UFS`. Observações com `Textarea`;
   - no submit, string vazia vira `null`, e CPF e CEP vão só com dígitos. No
     modo `create`, chama `useCreateClient` com `{ name, cnpj, idProtheus,
     profile }` e, no sucesso, leva à ficha (`/gestao/clientes/{id}`). No modo
     `edit`, chama `useUpdateClient`;
   - no erro, `getApiErrorCode(err) === 'CNPJ_TAKEN'` vira `setError('cnpj',
     …)`; o resto vai para `toast.error(getApiErrorMessage(err, …))`;
   - no modo `edit` de empresa sem cadastro, "Razão social" começa com o
     `name` da empresa.

9. **`gestao/clientes/page.tsx`**: título "Clientes" e botão "Novo cliente";
   `StatCard` Total, Ativas e Inativas, como o `/dashboard` tinha; `Table` com
   as colunas Cliente (nome e CNPJ), Situação (`Badge` com
   `CLIENT_STATUS_LABELS`, mais "rascunho" em texto discreto quando
   `contractStatus === 'DRAFT'`), Pacote (o atual; senão o proposto com
   "(proposto)"; senão "—"), Licenças (`usedSeats / seatLimit`, com "—" para sem
   limite), Valor mensal (`formatCurrency` do atual, ou "—") e Empresa
   (`StatusBadge` Ativa/Inativa). A linha abre a ficha. Estados de carregando,
   vazio ("Nenhum cliente cadastrado" / "Cadastre o primeiro cliente para
   montar o contrato.") e erro com "Tentar novamente", como em
   `empresas/[id]/page.tsx:52-72`.

10. **`dashboard/page.tsx`** vira um redirect no servidor, e o
    `dashboard/layout.tsx` fica como está:

    ```tsx
    import { redirect } from 'next/navigation'

    // A lista de empresas virou Clientes, na Gestão Addere (plano 013).
    // Mantido para links e favoritos antigos.
    export default function DashboardRedirect() {
      redirect('/gestao/clientes')
    }
    ```

11. **Apague `dashboard/CreateCompanyModal.tsx`** (`git rm`). A substituição
    pelo `ClientFormModal` foi aprovada no desenho de 15/10/2026, e é o único
    arquivo que este plano remove.

12. **Comentários**: `app/page.tsx:3-4` e `middleware.ts:24` passam a dizer
    "SUPERADMIN → `/gestao/clientes`"; `app/(admin)/empresas/layout.tsx:3-4`
    passa a dizer que a lista de empresas é a de Clientes, na Gestão Addere.

**Verificar**: `npm run type-check && npm run lint` → exit 0;
`npm test --workspace=apps/web` → passa; `npm run build:web` → exit 0;
`grep -rn "/dashboard" apps/web/src --include=*.ts --include=*.tsx` → só
`lib/__tests__/middleware.test.ts` (caminho qualquer) e o item sintético de
`lib/__tests__/nav-gating.test.ts:101`. Qualquer outra ocorrência é link morto
ou comentário desatualizado.

### Passo 9: Web — ficha do cliente

Arquivos novos em `apps/web/src/app/(admin)/gestao/clientes/[id]/`:
`page.tsx`, `tabs/CadastroTab.tsx`, `tabs/ContratoTab.tsx` e
`tabs/HistoricoTab.tsx`. Além deles, `lib/schemas.ts` e
`app/(admin)/empresas/[id]/page.tsx`.

1. **`page.tsx`** (siga o esboço):
   - "Voltar" para `/gestao/clientes`; nome; linha com nome fantasia, CNPJ e
     código Protheus; `Badge` da situação;
   - botões "Integração", que leva a `/empresas/{id}` (ícone `ExternalLink`), e
     "Desativar empresa"/"Ativar empresa", copiado de
     `empresas/[id]/page.tsx:111-121`. O botão usa `useToggleCompanyActive` e,
     no `onSuccess` da chamada, invalida `billingKeys.all`;
   - `StatCard` Licenças em uso (`14 / sem limite`), Pacote, Valor mensal e
     Empresa;
   - abas com o componente `Tabs` (`components/ui/Tabs.tsx`): `cadastro`,
     `contrato` e `historico`, no estado local, como em `empresas/[id]`;
   - carregando, erro e "Cliente não encontrado", como em
     `empresas/[id]/page.tsx:52-72`.

2. **`CadastroTab.tsx`**: as seções só de leitura. CPF e CEP formatados com
   `formatDocumentDisplay` e `formatCEPDisplay`; campo vazio aparece como "—".
   O botão "Editar cadastro" abre o `ClientFormModal` em modo `edit`. Sem
   cadastro, mostra "Cadastro comercial não preenchido" e o botão "Preencher
   cadastro".

3. **`ContratoTab.tsx`**: react-hook-form com `contractDraftFormSchema` (novo em
   `lib/schemas.ts`, com strings do formulário):
   - "Pacote" lista os pacotes ativos (`usePackages`). Se o rascunho usa um
     pacote desativado, ele aparece com "(desativado)" e a API recusa salvar
     (`PACKAGE_INACTIVE`);
   - "Licenças incluídas" fica só de leitura com o `seats` do pacote, e só é
     editável no Ilimitado;
   - ao trocar o pacote ou o tipo, os campos de preço recebem o preço de tabela
     correspondente, quando existe, e continuam editáveis. A dica "tabela: R$ X"
     fica ao lado. No Ilimitado, o valor do pacote não é pré-preenchido
     (decisão de desenho 3);
   - "Total mensal" ao vivo, com `contractMonthlyTotal` sobre os valores
     convertidos por `moneyInputToApi`;
   - "Dia de vencimento" é um `FormSelect` de 1 a 10. "Carência (meses)" vai de
     0 a 12, com a dica "0 = sem carência". "Dias para suspender" tem a caixa
     "usar o padrão (N)", com N vindo de `useBillingSettings`; marcada, envia
     `overdueBlockDays: null`;
   - a prévia "Se aceito hoje (DD/MM/AAAA): 1ª competência cobrada MM/AAAA · 1ª
     fatura vence em DD/MM/AAAA", recalculada com `watch()` e
     `computeBillingCalendar({ acceptDate: new Date(), graceMonths, dueDay })`,
     formatada com `formatCompetence` e `formatBillingDate`. Embaixo, "O mês do
     aceite não é cobrado." e, com carência, "Depois dele, N meses de
     carência.". Com valor inválido, a prévia some; não deixe o `RangeError`
     escapar;
   - "Salvar rascunho" chama `useSaveContractDraft`. O erro
     `CONTRACT_NOT_DRAFT` mostra um toast e recarrega a ficha;
   - contrato fora de `DRAFT` (só acontece a partir do 014): o formulário fica
     só de leitura, com a frase "Este contrato já saiu do rascunho.";
   - o título "Rascunho — o cliente ainda não vê este contrato.". **Não ponha**
     os botões "Pré-visualizar documento", "Enviar para aceite" nem "Propor
     aditivo": são do 014;
   - a tabela "Versões dos termos": versão, status, pacote e tipo, licenças
     (incluídas + adicionais), total mensal, autor e data.

4. **`HistoricoTab.tsx`**: a lista de `useClientEvents`, com data e hora por
   `Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })`.
   Aqui o fuso do navegador está certo, porque `createdAt` é um instante, não um
   `@db.Date`. Cada linha mostra também
   `BILLING_EVENT_LABELS[type]`, autor ("Sistema" quando é `null`) e "Campos:"
   com os rótulos de `BILLING_FIELD_LABELS`. Lista vazia: "Nenhuma alteração
   registrada.".

5. **`empresas/[id]/page.tsx:90-102`**: o "Voltar" do SUPERADMIN passa a
   `router.push(`/gestao/clientes/${company.id}`)`. Atualize o comentário de
   `:90-91`. O resto do arquivo não muda.

**Verificar**: `npm run type-check && npm run lint` → exit 0;
`npm test --workspace=apps/web` → passa; `npm run build:web` → exit 0.

### Passo 10: Web — Pacotes e regras

Arquivos novos: `apps/web/src/app/(admin)/gestao/pacotes/page.tsx` e
`gestao/pacotes/PackageFormModal.tsx`. Além deles, `lib/schemas.ts`.

1. **Tabela de pacotes** (`usePackages`): Código, Nome, Licenças ("no
   contrato" quando `seats` é `null`), Padrão, Com Inteligência, Adicional
   (Padrão / Com Inteligência), Status (`StatusBadge`) e as ações Editar e
   Ativar/Desativar. Embaixo, a frase "O preço de tabela só pré-preenche o
   contrato; o valor é negociado com cada cliente.".
2. **`PackageFormModal`** (react-hook-form + `packageFormSchema`): o código
   só é editável na criação. "Licenças" vazio quer dizer "quantidade definida no
   contrato". Os preços são opcionais e convertidos com `moneyInputToApi`.
   `PACKAGE_CODE_TAKEN` vira erro no campo "Código".
3. **Regras de cobrança** (`useBillingSettings`): os campos "Dias de atraso para
   suspender (padrão)", "Lembrete antes do vencimento (dias)" e "E-mail da
   Addere para os avisos", com o botão "Salvar regras". As dicas dizem que os
   avisos e a suspensão valem quando o faturamento estiver ligado. O
   **bloqueio automático aparece só como texto**: "Desligado. Liga depois que a
   versão nova do app estiver no ar." Nada de `Switch` aqui (decisão padrão 4).

**Verificar**: `npm run type-check && npm run lint` → exit 0;
`npm run build:web` → exit 0;
`grep -rn "autoBlockEnabled" 'apps/web/src/app/(admin)/gestao'` → só leitura,
nenhum envio.

### Passo 11: Migration (por último)

Arquivo: `packages/db/prisma/migrations/<timestamp>_billing_clients_contracts/migration.sql`.

> ⚠️ **NÃO rode `npm run db:migrate`, `prisma migrate dev`, `prisma migrate
> reset` nem `prisma db push`. NÃO conecte no Neon (staging nem produção).**
> `apps/api/.env` e `packages/db/.env` apontam para o banco real, e o Prisma os
> lê sozinho. Todo comando abaixo leva as duas URLs na **mesma linha**. Antes de
> apertar Enter, confira que as duas dizem `localhost`.

Cada bloco abaixo é **uma chamada só**, a partir da raiz do monorepo: variável
de shell e `cd` não sobrevivem de uma chamada para a outra. As credenciais
`addere_dev_user`/`addere_dev_password` são as do `docker-compose.yml`, só de
desenvolvimento local.

1. Nome da pasta: `date -u +%Y%m%d%H%M%S` no momento da execução, mais
   `_billing_clients_contracts`. O timestamp tem de ser posterior ao da
   migration mais recente (hoje, `20261014120000_intel_llm_calls`; confira com
   `ls packages/db/prisma/migrations | tail -3`). Abaixo, `<pasta>` é esse nome.

2. Suba o Postgres local e crie dois bancos descartáveis:

   ```bash
   docker compose up -d db && \
     docker compose exec db createdb -U addere_dev_user addere_p013 && \
     docker compose exec db createdb -U addere_dev_user addere_p013_shadow
   ```

3. Gere o DDL (delta, nunca `--from-empty`). A saída vai primeiro para um arquivo
   fora de `migrations/`: se o `>` criasse o `migration.sql` vazio dentro da
   pasta, o `--from-migrations` o leria junto.

   ```bash
   cd packages/db && L=postgresql://addere_dev_user:addere_dev_password@localhost:5432 && \
     DATABASE_URL=$L/addere_p013 DATABASE_URL_DIRECT=$L/addere_p013 npx prisma migrate diff \
       --from-migrations ./prisma/migrations \
       --to-schema-datamodel ./prisma/schema.prisma \
       --shadow-database-url $L/addere_p013_shadow \
       --script > ../../billing_013.sql
   ```

   ```bash
   mkdir -p packages/db/prisma/migrations/<pasta> && \
     mv billing_013.sql packages/db/prisma/migrations/<pasta>/migration.sql
   ```

   Se preferir escrever à mão, o resultado tem de ser o mesmo.

4. Edite o arquivo gerado:
   - **no topo**, o comentário em português, no formato de
     `20261014120000_intel_llm_calls`:

     ```sql
     -- Gestão Addere (plano 013): cadastro comercial, catálogo de pacotes,
     -- contrato com termos versionados, histórico e regras de cobrança.
     -- Só cria tipos e tabelas novas; nenhuma tabela existente é alterada.
     -- Dados: os quatro pacotes (preço de tabela em branco: o valor é negociado
     -- por cliente) e a linha única de regras, com o bloqueio automático
     -- desligado — ele só liga depois do OTA do app (plano 017).
     ```

   - **no fim**, os dados:

     ```sql
     -- Catálogo inicial: 10, 20, 30 e Ilimitado (quantidade digitada no contrato)
     INSERT INTO "billing_license_packages" ("id", "code", "name", "seats", "active", "sortOrder", "createdAt", "updatedAt")
     VALUES
       (gen_random_uuid()::text, 'P10', 'Pacote 10', 10, true, 10, NOW(), NOW()),
       (gen_random_uuid()::text, 'P20', 'Pacote 20', 20, true, 20, NOW(), NOW()),
       (gen_random_uuid()::text, 'P30', 'Pacote 30', 30, true, 30, NOW(), NOW()),
       (gen_random_uuid()::text, 'UNLIMITED', 'Ilimitado', NULL, true, 40, NOW(), NOW())
     ON CONFLICT ("code") DO NOTHING;

     -- Regras globais (linha única)
     INSERT INTO "billing_settings" ("id", "overdueBlockDays", "dueReminderDays", "autoBlockEnabled", "updatedAt")
     VALUES ('global', 15, 3, false, NOW())
     ON CONFLICT ("id") DO NOTHING;
     ```

     O `gen_random_uuid()` é nativo do Postgres desde a versão 13 (o local é o
     16). Os preços de tabela ficam nulos de propósito.

5. Confira o conteúdo. O arquivo só pode ter: 4 `CREATE TYPE` (`LicenseType`,
   `ContractStatus`, `ContractTermsStatus`, `ContractTermsOrigin`), 6
   `CREATE TABLE` (`billing_*`), os índices e uniques delas, 7 `ADD CONSTRAINT …
   FOREIGN KEY` (cadastro → empresa, contrato → empresa, termos → contrato,
   termos → pacote, termos → usuário, evento → empresa, evento → usuário) e os
   dois `INSERT`:

   ```bash
   grep -nE "DROP|ALTER TABLE \"(companies|users)\"|ALTER TYPE" \
     packages/db/prisma/migrations/<pasta>/migration.sql
   ```

   → vazio. Qualquer linha aqui é PARADA.

6. Aplique num banco limpo e confira que o schema bate:

   ```bash
   cd packages/db && L=postgresql://addere_dev_user:addere_dev_password@localhost:5432 && \
     DATABASE_URL=$L/addere_p013 DATABASE_URL_DIRECT=$L/addere_p013 npx prisma migrate deploy && \
     DATABASE_URL=$L/addere_p013 DATABASE_URL_DIRECT=$L/addere_p013 npx prisma migrate diff \
       --from-url $L/addere_p013 --to-schema-datamodel ./prisma/schema.prisma --exit-code
   ```

   → o `deploy` aplica todas as migrations sem erro; o `diff` sai com **exit 0**
   (vazio).

7. Confira os dados:

   ```bash
   docker compose exec db psql -U addere_dev_user -d addere_p013 \
     -c 'SELECT code, seats, "sortOrder" FROM billing_license_packages ORDER BY "sortOrder"' \
     -c 'SELECT id, "overdueBlockDays", "dueReminderDays", "autoBlockEnabled" FROM billing_settings'
   ```

   → P10/10, P20/20, P30/30, UNLIMITED/vazio; `global | 15 | 3 | f`.

8. Apague os bancos descartáveis:

   ```bash
   docker compose exec db dropdb -U addere_dev_user addere_p013 && \
     docker compose exec db dropdb -U addere_dev_user addere_p013_shadow
   ```

9. Commit só com a pasta da migration.

**Verificar**: os itens 5, 6 e 7 acima; `git show --stat HEAD` → só o
`migration.sql`.

### Passo 12: Verificação final e status

1. Rode tudo, da raiz:
   `npm run db:generate && npm run lint && npm run type-check && npm test && npm run build:api && npm run build:web`
   → exit 0.
2. Rode os greps dos critérios de conclusão.
3. Atualize a linha do 013 em `plans/README.md` (tabela da Fase 6) para
   **DONE**, com uma linha sobre desvios, se houver. Commit
   `docs(plans): 013 concluído`.

## Plano de testes

Os testes novos, por arquivo:

- `apps/api/src/lib/__tests__/error-handler.test.ts`: 3 casos de `code` (passo 2).
- `apps/api/src/modules/billing/__tests__/billing-rules.test.ts`: calendário,
  fuso, termos, total mensal, situação, CPF e formatação (passo 3). É o arquivo
  que protege a regra "entrou no mês, cobra no seguinte" e o caso "22h do dia
  31", que os planos 016 e 018 vão usar.
- `apps/api/src/modules/billing/__tests__/billing-events.test.ts`:
  `changedFields` (passo 4).
- `apps/api/src/modules/billing/__tests__/billing-routes.test.ts`: permissão,
  pacotes, regras (com `autoBlockEnabled` ignorado), lista sem dado pessoal,
  evento sem valor, rascunho (fixo, Ilimitado, desativado, fora de `DRAFT`,
  limites de `dueDay` e `graceMonths`, edição no lugar, Inteligência intocada)
  e `POST /companies` com e sem cadastro (passos 4 a 6).
- `apps/web/src/lib/__tests__/api-errors.test.ts`: `getApiErrorCode` (passo 7).
- `apps/web/src/lib/__tests__/nav-gating.test.ts`: `companyAdmin` e o grupo
  Empresa novo (passo 7).
- `apps/web/src/lib/__tests__/home-redirect.test.ts`: a home nova do
  SUPERADMIN (passo 8).
- `apps/web/src/lib/__tests__/billing-ui.test.ts`: dinheiro e mapa de situação
  (passo 8).

Padrões a espelhar: `companies/__tests__/companies-scope.test.ts` (rotas com
mock do Prisma e JWT assinado) e `lib/__tests__/nav-gating.test.ts` (gating
puro). O Vitest do web só roda `.test.ts`: telas não ganham teste de render, e
por isso a lógica fica nos módulos puros.

**Migration**: aplicada num Postgres local limpo com `migrate deploy`; o
`migrate diff --exit-code` contra o schema sai com 0; os dados conferidos por
`SELECT` (passo 11).

**No staging, depois do merge (operador, não o executor)**:

1. Entrar como SUPERADMIN: a home é `/gestao/clientes`, o menu mostra Gestão
   Addere, e "Empresas" sumiu.
2. Abrir `/dashboard`: redireciona para `/gestao/clientes`.
3. Criar um cliente fictício pelo "Novo cliente", com representante e CPF
   válido: a ficha abre, e o Histórico mostra "Cliente cadastrado".
4. Na aba Contrato, montar Pacote 10 Padrão, carência 0 e vencimento no dia 10:
   a prévia mostra a competência do mês seguinte e o vencimento no dia 10 do mês
   depois dele. Salvar e conferir a versão 1 "Proposto".
5. Trocar para Ilimitado com 100 licenças, salvar e conferir o Histórico com os
   campos mudados.
6. Abrir "Integração": vai para `/empresas/{id}`, e o "Voltar" de lá volta à
   ficha.
7. Entrar como ADMIN da empresa: "Empresas" leva à ficha da própria empresa;
   `/gestao/clientes` manda para `/inteligencia`.
8. No Neon do staging (SQL Editor, pelo operador): `SELECT code FROM
   billing_license_packages` traz os quatro pacotes, e `billing_settings` tem a
   linha `global` com `autoBlockEnabled = false`.

## Critérios de conclusão

- [ ] `npm run db:generate`, `npm run lint` e `npm run type-check` saem com 0
- [ ] `npm test` passa na raiz (api, web e mobile), incluindo todos os casos novos
- [ ] `npm run build:api` e `npm run build:web` saem com 0
- [ ] Migration aplicada num Postgres local limpo; `migrate diff --exit-code` sai com 0; os quatro pacotes e a linha `global` conferidos por `SELECT`
- [ ] `grep -nE "DROP|ALTER TABLE \"(companies|users)\"|ALTER TYPE"` no `migration.sql` → vazio
- [ ] A migration está no último commit de código, sozinha
- [ ] Nenhum comando de banco rodou fora do Postgres local: nada de `migrate dev`, `migrate reset` nem `db push`, e nenhum `.env` foi criado ou copiado
- [ ] `git diff --stat 80fe328..HEAD -- apps/mobile` → vazio
- [ ] `git diff --stat 80fe328..HEAD -- apps/api/src/modules/intelligence apps/api/src/modules/users apps/api/src/middleware apps/web/src/components/intel 'apps/web/src/app/(admin)/configuracoes' 'apps/web/src/app/(admin)/empresas/[id]/tabs' 'apps/web/src/app/(admin)/empresas/[id]/EntityModals.tsx'` → vazio
- [ ] `grep -rn "intelligenceEnabled" apps/api/src/modules/billing` → vazio
- [ ] `grep -n "autoBlockEnabled" apps/api/src/modules/billing/billing.schema.ts` → vazio
- [ ] `grep -rn "/dashboard" apps/web/src --include=*.ts --include=*.tsx` → só `lib/__tests__/middleware.test.ts` e o item sintético de `lib/__tests__/nav-gating.test.ts`
- [ ] `git diff --stat 80fe328..HEAD -- packages/db/prisma/seed.ts render.yaml apps/api/src/lib/env.ts` → vazio
- [ ] Linha do 013 atualizada em `plans/README.md`

## Condições de PARADA

- A checagem de deriva acusa mudança no escopo e os trechos de "Estado atual" não
  batem com o código vivo.
- Parecer necessário conectar no Neon (staging ou produção) ou rodar um comando
  Prisma sem `DATABASE_URL` **e** `DATABASE_URL_DIRECT` explícitos apontando para
  `localhost`. Se perceber que um comando rodou sem eles, pare e reporte; não
  tente desfazer nada por conta própria.
- A migration gerada tem qualquer coisa além dos tipos, tabelas, índices e
  chaves das seis tabelas novas e dos dois `INSERT`. Em especial `ALTER` ou
  `DROP` em `companies` ou `users`: é sinal de que o schema local divergiu das
  migrations.
- O `migrate diff --exit-code` depois do `migrate deploy` não sai com 0.
- Parecer necessário ler ou escrever `intelligenceEnabled`, ou mexer em
  `config.routes.ts`, `IntelConfigForm.tsx`, `IntelligenceTab.tsx` ou em
  qualquer leitor do campo. É do plano 014.
- Alguma tela do ADMIN quebrar por causa do redirect de `/dashboard`: o item
  "Empresas" do ADMIN sumir ou apontar para `/dashboard` ou `/gestao`, ou
  qualquer link alcançável pelo ADMIN levar a `/dashboard`.
- Parecer necessário gravar `autoBlockEnabled` ou mostrar um liga-desliga dele.
- O `POST /companies` sem `profile` deixar de funcionar como hoje.
- Parecer necessário importar de `apps/api` dentro de `packages/types`.
- Um teste pré-existente falhar e a correção exigir mudar a asserção dele. As
  exceções são o caso de `resolveHome` do SUPERADMIN, que este plano manda
  trocar, e os comentários de teste que citam o grupo Empresa.
- Parecer necessário apagar qualquer arquivo além de
  `dashboard/CreateCompanyModal.tsx`.

## Notas de manutenção

- **O que o 014 herda deste plano.** O `saveContractDraft` recusa contrato fora
  de `DRAFT` com `CONTRACT_NOT_DRAFT`. O 014 troca isso: editar em
  `PENDING_ACCEPTANCE` cancela o documento enviado e volta o contrato para
  `DRAFT` (decisão padrão 11). O aceite grava `startDate`,
  `firstBilledCompetence` (com `computeBillingCalendar`), termos `EFFECTIVE` e
  `intelligenceEnabled` na mesma transação. O envio exige o cadastro completo
  (representante, CPF e endereço), que aqui pode nascer incompleto.
- **A fronteira do dia 1 (decidida na revisão de 15/10/2026).**
  `resolveCompetenceTerms` conta só o `EFFECTIVE` com `effectiveFrom`
  **estritamente anterior** às 00:00 de São Paulo do dia 1. Um aditivo que
  "vale a partir de 01/12" muda o limite em 01/12 e entra na cobrança na
  competência de janeiro, como diz a regra "entrou no mês, cobra no seguinte".
  O teste do passo 3 fixa isso.
- **`competenceStartInstant` usa UTC−3 fixo.** O `business-days.ts` usa `Intl`
  e se adaptaria sozinho a um horário de verão; esta função não. Se o Brasil
  voltar a ter horário de verão, revise aqui. O teste que compara com `Intl`
  vai falhar e avisar.
- **`deriveClientStatus` é a fonte única da situação.** O 016 passa
  `hasOverdueInvoice`, o 017 passa `accessBlockReason` (o
  motivo de `resolveCompanyAccess`: `OVERDUE`, `MANUAL` ou `INACTIVE`), e o 018
  reaproveita a função. A ordem
  de precedência está nos testes; quem mudar a ordem muda os testes junto.
- **`BillingEvent.type` é `String` com lista fechada no TypeScript.** Cada plano
  que cria tipo acrescenta a `BILLING_EVENT_TYPES` e a `BILLING_EVENT_LABELS`;
  o `Record` do web não compila sem o rótulo. O `dedupeKey` fica para os
  e-mails do 016 e do 017. Os eventos globais (pacotes e regras) ficam gravados
  sem tela por enquanto.
- **`seatGuardVersion`** existe só para a trava do 015. Ninguém lê esse campo
  como dado.
- **Datas `@db.Date` no painel**: sempre `formatBillingDate` ou
  `formatCompetence`. O `formatDate` de `lib/utils.ts` mostra o dia anterior no
  Brasil.
- **LGPD**: a lista `/admin/billing/clients` não devolve representante nem
  contatos; só a ficha devolve, e só ao SUPERADMIN. O payload do evento guarda
  nomes de campo. A coleta nova (representante, CPF, contatos) entra na
  `privacidade.html` no plano 014.
- **CNPJ**: a unicidade continua pela string exata, como hoje. O mesmo CNPJ com
  e sem pontuação passa como dois. Normalizar exige migrar os CNPJs existentes e
  fica fora deste plano.
- **Desativar empresa** continua sem evento de cobrança. O 017 decide o que a
  desativação grava, porque nele empresa inativa passa a ser bloqueada.
- **Piloto**: este plano não impede rascunho de contrato para empresa com piloto
  ativo. A regra "empresa em piloto fica sem contrato" vale no aceite, e o 014
  pode avisar na tela.
- **Entrega**: 013 e 014 vão juntos para produção. O `migrate deploy` roda no
  build do Render e no `deploy-api.yml`, então os pacotes e a linha `global`
  nascem sozinhos em cada ambiente. Quem revisar deve olhar, nesta ordem: (1) a
  migration só aditiva; (2) nenhuma escrita de `intelligenceEnabled` nem de
  `autoBlockEnabled`; (3) o payload dos eventos sem valor; (4) o item
  "Empresas" do ADMIN intacto.
