# Plano 016: Faturamento mensal pós-pago com baixa manual

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 80fe328..HEAD -- apps/api/src/app.ts apps/api/src/lib/env.ts apps/api/src/lib/errors.ts apps/api/src/lib/error-handler.ts apps/api/src/modules/intelligence/jobs/scheduler.ts apps/api/src/modules/intelligence/engine/business-days.ts apps/api/src/modules/auth/auth.service.ts apps/api/src/modules/companies/companies.service.ts apps/api/src/modules/sync/scheduler.ts apps/api/src/test-utils/prisma-mock.ts packages/db/prisma/schema.prisma render.yaml .env.example apps/api/.env.example apps/web/src/app/\(admin\)/layout.tsx apps/web/src/components/ui/StatusPill.tsx apps/web/src/components/ui/Table.tsx apps/web/src/components/ui/Modal.tsx apps/web/src/lib/utils.ts`
>
> Este plano depende do 014, que depende do 013. Por isso, mudanças vindas
> desses dois planos (e do 015, se já tiver entrado) **são esperadas** em
> `schema.prisma`, `app.ts`, `errors.ts`, `error-handler.ts` e `layout.tsx`.
> Para cada arquivo que aparecer, confira se os trechos citados em "Estado
> atual" continuam lá. Mudança que não venha de 013, 014 ou 015 e que desmonte
> um trecho citado é condição de PARADA.

## Status

- **Prioridade**: P1
- **Esforço**: L
- **Risco**: MÉDIO. É o primeiro código do Addere que gera cobrança. O pior erro
  possível é cobrar um mês que não devia, ou cobrar duas vezes. Três coisas
  contêm esse risco: a env do agendador nasce desligada, o gerador confere a
  regra duas vezes (na consulta e em código) e nada é cobrado sem um humano,
  porque a cobrança é feita por fora e a baixa é manual.
- **Depende de**: 014 (e, por tabela, 013). Pode andar em paralelo com o 015.
- **Categoria**: feature
- **Planejado em**: commit `80fe328` (`origin/staging`), 2026-10-15
- **Migration**: sim (`billing_invoices`), no último commit.
- **Toca o app**: não.

## Por que isso importa

Com o 014, o ADMIN do cliente aceita o contrato e os termos passam a valer. Só
que nada transforma esses termos em cobrança. Sem fatura no sistema:

- a Addere cobra de cabeça ou numa planilha, sem registro de quem pagou o quê;
- o plano 017 (aviso de suspensão e bloqueio) e o plano 018 (painel) não têm de
  onde ler "a receber" e "vencido";
- duas promessas do contrato ficam sem quem as cumpra. A tabela "Promessas do
  contrato × sistema" do plano aprovado põe as duas no 016: **cancelamento com
  efeito no fim do mês** e **licença adicional cobrada a partir do mês
  seguinte**.

A cobrança continua manual: não há gateway nem boleto automático. O sistema
calcula a fatura, registra, lembra o cliente do vencimento e guarda a baixa. A
Addere cobra por fora e o superadmin dá a baixa.

O desenho deste plano gira em torno de três erros de dinheiro:

1. **Competência errada por fuso.** O servidor roda em UTC. Às 22h de Brasília
   do dia 31 já é dia 1 em UTC; um gerador ingênuo faturaria o mês antes de ele
   acabar.
2. **Cobrar o que não devia**: o mês do aceite, a carência, um contrato que não
   está ativo, o mês seguinte ao cancelamento.
3. **Cobrar duas vezes**: dois ticks, dois processos durante um deploy, um
   `jobs/run` manual no meio do tick automático.

### Regras que este plano cumpre

Decisões de produto de 15/10/2026, copiadas do plano aprovado:

| Tema | Regra (decisão de produto de 15/10/2026) |
|---|---|
| Cobrança | Manual. O sistema gera e registra a fatura; a Addere cobra por fora e o superadmin dá a baixa. |
| Ciclo | Mensal e pós-pago. A fatura da competência M é gerada no início de M+1 e vence no **dia de vencimento cadastrado por empresa**, sempre entre o dia 1 e o dia 10. |
| Mudança no mês | Licença ou mudança de contrato que entra no mês M não é cobrada em M; entra na cobrança a partir de M+1. |
| Carência | Opcional: 0 é "sem carência". O mês do aceite não é cobrado; depois correm os N meses de carência, se houver, e só então começa a cobrança. |
| Antes do aceite | Nada começa: sem cobrança. |
| Valor | `packagePrice + extraSeats × extraSeatPrice` ± itens manuais. Cobra o contratado, não o uso. |
| Cancelamento | Sem fidelidade e sem multa. O cliente cancela quando quiser, com efeito no fim do mês, que é cobrado. |
| Atraso | Lembretes ao ADMIN e ao contato de cobrança. **Aqui entra só o lembrete antes do vencimento**; o aviso de suspensão e o bloqueio são do 017. |
| Piloto | Empresa em piloto fica sem contrato: sem cobrança. |
| Recálculo | Só em fatura OPEN, e os itens manuais são preservados. Correção de fatura paga vira item de ajuste na fatura seguinte. |
| Fuso | O fuso é fixo em America/Sao_Paulo. Uma fatura gerada às 22h do dia 31 não pode cair na competência errada. |

Decisões padrão do plano aprovado que se aplicam aqui (decisão de produto de
15/10/2026):

- **1.** Empresa sem contrato aceito continua como hoje: sem cobrança.
- **3.** Empresa desativada (`active=false`) passa a ser bloqueada — no 017.
  É o que dá efeito à opção "Desativar empresa também" deste plano.
- **6.** O mês do cancelamento é cobrado. Para perdoar, use um desconto manual
  na fatura.
- **8.** Quem opera o módulo é o papel SUPERADMIN atual. O histórico registra
  quem fez cada ação.
- **10.** Só o administrador indicado pela Empresa aceita o contrato e os
  aditivos (decisão de 15/10/2026, detalhada no plano 014,
  `CompanyContract.designatedAdminId`). O lembrete de documento pendente vai
  para ele.

### Decisões deste plano (confirmadas pelo dono do produto em 15/10/2026)

O plano aprovado não definia estes pontos. As onze escolhas abaixo foram
confirmadas como estão em 15/10/2026.

- **D1. Fatura cancelada continua ocupando a competência.** A chave única
  `[companyId, competence]` não deixa outra fatura nascer para o mesmo mês. Se
  cancelar liberasse a competência, o tick da hora seguinte geraria a fatura de
  novo. Cancelar quer dizer "este mês não será cobrado".
- **D2. O gerador fatura só a competência anterior.** Meses mais antigos (env
  desligada por meses, cliente anterior ao sistema) entram por fatura avulsa,
  que é um ato deliberado.
- **D3. Fatura avulsa** só para competência **anterior ao mês corrente**, sem
  fatura existente nessa competência, com vencimento escolhido e **≥ hoje**.
  Avulsa no mês corrente ocuparia a competência e impediria a fatura normal do
  mês; vencimento no passado faria a fatura nascer vencida.
- **D4. Na fatura paga, só NF e observações mudam.** Valores, itens, status e
  baixa ficam imutáveis. A NF costuma sair depois do pagamento, e anotação não é
  valor.
- **D5. A baixa quita a fatura**, mesmo com valor diferente do total (juros,
  arredondamento). O valor recebido fica registrado. Diferença a menor que deva
  ser cobrada vira ajuste manual na próxima fatura.
- **D6. Ao encerrar o contrato**, o job grava `intelligenceEnabled=false`
  (o contrato é quem liga a Inteligência desde o 014), cancela documentos
  ainda em SENT e, se a opção estiver marcada, desativa a empresa.
- **D7. "Desativar empresa também" vem marcado** no formulário de
  cancelamento. Quem cancela normalmente sai do produto.
- **D8. O cancelamento agendado pode ser desfeito** até o último dia do mês.
  Sem isso, um cancelamento registrado por engano só se desfaz por SQL no Neon.
- **D9. Item manual pode ser removido** enquanto a fatura estiver OPEN.
- **D10. Número da fatura sequencial e global** (`SERIAL` do Postgres). Pode
  ter buraco quando duas criações disputam a mesma competência; é numeração
  interna, não fiscal (a fiscal é a `nfNumber`).
- **D11. Lembrete de vencimento: um só**, enviado no primeiro tick em que
  `hoje ≥ vencimento − N dias` e `hoje ≤ vencimento`. Fatura com total 0 não
  recebe lembrete. **Lembrete de documento pendente: um só**, depois de 72 h do
  envio.
- **Crédito por indisponibilidade** (contrato 1.1-minuta, §9.7 a §9.10; meta de
  99,5 % de cada mês civil, decidida em 15/10/2026). Não há cálculo automático
  neste plano: o superadmin lança, na fatura da competência seguinte, um item
  `DISCOUNT` com a descrição "Crédito por indisponibilidade — MM/AAAA (N min)",
  a partir dos minutos medidos pelo monitor de disponibilidade. O valor é
  `minutos fora ÷ minutos do mês × valor mensal daquele mês`, o que o limita a
  um valor mensal. Sem fatura seguinte (contrato encerrado), o crédito é pago
  por Pix em até 30 dias, fora do sistema; registre isso nas observações da
  última fatura. Automatizar fica para a segunda etapa.

## Estado atual

### O que existe em `80fe328`

Nenhum código de faturamento. `grep -rni "invoice\|billing" apps/api/src
packages/db/prisma/schema.prisma apps/web/src` só acha um comentário de
geocodificação (`geocoding.provider.ts:3`).

**Agendador da Inteligência — o padrão a copiar.**
`apps/api/src/modules/intelligence/jobs/scheduler.ts`:

- `:12` — `const TICK_MS = 60_000`. O da Inteligência bate **a cada minuto**.
  O de faturamento bate de hora em hora: o intervalo é escolha deste plano, não
  do modelo.
- `:72-81` — `isTransientDbError(err)`, exportado, reconhece queda de banco
  (`P1001`, `P1002`, `P1008`, `P1017`).
- `:97-103` — o contrato do tick:

  ```ts
  /**
   * Um tick nunca propaga erro. Ele roda solto (`void`) no boot e no setInterval:
   * no Node 26 uma rejeição não tratada encerra o processo, então uma falha aqui
   * — drift de schema, banco piscando — tiraria a API inteira do ar em vez de
   * apenas desligar a Inteligência.
   */
  export async function tickIntelScheduler(now: Date = new Date()): Promise<void> {
  ```

- `:155-162` — desligado em teste, catch-up no boot e `.unref()`:

  ```ts
  export function initIntelScheduler(): void {
    if (env.NODE_ENV === 'test' || ticker) return
    // Primeiro tick já no boot = catch-up de horários perdidos por deploy/restart
    void tickIntelScheduler()
    ticker = setInterval(() => void tickIntelScheduler(), TICK_MS)
    ticker.unref()
    console.log('[intel-scheduler] ticker de 1 min iniciado')
  }
  ```

**Onde o agendador sobe.** `apps/api/src/app.ts:108-119`, no hook `onReady`.
`server.ts` só monta o app e escuta a porta.

```ts
app.addHook('onReady', async () => {
  // Nenhum scheduler pode bloquear o boot: se este hook rejeitar, o Fastify
  // não sobe e a API fica fora do ar por causa de um job de segundo plano.
  try {
    await initSchedulers()
  } catch (err) { /* … */ }
  registerIntelJobHandlers()
  initIntelScheduler()          // ← linha 118; o de faturamento entra logo abaixo
})
```

As rotas são registradas em `app.ts:89-103`.

**O lock da Inteligência não é atômico.** `jobs/run-job.ts:36-52` faz
`findFirst` de um run ativo e depois `create`: dois processos podem passar
juntos. Este plano **não** usa tabela de trava. A idempotência vem de chave
única: `@@unique([companyId, competence])` na fatura e `dedupeKey` único no
`BillingEvent`.

**Datas em São Paulo.** `apps/api/src/modules/intelligence/engine/business-days.ts`:

- `:11-13` — `ymdSaoPaulo(date)` → `'YYYYMMDD'` do instante em São Paulo;
- `:49-55` — `addDaysYmd(ymd, days)`;
- `:84-88` — `ymdToDate(ymd)` → `Date` à meia-noite UTC, a convenção dos campos
  `@db.Date`;
- `:98-101` — `daysOverdueOn(dueDate, todayYmd)` (fica para o 017);
- `:104-106` — `dateToYmdUtc(date)` → `'YYYYMMDD'` de um `@db.Date`.

**Env.** `apps/api/src/lib/env.ts:3-31` é o schema zod. O padrão de flag é o
`:21`: `INTEL_LLM_ENABLED: z.enum(['true', 'false']).default('true')`.
`RESEND_API_KEY` é opcional (`:14`) e `WEB_URL` também (`:30`). Os
`.env.example` são dois: o da raiz (`.env.example:33-37`, Resend e `WEB_URL`) e
o da API (`apps/api/.env.example:18-22` para Resend e `WEB_URL`, `:27-46` para o
bloco da Inteligência).

**`render.yaml`.** Serviço `addere-api` em `:3-35` (variáveis em `:12-35`);
`addere-api-staging` em `:38-67` (variáveis em `:46-67`). Nenhum dos dois lista
`RESEND_API_KEY` nem `WEB_URL`: os valores reais vivem no painel do Render. O
arquivo usa `value:` para configuração (`NODE_ENV`, `PORT`, `CORS_ORIGIN`) e
`sync: false` para segredo.

**Envio de e-mail.** `apps/api/src/modules/auth/auth.service.ts`:

- `:72` — `const WEB_URL = env.WEB_URL ?? 'https://addere-web.vercel.app'`;
- `:85-88` — sem `RESEND_API_KEY`, avisa no console e não envia;
- `:90-107` — `new Resend(...)`, `resend.emails.send({ from: 'Addere
  <noreply@addere.com.br>', … })` dentro de `try/catch`.

**Atenção:** o SDK instalado é o `resend` 4.8.0. O `send` devolve
`{ data, error }` e **não lança** quando a API do Resend recusa o envio. O
`try/catch` de `:93-107` só pega erro de rede. O envio deste plano precisa
olhar o `error` do retorno. O SDK aceita `send(payload, { idempotencyKey })`.

**Dinheiro e datas no schema.** `packages/db/prisma/schema.prisma`:

- `:276` — `creditLimit Decimal? @db.Decimal(14, 2)`, o modelo de dinheiro;
- `:546` — a convenção escrita: "companyId como tenant, dinheiro Decimal(14,2)";
- `:693-708` — `OpenTitle`, com `dueDate DateTime @db.Date`;
- `:56-116` — `Company`, com a lista de relações em `:86-113`.

**Erros.** `apps/api/src/lib/errors.ts:3-14` — `AppError(statusCode, message,
details?)`, ainda sem `code` em `80fe328` (o 013 acrescenta).
`apps/api/src/lib/error-handler.ts:22` — P2002 que escapa vira 409 genérico
"Registro duplicado". Nas rotas deste plano, P2002 nunca escapa: é traduzido.

**Empresa e sync.** `apps/api/src/modules/companies/companies.service.ts:79-88`
— `toggleCompanyActive` grava `active` e chama `clearSchedule` (desligar) ou
`applySchedule` (religar). `clearSchedule` está em
`apps/api/src/modules/sync/scheduler.ts:61`.

**Mock do Prisma.** `apps/api/src/test-utils/prisma-mock.ts`:

- `:20-27` — padrões por método (`findMany` → `[]`, `findUnique` → `null`,
  `updateMany` → `{ count: 0 }`);
- `:67-69` — `$transaction` com callback recebe o próprio `prismaMock`; com
  array, faz `Promise.all`.

O mock **não aplica `where`**. Um teste do gerador que devolve um contrato pelo
mock não prova a regra da consulta. Por isso a regra também roda em código
(`isCompetenceBillable`), e os testes conferem os dois lados.

**Web.**

- `apps/web/src/components/ui/StatusPill.tsx:5-19` — tipado só para
  `CustomerStatus` e usado por três telas da Inteligência. Não serve para
  fatura sem mudança.
- `apps/web/src/components/ui/Badge.tsx:11-17` — as classes de token
  (`bg-success/10 text-success`, `bg-danger/10 text-danger`,
  `bg-brand/10 text-brand`, `bg-muted/10 text-muted`).
- `apps/web/src/components/ui/Table.tsx:12-25` — `columns`, `data`, `rowKey`,
  `onRowClick` e `renderExpanded` (linha de detalhe).
- `apps/web/src/components/ui/Modal.tsx:7-16` — `isOpen`, `onClose`, `title`,
  `className`.
- `apps/web/src/app/(admin)/empresas/[id]/ConfirmModal.tsx:7-23` — confirmação
  pronta.
- `apps/web/src/lib/utils.ts:8-13` — `formatCurrency` (serve).
- `apps/web/src/lib/utils.ts:15-21` — **`formatDate` desloca `@db.Date`**: faz
  `new Date(date)` no fuso do navegador, então `'2026-11-10T00:00:00.000Z'`
  aparece como 09/11/2026 no Brasil. Não use para competência, vencimento nem
  data de pagamento.
- `apps/web/src/app/(admin)/layout.tsx:61-170` — `NAV_GROUPS`; o grupo Empresa
  está em `:132-169`.
- `apps/web/src/app/(admin)/dashboard/layout.tsx:1-6` — o gate
  `<SuperAdminOnly>`.
- `apps/web/src/app/(admin)/empresas/[id]/page.tsx:132-149` — a barra de abas
  que a ficha do cliente copia.

**Banco local e Neon.** `packages/db/.env` existe nesta máquina e aponta
`DATABASE_URL` **e** `DATABASE_URL_DIRECT` para o Neon. O Prisma usa o
`directUrl` em `migrate deploy`. Qualquer comando Prisma que conecta precisa
receber as **duas** variáveis apontando para o Postgres local, sempre.

### O que os planos 013 e 014 deixam e este plano usa

Os nomes abaixo vêm do plano aprovado. O passo 0 confere cada um no código.

- `packages/db/prisma/schema.prisma`:
  - `CompanyContract`, 1:1 com `Company`: `status` (`DRAFT`,
    `PENDING_ACCEPTANCE`, `ACTIVE`, `CANCELLED`), `startDate?`, `graceMonths`,
    `firstBilledCompetence?`, `dueDay` (1–10), `overdueBlockDays?`,
    `seatGuardVersion`;
  - `ContractTerms`, só de inclusão: `status` (`PROPOSED`, `EFFECTIVE`,
    `WITHDRAWN`), `origin`, `effectiveFrom?`, pacote, `licenseType`,
    `includedSeats`, `extraSeats`, `packagePrice`, `extraSeatPrice`;
  - `LicensePackage` (`code`, nome);
  - `ClientProfile`, com `billingEmail`;
  - `ContractDocument`: `status` (`SENT`, `ACCEPTED`, `CANCELLED`), `sentAt`;
  - `BillingEvent`: tipo, autor (null = job), `payload` só com nomes de campo,
    `dedupeKey` **único**;
  - `BillingSettings`, linha única: dias de aviso antes do vencimento e o
    e-mail da Addere que recebe os avisos.
- `packages/types/src/billing.ts`: `computeBillingCalendar({ acceptDate,
  graceMonths, dueDay })` e a função que resolve **termos da competência M** (o
  EFFECTIVE com o maior `effectiveFrom` **estritamente anterior** ao início de M
  em São Paulo: um termo que vale às 00:00 do dia 1 de M só entra na cobrança
  em M+1, pela regra "entrou no mês, cobra no seguinte").
- `apps/api/src/lib/errors.ts`: `AppError` com `code`.
- `apps/api/src/modules/billing/`: rotas `/admin/billing/*` (013) e
  `/billing/me/*` (014), com `requireSuperAdmin` nas primeiras.
- 014: o envio do e-mail do contrato pelo Resend e a ação "cancelar envio".
- Web: o grupo **Gestão Addere** em `NAV_GROUPS`, `gestao/layout.tsx` com
  `<SuperAdminOnly>` e a ficha `/gestao/clientes/[id]` com as abas Cadastro,
  Contrato e Histórico.
- 015 (opcional, porque anda em paralelo): `/plano` v1 e o item "Plano e
  cobrança" no grupo Empresa.

## Esboço de tela

**`/gestao/faturas`** (SUPERADMIN, grupo Gestão Addere):

```
┌─ Gestão Addere › Faturas ─────────────────────────────────────────────────────────┐
│ Faturas                                 [ Rodar faturamento ]  [ + Fatura avulsa ] │
│                                                                                    │
│ Status [ Todas      ▾ ]  Competência [ 10/2026 ▾ ]  Cliente [ Todos            ▾ ] │
│                                                                                    │
│ Nº      Cliente              Competência  Vencimento  Total         Status      NF │
│ ────────────────────────────────────────────────────────────────────────────────── │
│ 000124  Distribuidora Norte  out/2026     10/11/2026  R$ 2.139,80   (Em aberto) —  ⋯│
│ ▾ Pacote 20 — Com Inteligência (20 licenças)       1 × R$ 1.990,00    R$ 1.990,00  │
│   Licenças adicionais                              3 × R$ 49,90         R$ 149,70  │
│   Ajuste: diferença de setembro   [manual] [remover]                      R$ 0,10  │
│   Gerada pelo faturamento · vence 10/11/2026                Total  R$ 2.139,80     │
│ 000123  Atacado Sul          out/2026     05/11/2026  R$ 1.990,00   (Vencida)   —  ⋯│
│ 000119  Distribuidora Norte  set/2026     10/10/2026  R$ 2.139,80   (Paga)    1043 ⋯│
│ 000117  Atacado Sul          set/2026     05/10/2026  R$ 1.990,00   (Cancelada) —   │
│                                                                                    │
│                                                     ‹ 1 2 3 ›   50 por página      │
└────────────────────────────────────────────────────────────────────────────────────┘

Menu ⋯   Em aberto: Dar baixa · Desconto ou ajuste · NF e observações · Recalcular · Cancelar
         Paga:      NF e observações
         Cancelada: sem menu
Status:  Em aberto | Vencidas | Pagas | Canceladas | Todas
```

**Modal de baixa:**

```
┌─ Dar baixa — Fatura 000124 ────────────────────────── ✕ ┐
│ Distribuidora Norte · competência out/2026              │
│ Total da fatura                         R$ 2.139,80     │
│                                                         │
│ Data do pagamento   [ 12/11/2026      ]                 │
│ Valor recebido      [ 2.139,80        ]                 │
│ Forma               [ PIX           ▾ ]                 │
│ Observação          [                                 ] │
│                                                         │
│ ⚠ Valor diferente do total. A fatura fica quitada; a    │  ← só quando
│   diferença não vira saldo. Se precisar cobrar ou       │    valor ≠ total
│   devolver, lance um ajuste na próxima fatura.          │
│                                                         │
│                          [ Voltar ]  [ Confirmar baixa ] │
└─────────────────────────────────────────────────────────┘
```

**Modal de fatura avulsa:**

```
┌─ Fatura avulsa ─────────────────────────────────────── ✕ ┐
│ Cliente       [ Distribuidora Norte          ▾ ]          │
│ Competência   [ 08/2026 ▾ ]   (só meses anteriores ao atual)
│ Vencimento    [ 25/10/2026 ]  (hoje ou depois)            │
│ [x] Usar o pacote e os adicionais do contrato nesta       │
│     competência                                           │
│ Itens manuais                                             │
│   [ Ajuste   ▾ ] [ Licença de uso — agosto  ] [ 1.990,00 ]│
│   [ + item ]                                              │
│ Observação interna [                                    ] │
│                              [ Voltar ]  [ Criar fatura ] │
└───────────────────────────────────────────────────────────┘
```

**Ficha do cliente `/gestao/clientes/[id]`**: a aba nova **Faturas** mostra a
mesma tabela, sem a coluna Cliente, e o botão "Fatura avulsa" já com o cliente
escolhido. Na aba **Contrato** (do 013) entra o bloco de encerramento:

```
│ Encerramento                                                           │
│ Sem fidelidade e sem multa. O contrato termina no último dia do mês do │
│ pedido, e esse mês é cobrado.                    [ Cancelar contrato ] │

┌─ Cancelar contrato — Distribuidora Norte ──────────────────────── ✕ ┐
│ O contrato termina em 31/10/2026. Outubro será faturado em          │
│ novembro; de novembro em diante, nada é cobrado.                    │
│ Motivo  [ Cliente pediu por e-mail em 14/10                       ] │
│ [x] Desativar a empresa também, quando o contrato terminar          │
│                            [ Voltar ]  [ Confirmar cancelamento ]   │
└─────────────────────────────────────────────────────────────────────┘

Depois de confirmar:
│ Cancelamento agendado: o contrato termina em 31/10/2026.               │
│ Pedido em 15/10/2026 · "Cliente pediu por e-mail em 14/10"             │
│ A empresa será desativada no encerramento.            [ Desfazer ]     │
```

**`/plano` do ADMIN** (bloco novo, abaixo do que o 015 montar):

```
│ Faturas                                                              │
│ Nº      Competência  Vencimento   Valor         Status       Paga em │
│ 000124  out/2026     10/11/2026   R$ 2.139,80   (Em aberto)  —       │
│ 000119  set/2026     10/10/2026   R$ 2.139,80   (Paga)       08/10/2026
│ ▸ clique na linha para ver os itens                                  │
│ A fatura sai no início de cada mês, referente ao mês anterior.       │
│ Dúvidas sobre a cobrança: fale com a Addere.                         │
```

## Quem acessa

| Perfil | O que vê e faz |
|---|---|
| SUPERADMIN | `/gestao/faturas`, a aba Faturas e o encerramento na ficha do cliente. Todas as ações: baixa, cancelar, desconto e ajuste, NF, recalcular, fatura avulsa, rodar o faturamento, agendar e desfazer cancelamento de contrato. |
| ADMIN do cliente | Em `/plano`, as faturas da própria empresa, só leitura, sem observação interna, sem motivo de cancelamento e sem o nome de quem deu a baixa. Recebe o lembrete de vencimento e o de documento pendente por e-mail. |
| Vendedor e gerente (`SALESPERSON`) | Nada. 403 em `/billing/me/invoices`. |
| Contato de cobrança (`billingEmail`) | Recebe o lembrete de vencimento. Não tem login. |
| Agendador (sem usuário) | Gera faturas, encerra contratos e manda lembretes. Autor `null` no `BillingEvent`. |

O 017 vai liberar `/billing/me/*` para empresa bloqueada; a rota de faturas do
ADMIN deste plano entra nesse prefixo de propósito.

## Comandos que você vai precisar

| Para quê | Comando | Esperado quando dá certo |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Gerar o client | `npm run db:generate` | exit 0 (não conecta em banco) |
| Validar o schema | `DATABASE_URL=postgresql://x@localhost:5432/x DATABASE_URL_DIRECT=postgresql://x@localhost:5432/x npx prisma validate --schema packages/db/prisma/schema.prisma` | `is valid` (não conecta; as URLs falsas só satisfazem o `env()`) |
| Tipos | `npm run type-check` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Testes de faturamento | `npm test -w @addere/api -- billing` | todos verdes |
| Testes da API | `npm test --workspace=apps/api` | todos verdes |
| Testes do web | `npm test --workspace=apps/web` | todos verdes |
| Tudo | `npm test` | exit 0 |
| Builds | `npm run build:api` e `npm run build:web` | exit 0 (`build:web` exige `apps/web/.env.local`, copiado de `.env.local.example`) |
| Postgres local | `docker compose up -d db` | container `db` healthy |
| Bancos de trabalho | `docker compose exec db psql -U addere_dev_user -d addere_dev -c "CREATE DATABASE addere_shadow_016;" -c "CREATE DATABASE addere_check_016;"` | `CREATE DATABASE` duas vezes |
| Conferir a env | `git grep -n "BILLING_JOBS_ENABLED" -- apps/api/src/lib/env.ts .env.example apps/api/.env.example render.yaml` | cinco linhas, todas com `false` (os testes usam `'true'` de propósito e ficam fora desta checagem) |

O usuário e a senha do Postgres local estão em `docker-compose.yml`
(`addere_dev_user` / `addere_dev_password`). Os comandos de migration estão no
passo 14.

## Escopo

**Dentro do escopo:**

- `packages/db/prisma/schema.prisma` — `Invoice`, `InvoiceItem`, quatro enums,
  cinco campos em `CompanyContract`, a relação em `Company` e, se o
  `BillingEvent` usar enum de tipo, os valores novos.
- `packages/db/prisma/migrations/<timestamp>_billing_invoices/migration.sql`.
- `packages/types/src/billing.ts` — tipos de fatura e
  `invoiceDisplayStatus`.
- `apps/api/src/lib/env.ts` e `apps/api/src/lib/__tests__/env.test.ts`.
- `.env.example`, `apps/api/.env.example` e `render.yaml`.
- `apps/api/src/app.ts` — só a chamada `initBillingScheduler()` no `onReady`.
- Arquivos novos em `apps/api/src/modules/billing/`:
  `competence.ts`, `invoice-rules.ts`, `billing-mailer.ts`,
  `invoices.service.ts`, `invoices.schema.ts`, `invoices.routes.ts`,
  `contract-cancel.service.ts`, `contract-cancel.routes.ts`,
  `jobs/billing-scheduler.ts`, `jobs/reminders.ts` e os testes em
  `__tests__/`.
- O ponto de registro das rotas de faturamento que o 013 criou (só para
  registrar os dois arquivos de rotas novos).
- A rota de leitura do contrato do 013 e o tipo dela — só para devolver os
  quatro campos de encerramento.
- Web, arquivos novos: `apps/web/src/lib/billing-format.ts` e o teste,
  `apps/web/src/hooks/useInvoices.ts`,
  `apps/web/src/components/billing/InvoicesTable.tsx`,
  `apps/web/src/components/billing/InvoiceModals.tsx`,
  `apps/web/src/components/billing/MyInvoicesSection.tsx`,
  `apps/web/src/components/billing/CancelContractModal.tsx`,
  `apps/web/src/app/(admin)/gestao/faturas/page.tsx`.
- Web, arquivos existentes: `components/ui/StatusPill.tsx` (só acrescentar
  `InvoiceStatusPill`), `(admin)/layout.tsx` (item Faturas), a página da ficha
  `/gestao/clientes/[id]` (aba Faturas) e a aba Contrato dela (encerramento),
  `(admin)/plano/page.tsx` (montar a seção de faturas).
- `docs/billing/README.md` — seção de operação do faturamento.
- `plans/README.md` — só a linha de status do 016.

**Fora do escopo (NÃO toque):**

- **Aviso de suspensão, bloqueio automático, desbloqueio, faixas e tela de
  bloqueio** — plano 017. Inclui `apps/api/src/middleware/authenticate.ts`, os
  campos `accessBlockedAt`/`accessBlockReason`/`blockExemptUntil` e
  `/auth/me`. A baixa deste plano só deixa o gancho indicado.
- **Painel `/gestao` e qualquer agregação** (`/admin/billing/dashboard`, MRR,
  KPIs) — plano 018.
- **Gateway de pagamento, boleto ou PIX automático, NFS-e automática e crédito
  por SLA** — pendências da segunda etapa.
- **Trava de licenças, `LicenseRequest`, Solicitações e `UserFormModal`** —
  plano 015.
- O fluxo de aceite, os modelos de contrato e o renderizador do 014. Este plano
  só **chama** o "cancelar envio" e o envio de e-mail que ele deixou.
- `apps/api/src/modules/intelligence/**` e `apps/api/src/modules/sync/**`: só
  importe `business-days.ts`, `isTransientDbError` e `clearSchedule`; não
  edite.
- `companies.service.ts` e `apps/web/src/lib/utils.ts` (`formatDate` é usado
  por outras telas; crie formatador novo).
- `apps/mobile/**`. Este plano não toca o app.
- `IntelJobRun`, `run-job.ts` ou qualquer tabela de trava.

## Fluxo de git

- Branch: `advisor/016-faturamento-mensal`, a partir da `staging`:
  `git fetch origin && git switch -c advisor/016-faturamento-mensal origin/staging`.
- Um commit por passo (o passo 0 não tem commit). Mensagens em português, no
  estilo do repositório: `feat(billing): …` na API, `feat(web): …` no painel,
  `docs(billing): …` na documentação, com o trailer de coautoria que o seu
  ambiente pedir.
- **A migration é o último commit**, sozinha:
  `feat(db): migration das faturas (billing_invoices)`.
- NÃO faça push nem abra PR a menos que quem despachou tenha mandado. Quando
  houver PR, ele vai direto para `staging` (lição do incidente do #171 em
  `plans/README.md`).
- NÃO rode `eas build` nem `eas update`. Este plano não toca o app.
- NÃO mexa no painel do Render nem em variável de ambiente de nenhum servidor.

## Passos

### Passo 0: Pré-condições e nomes reais (sem commit)

1. Crie a branch (ver "Fluxo de git") e rode a checagem de deriva.
2. Confirme que 013 e 014 estão na base:

   ```bash
   grep -nE "^model (CompanyContract|ContractTerms|ContractDocument|BillingEvent|BillingSettings|ClientProfile|LicensePackage) " packages/db/prisma/schema.prisma
   ls apps/api/src/modules/billing/
   grep -n "export function" packages/types/src/billing.ts
   grep -n "dedupeKey" packages/db/prisma/schema.prisma
   grep -n "code" apps/api/src/lib/errors.ts
   ```

   Esperado: as sete linhas de `model`; a pasta `billing/` com as rotas do
   013 e do 014; `computeBillingCalendar` e a função de termos da competência
   em `billing.ts`; `dedupeKey` com `@unique`; `AppError` com `code`.
   Faltou qualquer um: **PARE** (dependência não cumprida).

3. Anote, num rascunho fora do repositório, o nome real de cada coisa que este
   plano cita pelo papel. Use esses nomes em todo o resto:
   - o `@@map` de `CompanyContract` (o passo 14 precisa dele);
   - a relação de `CompanyContract` para `ContractTerms`, e a de
     `ContractTerms` para `LicensePackage`;
   - os valores de `licenseType` e onde fica o rótulo deles ("Padrão",
     "Com Inteligência");
   - o tipo de `firstBilledCompetence` (o esperado é `@db.Date` no dia 1 do
     mês);
   - os campos de `BillingEvent` (empresa, tipo, autor, payload, `dedupeKey`)
     e se o tipo é `enum` ou `String`;
   - em `BillingSettings`, o campo de dias de aviso antes do vencimento, o
     padrão dele e o campo do e-mail da Addere;
   - o nome da função de termos da competência e o formato que ela recebe;
   - no 014: a função que envia e-mail pelo Resend (procure `from 'resend'` em
     `apps/api/src/modules/billing/`), a que lista os ADMINs ativos, a que
     cancela um documento SENT e o link que o e-mail do contrato usa;
   - o guard das rotas `/billing/me/*` e onde as rotas `/admin/billing` são
     registradas (procure `'/admin/billing'`);
   - o caminho da ficha do cliente no web e o formato da rota de contrato do
     013 (`/admin/billing/clients/:companyId/contract` é o esperado);
   - se `apps/web/src/app/(admin)/plano/page.tsx` já existe (015 mergeado).
4. Rode o teste de fronteira da função de termos da competência, num arquivo
   de rascunho ou no próprio teste do passo 3: termos com `effectiveFrom`
   `2026-10-01T01:00:00Z` (30/09 às 22h em São Paulo) **valem para outubro**;
   com `effectiveFrom` `2026-10-01T03:00:00Z` (00:00 de 01/10 em São Paulo)
   **não valem para outubro**, só a partir de novembro (fronteira estrita).
   Se a função do 013 disser outra coisa, **PARE**: o erro está no 013 e afeta
   também o limite de licenças.

### Passo 1: Schema — faturas, itens e encerramento do contrato

> ⚠️ **NÃO rode `npm run db:migrate`, `prisma migrate dev`, `migrate reset` nem
> `db push`. NÃO crie nem copie `.env`.** `packages/db/.env` aponta para o
> Neon. A migration é escrita no passo 14, contra Postgres local.

Em `packages/db/prisma/schema.prisma`, depois dos modelos de faturamento do 013,
acrescente:

```prisma
// ═════════════════════════════════════════
// Faturamento (plano 016) — mensal, pós-pago, baixa manual
// Dinheiro Decimal(14,2); competência e vencimento em @db.Date
// ═════════════════════════════════════════

enum InvoiceStatus {
  OPEN      // em aberto; "vencida" é derivada na leitura (OPEN e vencimento < hoje em SP)
  PAID      // baixa dada; valores e itens ficam imutáveis
  CANCELLED // não será cobrada; continua ocupando a competência
}

enum InvoiceOrigin {
  JOB    // gerada pelo agendador
  MANUAL // fatura avulsa, criada pelo superadmin
}

enum InvoiceItemKind {
  PACKAGE     // valor total do pacote dos termos da competência
  EXTRA_SEATS // licenças adicionais × preço unitário
  DISCOUNT    // desconto manual, gravado negativo
  ADJUSTMENT  // acréscimo ou ajuste manual, com sinal
}

enum InvoicePaymentMethod {
  PIX
  BOLETO
  TRANSFER // TED ou DOC
  CARD
  OTHER
}

model Invoice {
  id         String        @id @default(uuid())
  number     Int           @unique @default(autoincrement()) // sequencial global (SERIAL)
  competence DateTime      @db.Date // dia 1 do mês cobrado
  dueDate    DateTime      @db.Date
  status     InvoiceStatus @default(OPEN)
  origin     InvoiceOrigin @default(JOB)
  termsId    String? // ContractTerms usados no cálculo; termos nunca são apagados
  total      Decimal       @db.Decimal(14, 2) // soma dos itens, refeita a cada mudança

  // Baixa
  paidAt        DateTime?             @db.Date // data do pagamento informada
  paidAmount    Decimal?              @db.Decimal(14, 2)
  paymentMethod InvoicePaymentMethod?
  paymentNote   String?
  paidById      String? // User.id de quem deu a baixa
  paidByName    String? // nome congelado na baixa

  nfNumber String? // NFS-e emitida por fora
  notes    String? // observação interna; o ADMIN do cliente não vê

  // Cancelamento
  cancelledAt     DateTime?
  cancelledById   String?
  cancelledByName String?
  cancelReason    String?

  createdById String? // null = agendador
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  companyId String
  company   Company       @relation(fields: [companyId], references: [id])
  items     InvoiceItem[]

  @@unique([companyId, competence]) // uma fatura por empresa e competência: é a idempotência do gerador
  @@index([status, dueDate])
  @@map("billing_invoices")
}

model InvoiceItem {
  id          String          @id @default(uuid())
  kind        InvoiceItemKind
  description String
  quantity    Int             @default(1)
  unitPrice   Decimal         @db.Decimal(14, 2)
  amount      Decimal         @db.Decimal(14, 2) // com sinal: DISCOUNT é negativo
  manual      Boolean         @default(false) // true sobrevive ao recálculo
  createdById String?
  createdAt   DateTime        @default(now())

  invoiceId String
  invoice   Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([invoiceId])
  @@map("billing_invoice_items")
}
```

Na `Company`, junto das outras relações: `invoices Invoice[]`.

Em `CompanyContract` (modelo do 013), acrescente:

```prisma
  // Encerramento (plano 016): sem multa, com efeito no fim do mês, que é cobrado.
  // O contrato segue ACTIVE até endsAt; o agendador o passa a CANCELLED no dia seguinte.
  endsAt                 DateTime? @db.Date // último dia coberto (sempre o último dia de um mês)
  cancelRequestedAt      DateTime?
  cancelRequestedById    String?
  cancelReason           String?
  deactivateCompanyOnEnd Boolean   @default(false) // "Desativar empresa também"
```

Se o 013 já tiver criado um campo com o mesmo papel (por exemplo, uma data de
encerramento), **não duplique**: use o dele e anote o desvio no relatório.

Se o tipo de `BillingEvent` for `enum`, acrescente estes valores. Se for
`String`, crie as constantes com os mesmos nomes no código do passo 4:

`INVOICE_GENERATED`, `INVOICE_CREATED`, `INVOICE_RECALCULATED`, `INVOICE_PAID`,
`INVOICE_CANCELLED`, `INVOICE_ITEM_ADDED`, `INVOICE_ITEM_REMOVED`,
`INVOICE_UPDATED`, `INVOICE_DUE_REMINDER_SENT`,
`DOCUMENT_PENDING_REMINDER_SENT`, `CONTRACT_CANCEL_SCHEDULED`,
`CONTRACT_CANCEL_REVERTED`, `CONTRACT_ENDED`.

**Verificar**: o comando "Validar o schema" → `is valid`;
`npm run db:generate && npm run type-check` → exit 0.

### Passo 2: A env `BILLING_JOBS_ENABLED`, desligada nos três lugares

1. `apps/api/src/lib/env.ts`, depois de `WEB_URL`:

   ```ts
   // Agendador do faturamento (plano 016): gera faturas, encerra contratos e
   // manda lembretes. Desligado por padrão. Em produção, só liga depois do
   // primeiro contrato aceito; no staging, só de propósito, para teste.
   BILLING_JOBS_ENABLED: z.enum(['true', 'false']).default('false'),
   ```

2. `.env.example` (raiz), depois de `WEB_URL`, e `apps/api/.env.example`,
   depois do bloco da Inteligência e antes do bloco do tenant de demonstração:

   ```
   # Agendador do faturamento (plano 016): faturas, encerramento de contrato e
   # lembretes. Deixe false na sua máquina: o .env local aponta para um banco
   # real, e ligar aqui geraria faturas de verdade.
   BILLING_JOBS_ENABLED=false
   ```

3. `render.yaml`, nos dois serviços (`addere-api` e `addere-api-staging`),
   depois de `CORS_ORIGIN`:

   ```yaml
      # Agendador do faturamento (plano 016). Ligar só de propósito: no staging,
      # para teste; em produção, depois do primeiro contrato aceito. Ao ligar no
      # painel, troque aqui também — senão uma sincronização do Blueprint volta
      # o valor para 'false'.
      - key: BILLING_JOBS_ENABLED
        value: 'false'
   ```

4. `apps/api/src/lib/__tests__/env.test.ts`, no estilo dos casos existentes:
   - sem a variável, `parseEnv(...)` devolve `'false'`;
   - string vazia também devolve `'false'` (o `withoutEmptyValues` já trata);
   - `'true'` é aceito;
   - `'sim'` é recusado.

**Verificar**: o comando "Conferir a env" da tabela mostra cinco linhas, todas
com `false`; `npm test -w @addere/api -- env` verde.

### Passo 3: Competência e regras puras

Funções puras, sem Prisma, testadas sem mock. É aqui que os erros de dinheiro
se resolvem.

**3.1 `apps/api/src/modules/billing/competence.ts`.** Competência interna em
`'YYYYMM'` (como `GoalSnapshot.period`); na API e no web, `'YYYY-MM'`. Use os
helpers de `../intelligence/engine/business-days` e nunca `getMonth()` de um
`Date` local.

```ts
export type Ym = string // 'YYYYMM'

export function competenceAt(now: Date): Ym // mês corrente em São Paulo
export function previousCompetenceAt(now: Date): Ym // a competência que o gerador fatura
export function addMonthsYm(ym: Ym, months: number): Ym
export function competenceStart(ym: Ym): Date // @db.Date do dia 1
export function competenceEnd(ym: Ym): Date // @db.Date do último dia
export function dateToCompetence(date: Date): Ym // de um @db.Date
export function dueDateFor(ym: Ym, dueDay: number): Date // dia dueDay do mês seguinte
export function todaySaoPaulo(now: Date): Date // @db.Date de hoje em São Paulo
export function ymToIso(ym: Ym): string // '202610' → '2026-10'
export function isoToYm(iso: string): Ym // '2026-10' → '202610'
```

Se `packages/types/src/billing.ts` (013) já tiver helpers de mês ou de
vencimento, use os dele em vez de duplicar: o que importa é haver uma regra só.

**3.2 `apps/api/src/modules/billing/invoice-rules.ts`.** Use `Prisma.Decimal`
de `@prisma/client` para todo cálculo de dinheiro. **Nunca** `Number`,
`parseFloat` nem `+` em valores.

```ts
export interface BillableContract {
  status: string
  firstBilledCompetence: Date | null
  endsAt: Date | null
}

/** A competência entra no faturamento? A mesma regra da consulta do gerador, em código. */
export function isCompetenceBillable(contract: BillableContract, ym: Ym): boolean

/** Itens automáticos a partir dos termos da competência: PACKAGE e, se houver, EXTRA_SEATS. */
export function buildContractItems(terms: ContractItemInput): DraftItem[]

/** Soma exata de valores Decimal. */
export function sumAmounts(amounts: Array<Prisma.Decimal | string>): Prisma.Decimal

export function isP2002(err: unknown): boolean
```

`isCompetenceBillable` devolve `true` só quando **todas** valem:

- `status` é `ACTIVE` ou `CANCELLED`;
- `firstBilledCompetence` existe e é `<= M`;
- `endsAt` é nulo **ou** `endsAt >= início de M`;
- se `status` é `CANCELLED`, `endsAt` existe (cancelado sem data de
  encerramento nunca é cobrado).

`buildContractItems`:

- PACKAGE: `quantity 1`, `unitPrice = packagePrice`, `amount = packagePrice`,
  descrição `Pacote <nome> — <tipo> (<includedSeats> licenças)`;
- EXTRA_SEATS, só se `extraSeats > 0`: `quantity = extraSeats`,
  `unitPrice = extraSeatPrice`, `amount = extraSeatPrice × extraSeats`,
  descrição `Licenças adicionais`;
- os dois com `manual: false`.

**3.3 `packages/types/src/billing.ts`.** Acrescente os tipos que a API devolve
e o web lê:

```ts
export type InvoiceStatus = 'OPEN' | 'PAID' | 'CANCELLED'
export type InvoiceDisplayStatus = InvoiceStatus | 'OVERDUE'
export type InvoiceOrigin = 'JOB' | 'MANUAL'
export type InvoiceItemKind = 'PACKAGE' | 'EXTRA_SEATS' | 'DISCOUNT' | 'ADJUSTMENT'
export type InvoicePaymentMethod = 'PIX' | 'BOLETO' | 'TRANSFER' | 'CARD' | 'OTHER'

/** Vencida = OPEN e vencimento < hoje. Os dois em 'YYYYMMDD', hoje em São Paulo. */
export function invoiceDisplayStatus(
  status: InvoiceStatus,
  dueYmd: string,
  todayYmd: string
): InvoiceDisplayStatus

export interface InvoiceItemDto {
  id: string
  kind: InvoiceItemKind
  description: string
  quantity: number
  unitPrice: string // '1990.00'
  amount: string
  manual: boolean
}

export interface InvoiceDto {
  id: string
  number: number
  companyId: string
  companyName: string
  competence: string // 'YYYY-MM'
  dueDate: string // 'YYYY-MM-DD'
  status: InvoiceStatus
  displayStatus: InvoiceDisplayStatus
  origin: InvoiceOrigin
  total: string
  paidAt: string | null // 'YYYY-MM-DD'
  paidAmount: string | null
  paymentMethod: InvoicePaymentMethod | null
  paymentNote: string | null
  paidByName: string | null
  nfNumber: string | null
  notes: string | null
  cancelledAt: string | null // ISO
  cancelledByName: string | null
  cancelReason: string | null
  items: InvoiceItemDto[]
}

export interface InvoiceListResponse {
  items: InvoiceDto[]
  total: number
  page: number
  pageSize: number
}

/** O que o ADMIN do cliente vê: sem observação interna, motivo e nomes. */
export type MyInvoiceDto = Pick<
  InvoiceDto,
  'id' | 'number' | 'competence' | 'dueDate' | 'displayStatus' | 'total' | 'paidAt' | 'nfNumber' | 'items'
>
```

Datas de calendário viajam como `'YYYY-MM-DD'` e competência como `'YYYY-MM'`,
nunca como timestamp: é o que impede o deslocamento de um dia no navegador.
Dinheiro viaja como string com duas casas (`Decimal.toFixed(2)`).

**3.4 Testes** em `apps/api/src/modules/billing/__tests__/competence.test.ts` e
`invoice-rules.test.ts`. Horários em UTC; São Paulo é UTC−3.

- **22h de Brasília do último dia do mês:**
  `previousCompetenceAt(new Date('2026-11-01T01:00:00Z'))` → `'202609'` (ainda
  é 31/10 em São Paulo); `previousCompetenceAt(new Date('2026-11-01T03:00:00Z'))`
  → `'202610'`. Repita para 31/12 → `'202611'` e 01/01 → `'202612'`.
- **`dueDay` 1 e 10:** `dueDateFor('202610', 1)` → 2026-11-01;
  `dueDateFor('202610', 10)` → 2026-11-10; `dueDateFor('202612', 10)` →
  2027-01-10 (virada de ano).
- **Mesma regra que o 013:** para um aceite e uma carência quaisquer,
  `dueDateFor` da primeira competência dá a mesma data que o vencimento de
  `computeBillingCalendar`.
- **Mês do aceite não cobrado e carência 0:** aceite em 15/10/2026,
  `graceMonths 0`. Use `computeBillingCalendar` para obter a
  `firstBilledCompetence` e confira `isCompetenceBillable(…, '202610')` falso
  e `'202611'` verdadeiro.
- **Carência N:** o mesmo aceite com `graceMonths 2` → `'202611'` e
  `'202612'` falsos, `'202701'` verdadeiro.
- **Aceite às 23h30 do dia 31 em São Paulo** (`2026-11-01T02:30:00Z`): o mês
  do aceite é outubro, então a primeira competência é novembro, não dezembro.
  Se falhar, a falha é do 013: **PARE**.
- **Cancelamento:** `endsAt` 2026-10-31. Com `status ACTIVE` ou `CANCELLED`,
  `'202610'` verdadeiro e `'202611'` falso.
- **Status que nunca cobram:** `DRAFT` e `PENDING_ACCEPTANCE` falsos em
  qualquer competência; `CANCELLED` sem `endsAt` falso.
- **Somas Decimal:** `sumAmounts(['0.10', '0.20']).toFixed(2)` → `'0.30'`.
  Termos com `packagePrice '1990.00'`, `extraSeats 3`, `extraSeatPrice '49.90'`
  dão `149.70` no EXTRA_SEATS; somados a um DISCOUNT `-0.10` e um ADJUSTMENT
  `0.20`, o total é exatamente `'2139.80'`.
- **Sem adicional:** `extraSeats 0` → só o item PACKAGE.
- `invoiceDisplayStatus`: OPEN com vencimento ontem → `OVERDUE`; vencimento
  hoje → `OPEN`; PAID e CANCELLED com vencimento passado continuam PAID e
  CANCELLED.

**Verificar**: `npm test -w @addere/api -- billing` verde; `npm run type-check`
exit 0.

### Passo 4: Envio de e-mail com deduplicação

**Onde.** Se o 014 deixou um módulo de envio em `apps/api/src/modules/billing/`,
acrescente a função nele. Se não deixou, crie
`apps/api/src/modules/billing/billing-mailer.ts` no padrão de
`auth.service.ts:72` e `:85-107`.

```ts
export type SendOutcome = 'sent' | 'duplicate' | 'skipped' | 'failed'

export async function sendBillingEmailOnce(input: {
  companyId: string
  dedupeKey: string // ex.: 'invoice:<id>:due-reminder'
  eventType: string
  payload: Record<string, unknown> // só ids e nomes de campo
  to: string[]
  subject: string
  html: string
}): Promise<SendOutcome>
```

A ordem importa:

1. Sem `RESEND_API_KEY`, ou sem destinatário → `'skipped'`, sem gravar nada.
   Assim, quando a chave entrar, o lembrete ainda sai.
2. **Reserva**: crie o `BillingEvent` com o `dedupeKey`, autor `null`. P2002 →
   `'duplicate'` (outro tick ou outro processo já mandou).
3. Envie com `resend.emails.send(payload, { idempotencyKey: dedupeKey })`.
4. Se o retorno tiver `error`, **ou** se o `send` lançar: apague a reserva
   (`billingEvent.deleteMany({ where: { dedupeKey } })`), chame `captureError`
   e devolva `'failed'`. O próximo tick tenta de novo. É a única exclusão de
   `BillingEvent` permitida: a reserva de um envio que não aconteceu.
5. Sucesso → `'sent'`.

Ainda neste arquivo:

- `billingRecipients(companyId)`: o `billingEmail` do `ClientProfile` mais os
  e-mails dos ADMINs ativos da empresa, em minúsculas e sem repetição;
- `escapeHtml(text)`: todo texto do banco (nome da empresa, descrição de item)
  passa por ele antes de entrar no HTML;
- `replyTo`: o e-mail da Addere do `BillingSettings`, quando houver;
- `from: 'Addere <noreply@addere.com.br>'`, igual ao reset de senha;
- os dois modelos de texto:
  - **lembrete de vencimento**: assunto `Fatura do Addere vence em DD/MM/AAAA`;
    corpo com número, competência por extenso, valor, a lista de itens e um
    link para `${WEB_URL}/plano`;
  - **documento pendente**: assunto `Lembrete: Contrato de Licença de Uso do
    Addere aguardando seu aceite` (ou `Aditivo …`, conforme o tipo); link
    igual ao do e-mail de envio do 014.

**Testes** (`__tests__/billing-mailer.test.ts`; mock do `resend` com `vi.mock`
e do Prisma pelo `prisma-mock`):

- sem chave → `'skipped'` e nenhum `billingEvent.create`;
- `billingEvent.create` rejeita com P2002 → `'duplicate'` e o `send` não é
  chamado;
- `send` devolve `{ data: null, error: {...} }` → `'failed'`, `deleteMany` com
  o mesmo `dedupeKey` e `captureError` chamado;
- `send` lança → o mesmo de cima;
- sucesso → `'sent'`, e o `send` recebeu `idempotencyKey` igual ao
  `dedupeKey`;
- `escapeHtml('<b>&"')` → `'&lt;b&gt;&amp;&quot;'`;
- `billingRecipients` junta, põe em minúsculas e tira repetidos.

**Verificar**: `npm test -w @addere/api -- billing` verde.

### Passo 5: O gerador de faturas

Em `apps/api/src/modules/billing/invoices.service.ts`:

```ts
export interface GenerateSummary {
  competence: string // 'YYYY-MM'
  created: number
  existing: number
  skipped: number
  failed: number
}

export async function generateInvoices(now: Date = new Date()): Promise<GenerateSummary>

/** Itens automáticos e vencimento da competência; null se não há termos efetivos. Usado também por recálculo e avulsa. */
export function buildInvoiceDraft(contract: ContractWithTerms, ym: Ym): InvoiceDraft | null
```

**`generateInvoices`**, nesta ordem:

1. `ym = previousCompetenceAt(now)`; `competence = competenceStart(ym)`.
2. Busque os contratos que **podem** ser cobrados em M:

   ```ts
   where: {
     firstBilledCompetence: { lte: competence },
     OR: [
       { status: 'ACTIVE', OR: [{ endsAt: null }, { endsAt: { gte: competence } }] },
       { status: 'CANCELLED', endsAt: { gte: competence, lte: competenceEnd(ym) } },
     ],
   }
   ```

   Inclua os termos `EFFECTIVE` com o pacote. Contrato `DRAFT` e
   `PENDING_ACCEPTANCE` nunca passam (não têm `firstBilledCompetence`, e o
   `status` não está no `OR`).
3. Para cada contrato:
   1. **Checagem dupla**: se `isCompetenceBillable(contract, ym)` for falso,
      pule, conte em `skipped` e chame `captureError` — a consulta deixou
      passar o que a regra recusa, e isso é bug.
   2. `invoice.findUnique({ where: { companyId_competence } })`. Existe →
      `existing++` e siga. Consultar antes evita gastar um número da sequência
      a cada hora.
   3. Resolva os termos da competência **com a função do 013** e monte o
      rascunho: `buildContractItems` + `dueDateFor(ym, contract.dueDay)`. Sem
      termos efetivos → `skipped++` e `captureError` (contrato ativo sem termos
      no início de M é dado inconsistente).
   4. Numa `$transaction` interativa: `invoice.create` com os itens aninhados,
      `total = sumAmounts(...)`, `origin JOB`, `termsId`; depois
      `billingEvent.create` com tipo `INVOICE_GENERATED`, autor `null` e
      payload `{ invoiceId, number }`.
   5. P2002 no `create` → `existing++` (outro processo criou primeiro). Outro
      erro → `failed++` e `captureError`; siga para o próximo contrato.
   6. Se a fatura nasceu com `dueDate < todaySaoPaulo(now)` (geração atrasada),
      chame `captureError` com a empresa e a competência. O superadmin precisa
      saber; o 017 vai contar atraso a partir desse vencimento.
4. Devolva o resumo. A função não lança por erro de um contrato.

**Testes** (`__tests__/invoices-generate.test.ts`, com `prisma-mock`):

- **Consulta:** gerando em `2026-11-01T03:30:00Z`, o `companyContract.findMany`
  recebe `firstBilledCompetence: { lte: 2026-10-01 }` e o `OR` acima. Gerando
  em `2026-11-01T01:00:00Z` (22h do dia 31 em São Paulo), recebe
  `lte: 2026-09-01`.
- **Idempotência por consulta:** `invoice.findUnique` devolve uma fatura →
  `invoice.create` não é chamado e `existing === 1`.
- **Idempotência por P2002:** `invoice.create` rejeita com
  `new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002',
  clientVersion: '5.22.0' })` → `existing === 1`, nenhum `billingEvent.create`,
  a função resolve sem lançar.
- **Fronteira pós-paga (mudança no dia 15):** termos A efetivos desde
  2026-08-03 (R$ 1.990,00, 0 adicionais) e B efetivos em
  `2026-10-15T14:00:00Z` (R$ 1.990,00, 3 adicionais a R$ 49,90). Gerando em
  01/11 (competência outubro) a fatura usa A, total `1990.00`. Gerando em
  01/12 (competência novembro) usa B, total `2139.70`. O mesmo vale para
  termos com `origin LICENSE_REQUEST`.
- **Termos aceitos às 22h de 30/09 em São Paulo** contam para outubro.
- **Mês do cancelamento cobrado e o seguinte não:** contrato `CANCELLED` com
  `endsAt` 2026-10-31. Em 01/11 a fatura de outubro é criada. Em 01/12, mesmo
  com o mock devolvendo o contrato (simula consulta errada), **nenhuma**
  fatura é criada, `skipped === 1` e `captureError` é chamado.
- **Carência pela checagem dupla:** mock devolve contrato `ACTIVE` com
  `firstBilledCompetence` 2027-01-01 gerando dezembro → nada criado.
- **Contrato não ativo:** mock devolve `DRAFT` e `PENDING_ACCEPTANCE` → nada
  criado.
- **`dueDay` 1 e 10:** o `create` recebe `dueDate` 2026-11-01 e 2026-11-10.
- **Itens:** o `create` recebe PACKAGE e EXTRA_SEATS com `manual: false` e o
  total em Decimal.
- **Erro em um contrato não para os outros:** primeiro `create` rejeita com
  erro genérico, segundo funciona → `failed 1`, `created 1`.

**Verificar**: `npm test -w @addere/api -- billing` verde.

### Passo 6: Cancelamento do contrato com efeito no fim do mês

Em `apps/api/src/modules/billing/contract-cancel.service.ts`:

**`scheduleContractCancel(companyId, { reason, deactivateCompany }, actor, now)`**

1. Contrato inexistente → 404. `status` diferente de `ACTIVE` → 409
   `CONTRACT_NOT_ACTIVE`. `endsAt` já preenchido → 409
   `CONTRACT_CANCEL_ALREADY_SCHEDULED`.
2. `endsAt = competenceEnd(competenceAt(now))` — o último dia do mês corrente
   **em São Paulo**.
3. Numa transação:
   - `companyContract.updateMany({ where: { id, status: 'ACTIVE', endsAt: null },
     data: { endsAt, cancelRequestedAt: now, cancelRequestedById: actor.id,
     cancelReason, deactivateCompanyOnEnd } })`. `count 0` → 409
     `CONTRACT_CANCEL_ALREADY_SCHEDULED` (corrida);
   - cancele os documentos `SENT` da empresa com a função de "cancelar envio"
     do 014. Aditivo pendente de um contrato que vai terminar não faz sentido,
     e um aceite tardio não pode reativar nada;
   - `BillingEvent` `CONTRACT_CANCEL_SCHEDULED`, autor = quem pediu, payload
     `{ fields: ['endsAt', 'cancelReason', 'deactivateCompanyOnEnd'] }`.
4. Devolva `{ endsAt: 'YYYY-MM-DD' }`.

**`revertContractCancel(companyId, actor, now)`**: só com `status ACTIVE`,
`endsAt` preenchido e `endsAt >= hoje` em São Paulo; senão 409
`CONTRACT_CANCEL_NOT_SCHEDULED`. Limpa os cinco campos (o booleano volta a
`false`) e grava `CONTRACT_CANCEL_REVERTED`.

**`closeEndedContracts(now)`** (chamado pelo agendador):

1. `today = todaySaoPaulo(now)`; busque `status ACTIVE` com `endsAt < today`.
2. Para cada um, numa transação:
   - `updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'CANCELLED' } })`;
     `count 0` → outro processo já encerrou, siga;
   - `company.update`: `intelligenceEnabled: false` e, se
     `deactivateCompanyOnEnd`, `active: false`;
   - cancele documentos `SENT` que tenham sobrado (defensivo);
   - `BillingEvent` `CONTRACT_ENDED`, autor `null`.
3. Depois da transação, se desativou a empresa, chame `clearSchedule(companyId)`
   (`sync/scheduler.ts:61`). É o que `toggleCompanyActive` faz
   (`companies.service.ts:79-88`); aqui a escrita fica dentro da transação para
   não se perder se algo falhar no meio.
4. Devolva quantos contratos foram encerrados.

**Rotas** em `apps/api/src/modules/billing/contract-cancel.routes.ts`, com
`requireSuperAdmin`, no mesmo prefixo das rotas de contrato do 013:

- `POST /admin/billing/clients/:companyId/contract/cancel` —
  `{ reason: string (3 a 500), deactivateCompany: boolean }`;
- `POST /admin/billing/clients/:companyId/contract/cancel/revert`.

Se as rotas de contrato do 013 usam outro prefixo, siga o dele e anote no
relatório. Na rota de leitura do contrato do 013, devolva também `endsAt`
(`'YYYY-MM-DD'`), `cancelRequestedAt`, `cancelReason` e
`deactivateCompanyOnEnd`, e acrescente esses campos ao tipo dela em
`packages/types`.

**Testes** (`__tests__/contract-cancel.test.ts`):

- pedido em `2026-10-15T15:00:00Z` → `endsAt` 2026-10-31;
- pedido às 22h de 31/10 em São Paulo (`2026-11-01T01:00:00Z`) → `endsAt`
  2026-10-31;
- pedido à 0h30 de 01/11 em São Paulo (`2026-11-01T03:30:00Z`) → `endsAt`
  2026-11-30;
- contrato `PENDING_ACCEPTANCE` → 409 `CONTRACT_NOT_ACTIVE`; já agendado →
  409 `CONTRACT_CANCEL_ALREADY_SCHEDULED`;
- `closeEndedContracts` às 23h59 de 31/10 em São Paulo
  (`2026-11-01T02:59:00Z`) não encerra; à 0h de 01/11 (`2026-11-01T03:00:00Z`)
  encerra, grava `intelligenceEnabled: false` e o evento;
- com `deactivateCompanyOnEnd`, a mesma transação grava `active: false` e
  `clearSchedule` é chamado depois; sem a opção, `active` não é tocado;
- desfazer depois do fim do mês → 409 `CONTRACT_CANCEL_NOT_SCHEDULED`;
- rotas: ADMIN e vendedor → 403.

**Verificar**: `npm test -w @addere/api -- billing` verde.

### Passo 7: O agendador

**7.1 Lembretes** em `apps/api/src/modules/billing/jobs/reminders.ts`:

- `sendDueReminders(now)`: `today = todaySaoPaulo(now)`; `N` = dias de aviso do
  `BillingSettings` (se a linha não existir, o padrão do 013). Busque faturas
  `status OPEN`, `total > 0`, `dueDate` entre `today` e `today + N dias`. Para
  cada uma, `sendBillingEmailOnce` com `dedupeKey`
  `invoice:<invoiceId>:due-reminder`, tipo `INVOICE_DUE_REMINDER_SENT`,
  destinatários de `billingRecipients`.
- `sendPendingDocumentReminders(now)`: documentos `SENT` com
  `sentAt <= now − 72 h`. Destinatários: os ADMINs ativos da empresa (decisão
  10). `dedupeKey` `document:<documentId>:pending-reminder`, tipo
  `DOCUMENT_PENDING_REMINDER_SENT`.
- As duas devolvem `{ sent, duplicate, skipped, failed }`. Se houve `skipped`
  por falta de chave, um único `console.warn` por chamada.

**7.2 `apps/api/src/modules/billing/jobs/billing-scheduler.ts`**, copiando o
padrão de `intelligence/jobs/scheduler.ts:97-103` e `:155-162`:

```ts
const TICK_MS = 3_600_000 // de hora em hora

export interface BillingTickSummary {
  invoices: GenerateSummary | null
  contractsEnded: number | null
  dueReminders: ReminderSummary | null
  documentReminders: ReminderSummary | null
  errors: string[] // nomes dos passos que falharam
}

// Ordem: gerar antes de encerrar. O gerador aceita o contrato ACTIVE com endsAt no mês e o já
// CANCELLED com endsAt no mês, então a ordem não muda o resultado — mas fica fixa e testada.
// Plano 017: o aviso de suspensão, o bloqueio e o desbloqueio entram depois destes passos.
const STEPS = [
  ['invoices', generateInvoices],
  ['contractsEnded', closeEndedContracts],
  ['dueReminders', sendDueReminders],
  ['documentReminders', sendPendingDocumentReminders],
] as const

/** Nunca lança: roda solto no boot e no setInterval (ver intelligence/jobs/scheduler.ts:97-103). */
export async function tickBillingScheduler(now: Date = new Date()): Promise<BillingTickSummary>

export function shouldStartBillingScheduler(
  e: Pick<Env, 'NODE_ENV' | 'BILLING_JOBS_ENABLED'>
): boolean // NODE_ENV !== 'test' && BILLING_JOBS_ENABLED === 'true'

export function initBillingScheduler(): void
```

- Cada passo roda no seu `try/catch`. Erro transitório de banco
  (`isTransientDbError`, importado de `../../intelligence/jobs/scheduler`) só
  vai ao console: a hora seguinte tenta de novo. Qualquer outro erro vai ao
  `captureError` com `{ module: 'billing-scheduler', step }` e o nome do passo
  entra em `errors`. Um passo que falha não impede os seguintes.
- `initBillingScheduler`: se já iniciado, sai. Se
  `shouldStartBillingScheduler(env)` for falso, registra
  `[billing-scheduler] desligado (BILLING_JOBS_ENABLED=false)` (exceto em
  teste) e sai. Senão: `void tickBillingScheduler()` (catch-up no boot),
  `setInterval` de uma hora, `.unref()` e
  `console.log('[billing-scheduler] ticker de 1 h iniciado')`.

**7.3 `apps/api/src/app.ts`**: no `onReady`, logo depois de `initIntelScheduler()`
(hoje a linha 118), chame `initBillingScheduler()`. Não mexa em mais nada do
arquivo, exceto o `import`.

**Testes** (`__tests__/billing-scheduler.test.ts` e `reminders.test.ts`):

- `shouldStartBillingScheduler`: teste → falso mesmo com `'true'`; produção com
  `'false'` → falso; produção com `'true'` → verdadeiro.
- `initBillingScheduler()` em teste não chama `setInterval` (`vi.spyOn`).
- **Nunca lança:** `companyContract.findMany` rejeita com erro genérico → o
  tick resolve, `errors` contém `'invoices'`, `captureError` chamado, e os
  lembretes rodaram mesmo assim.
- Erro transitório (`{ code: 'P1001' }`) → o tick resolve e `captureError`
  **não** é chamado.
- **Ordem:** os quatro passos rodam na ordem de `STEPS`.
- **Lembrete de vencimento:** a consulta usa `status OPEN`, `total > 0` e a
  janela `[hoje, hoje + N]` em datas de São Paulo; o `dedupeKey` é
  `invoice:<id>:due-reminder`; segundo tick com P2002 na reserva → nenhum
  `send`.
- **Documento pendente:** a consulta usa `sentAt <= now − 72 h`; empresa sem
  ADMIN ativo → `skipped`.

**Verificar**: `npm test -w @addere/api -- billing` verde;
`npm run type-check` exit 0.

### Passo 8: Rotas de faturas

**8.1 Schemas** em `apps/api/src/modules/billing/invoices.schema.ts` (zod):

- competência `^\d{4}-(0[1-9]|1[0-2])$`; data `^\d{4}-\d{2}-\d{2}$` (e válida);
- dinheiro como string: `^\d{1,12}(\.\d{1,2})?$`; no ajuste, com sinal opcional
  `^-?\d{1,12}(\.\d{1,2})?$`;
- descrição de item: 3 a 200 caracteres; motivo: 3 a 500; `nfNumber` até 60;
  `notes` até 2000.

**8.2 Rotas.** Em `apps/api/src/modules/billing/invoices.routes.ts`, todas as de
`/admin/billing` com `requireSuperAdmin`. Registre no mesmo ponto em que o 013
registrou as rotas `/admin/billing`, e a do ADMIN junto das `/billing/me/*` do
014, com o mesmo guard delas.

| Rota | Entrada | Regra | Erros |
|---|---|---|---|
| `GET /admin/billing/invoices` | query `status?` (`OPEN`, `OVERDUE`, `PAID`, `CANCELLED`), `competence?`, `companyId?`, `page?` (padrão 1), `pageSize?` (padrão 50, máximo 100) | `OPEN` = em aberto e a vencer (`dueDate >= hoje`); `OVERDUE` = em aberto com `dueDate < hoje`; hoje em São Paulo. Ordena por `dueDate` desc e `number` desc. Devolve `InvoiceListResponse` com `displayStatus`. | — |
| `GET /admin/billing/invoices/:id` | — | `InvoiceDto` com itens | 404 |
| `POST /admin/billing/invoices` (avulsa) | `{ companyId, competence, dueDate, useContractTerms, items: [{ kind: 'DISCOUNT' \| 'ADJUSTMENT', description, amount }], notes? }` | Competência < mês corrente (D3); sem fatura na competência; `dueDate >= hoje`. Com `useContractTerms`, os itens automáticos vêm de `buildInvoiceDraft` e a competência tem de passar em `isCompetenceBillable`. Pelo menos um item no total (zod). `origin MANUAL`, `createdById`. P2002 no `create` vira `INVOICE_ALREADY_EXISTS`. | 409 `INVOICE_ALREADY_EXISTS` (com `{ invoiceId, number }`); 422 `COMPETENCE_NOT_PAST`, `DUE_DATE_IN_PAST`, `COMPETENCE_NOT_BILLABLE`, `INVOICE_NEGATIVE_TOTAL` |
| `POST /admin/billing/invoices/:id/recalculate` | — | Só OPEN. Apaga os itens `manual: false`, recria pelos termos da competência (o mesmo `buildInvoiceDraft` do gerador; competência que não é mais cobrável fica sem itens automáticos), mantém os manuais e refaz o total. Não muda o vencimento. | 409 `INVOICE_PAID_IMMUTABLE`, `INVOICE_CANCELLED`; 422 `INVOICE_NEGATIVE_TOTAL` |
| `POST /admin/billing/invoices/:id/pay` | `{ paidAt, amount, method, note? }` | Só OPEN → PAID. `paidAt <= hoje`. `amount >= 0`, pode diferir do total (D5). Grava `paidById` e `paidByName` (nome lido do usuário). | 409 `INVOICE_PAID_IMMUTABLE`, `INVOICE_CANCELLED`; 422 `PAID_AT_IN_FUTURE` |
| `POST /admin/billing/invoices/:id/cancel` | `{ reason }` | Só OPEN → CANCELLED. A competência continua ocupada (D1). | 409 `INVOICE_PAID_IMMUTABLE`, `INVOICE_CANCELLED` |
| `POST /admin/billing/invoices/:id/items` | `{ kind: 'DISCOUNT' \| 'ADJUSTMENT', description, amount }` | Só OPEN. DISCOUNT recebe valor positivo e grava negativo; ADJUSTMENT grava com o sinal recebido. `manual: true`, `createdById`. Refaz o total. | 409 como acima; 422 `INVOICE_NEGATIVE_TOTAL` |
| `DELETE /admin/billing/invoices/:id/items/:itemId` | — | Só OPEN; só item `manual: true` (D9). Refaz o total. | 409 como acima, `INVOICE_ITEM_NOT_MANUAL`; 422 `INVOICE_NEGATIVE_TOTAL` |
| `PATCH /admin/billing/invoices/:id` | `{ nfNumber?, notes? }` | OPEN e PAID (D4). | 409 `INVOICE_CANCELLED` |
| `POST /admin/billing/jobs/run` | — | Roda `tickBillingScheduler()` agora e devolve o resumo com 200. Funciona com a env desligada: é a ferramenta de incidente. `userRateLimit(3, '1 minute')`. | — |
| `GET /billing/me/invoices` | — | ADMIN, só a própria empresa (`companyId` do token), todas as faturas, como `MyInvoiceDto[]`. Vendedor, gerente e SUPERADMIN → 403. | 403 |

Os erros usam o `code` do `AppError` (013), com mensagens em português, por
exemplo: `Fatura paga não muda. Lance um ajuste na próxima fatura.`

**8.3 Como cada mutação funciona** (em `invoices.service.ts`):

1. Leia a fatura. PAID → `INVOICE_PAID_IMMUTABLE`; CANCELLED →
   `INVOICE_CANCELLED`.
2. Abra uma `$transaction` interativa e comece por
   `invoice.updateMany({ where: { id, status: 'OPEN' }, data: { updatedAt: new Date() } })`.
   `count 0` → releia e lance o código do status atual (outra pessoa mudou no
   meio). Esse `updateMany` também trava a linha da fatura até o fim da
   transação: duas mudanças de itens ao mesmo tempo não se atropelam.
3. Calcule o total **antes** de gravar o item: itens atuais + o novo (ou − o
   removido) com `sumAmounts`. Negativo → 422 `INVOICE_NEGATIVE_TOTAL` sem
   escrever nada.
4. Grave os itens e o total.
5. Grave um `BillingEvent` com autor `request.user.sub` e payload
   `{ invoiceId, fields: [...] }` — só nomes de campo, nunca valores.

Na baixa, depois da transação, deixe exatamente este comentário, no ponto em
que o 017 vai entrar:

```ts
// Plano 017: o desbloqueio da empresa na baixa entra aqui, depois da transação.
```

**Testes** (`__tests__/invoices-routes.test.ts`, com `buildApp` + `app.inject`,
no padrão de `companies/__tests__/companies-scope.test.ts`):

- **Acesso:** ADMIN e vendedor → 403 em todas as rotas `/admin/billing/invoices*`
  e em `jobs/run`; SUPERADMIN → 200.
- **Filtro de vencidas:** `status=OVERDUE` → `invoice.findMany` com
  `status: 'OPEN'` e `dueDate: { lt: hoje }`; `status=OPEN` → `gte: hoje`.
- **PAID imutável:** com a fatura PAID, `recalculate`, `pay`, `cancel`,
  `POST items` e `DELETE items` → 409 `INVOICE_PAID_IMMUTABLE`, e nenhum
  `updateMany`, `invoiceItem.create`, `invoiceItem.deleteMany` nem
  `invoiceItem.createMany` é chamado. `PATCH` com `nfNumber` → 200.
- **Cancelada:** as mesmas rotas → 409 `INVOICE_CANCELLED`; `PATCH` → 409.
- **Recálculo preservando o manual:** fatura OPEN com PACKAGE `1990.00`
  (`manual: false`) e DISCOUNT `-100.00` (`manual: true`); termos agora com
  `packagePrice 2200.00` → `invoiceItem.deleteMany` com
  `{ invoiceId, manual: false }`, novo PACKAGE `2200.00`, total `2100.00`. O
  `deleteMany` nunca recebe filtro que alcance item manual.
- **Baixa:** grava `paidAt`, `paidAmount`, `paymentMethod`, `paidById` e
  `paidByName`; grava `INVOICE_PAID`; `paidAt` amanhã → 422
  `PAID_AT_IN_FUTURE`.
- **Desconto maior que o total** → 422 `INVOICE_NEGATIVE_TOTAL` e
  `invoiceItem.create` não chamado.
- **Remover item automático** → 409 `INVOICE_ITEM_NOT_MANUAL`.
- **Avulsa:** competência do mês corrente → 422 `COMPETENCE_NOT_PAST`;
  competência ocupada → 409 `INVOICE_ALREADY_EXISTS`; `dueDate` ontem → 422
  `DUE_DATE_IN_PAST`; `useContractTerms` antes da `firstBilledCompetence` →
  422 `COMPETENCE_NOT_BILLABLE`; P2002 no `create` → 409
  `INVOICE_ALREADY_EXISTS`, não o "Registro duplicado" genérico.
- **ADMIN:** `GET /billing/me/invoices` busca com o `companyId` do token, e a
  resposta não tem `notes`, `cancelReason`, `paidByName` nem `paymentNote`.
- **`jobs/run`:** devolve o resumo do tick (mock de `tickBillingScheduler`).

**Verificar**: `npm test --workspace=apps/api` verde; `npm run type-check` e
`npm run lint` exit 0.

### Passo 9: Web — formatadores, hook e pill

1. `apps/web/src/lib/billing-format.ts`, puro. **Não** redefina formatador de
   data nem de competência: use `formatBillingDate` e `formatCompetence` de
   `packages/types/src/billing.ts` (plano 013), que leem `@db.Date` em UTC e
   escrevem `DD/MM/AAAA` e `MM/AAAA`. O `formatDate` de `utils.ts:15-21` mostra o
   dia anterior no Brasil e não pode ser usado em data de cobrança. O arquivo
   tem só:
   - `formatInvoiceNumber(124)` → `'000124'`;
   - `parseMoneyInput('1.234,50')` → `'1234.50'`; `'0,1'` → `'0.10'`;
     `'-10,00'` → `'-10.00'` só com `{ allowNegative: true }`; `'abc'`,
     `'1,234'` e vazio → `null`.
   - `PAYMENT_METHOD_LABELS`: PIX → "PIX", BOLETO → "Boleto", TRANSFER →
     "Transferência", CARD → "Cartão", OTHER → "Outra".
2. `apps/web/src/lib/__tests__/billing-format.test.ts` com os casos acima.
3. `apps/web/src/hooks/useInvoices.ts`, no padrão de `hooks/useCompany.ts`
   (React Query + `api` + `toast` + `getApiErrorMessage`): `invoicesKeys`,
   `useInvoices(filters)`, `useInvoice(id)`, `useMyInvoices()` e as mutações
   `usePayInvoice`, `useCancelInvoice`, `useAddInvoiceItem`,
   `useRemoveInvoiceItem`, `useUpdateInvoice`, `useRecalculateInvoice`,
   `useCreateManualInvoice`, `useRunBillingJobs`, `useScheduleContractCancel`
   e `useRevertContractCancel`. Toda mutação invalida `invoicesKeys.all`; as
   de contrato invalidam também a chave do contrato do 013.
4. Em `apps/web/src/components/ui/StatusPill.tsx`, **acrescente**
   `InvoiceStatusPill({ status: InvoiceDisplayStatus })`, com a mesma casca do
   `StatusPill` e as classes de token do `Badge`:

   | Status | Rótulo | Classes |
   |---|---|---|
   | OPEN | Em aberto | `bg-brand/10 text-brand` |
   | OVERDUE | Vencida | `bg-danger/10 text-danger` |
   | PAID | Paga | `bg-success/10 text-success` |
   | CANCELLED | Cancelada | `bg-muted/10 text-muted` |

   O `StatusPill` atual e os três lugares que o usam não mudam. Nenhuma cor
   hexadecimal.

**Verificar**: `npm test --workspace=apps/web` verde; `npm run type-check`
exit 0.

### Passo 10: Web — `/gestao/faturas`

1. `apps/web/src/components/billing/InvoicesTable.tsx`: recebe `filters`
   (inclusive `companyId` fixo) e `showCompany`. Usa `Table` com
   `renderExpanded` para os itens e `onRowClick` para abrir e fechar a linha;
   paginação com o `Pagination` de `components/ui/DataTable.tsx`. Colunas e
   menu ⋯ como no esboço. O menu só mostra o que o status permite (OPEN: todas
   as ações; PAID: só NF e observações; CANCELLED: nada). Item manual tem a
   marca "manual" e, em fatura OPEN, o botão "remover".
2. `apps/web/src/components/billing/InvoiceModals.tsx`, todos sobre `Modal` e
   os componentes de formulário existentes (`FormField`, `Input`, `Textarea`,
   `Button`):
   - `PayInvoiceModal`: data (padrão hoje, `max` hoje), valor (padrão o total),
     forma, observação, e o aviso de valor diferente do total do esboço;
   - `InvoiceItemModal`: tipo Desconto ou Ajuste, descrição e valor (ajuste
     aceita sinal; o texto de ajuda diz "positivo cobra, negativo devolve");
   - `InvoiceNotesModal`: NF e observação interna;
   - `ManualInvoiceModal`: cliente (lista de `useCompanies`, oculto quando vem
     da ficha), competência (`<input type="month">` com `max` no mês
     anterior), vencimento (`min` hoje), "Usar o pacote e os adicionais do
     contrato nesta competência", itens manuais e observação;
   - `CancelInvoiceModal`: motivo obrigatório.
   - "Recalcular" e "Rodar faturamento" usam o `ConfirmModal` de
     `empresas/[id]/ConfirmModal.tsx`. Texto do segundo: "Gera as faturas do
     mês anterior que faltarem, encerra contratos que chegaram ao fim e manda
     os lembretes. Pode rodar mais de uma vez: nada é duplicado." Ao terminar,
     um `toast` com o resumo (faturas criadas, já existentes, contratos
     encerrados, lembretes enviados).
3. `apps/web/src/app/(admin)/gestao/faturas/page.tsx`: título, os dois botões,
   os filtros (status, competência, cliente) e a `InvoicesTable` com
   `showCompany`. O gate de SUPERADMIN vem do `gestao/layout.tsx` do 013.
4. `apps/web/src/app/(admin)/layout.tsx`: no grupo Gestão Addere, o item
   `{ href: '/gestao/faturas', label: 'Faturas', match: (p) =>
   p.startsWith('/gestao/faturas'), icon: Receipt, requires: 'superadmin' }`,
   depois de Clientes (ordem do plano aprovado). `Receipt` vem de
   `lucide-react`. Se o 013 já deixou o item, só confira o `href`.

Datas e competências só por `formatBillingDate`/`formatCompetence` (013);
dinheiro na tela por `formatCurrency`. Texto que entra em documento com hash
(contrato, aditivo, declaração) usa o `formatBrl` sem `Intl` de
`packages/types` — convenção da Fase 6, ver `plans/README.md`.

**Verificar**: `npm run type-check`, `npm run lint` e `npm run build:web`
exit 0; `grep -rn "formatDate(" apps/web/src/components/billing
apps/web/src/app/\(admin\)/gestao/faturas` vazio.

### Passo 11: Web — ficha do cliente

1. Na ficha `/gestao/clientes/[id]` do 013, acrescente a aba **Faturas** na
   barra de abas: `InvoicesTable` com `companyId` fixo e sem a coluna Cliente,
   mais o botão "Fatura avulsa" com o cliente já escolhido.
2. Na aba **Contrato** do 013, o bloco "Encerramento" do esboço:
   - contrato ACTIVE sem `endsAt`: o texto e o botão "Cancelar contrato";
   - `apps/web/src/components/billing/CancelContractModal.tsx`: mostra a data
     de término calculada no navegador só como prévia (o valor que vale é o
     que a API devolve), motivo obrigatório e "Desativar a empresa também,
     quando o contrato terminar", **marcado por padrão** (D7);
   - contrato ACTIVE com `endsAt`: a linha "Cancelamento agendado…" com
     data, motivo, a nota da desativação quando marcada e o botão "Desfazer";
   - contrato CANCELLED: "Contrato encerrado em DD/MM/AAAA", sem botões;
   - DRAFT e PENDING_ACCEPTANCE: o bloco não aparece.

**Verificar**: `npm run type-check`, `npm run lint` e `npm run build:web`
exit 0.

### Passo 12: Web — faturas no `/plano` do ADMIN

1. `apps/web/src/components/billing/MyInvoicesSection.tsx`: `useMyInvoices()`,
   tabela do esboço (Nº, Competência, Vencimento, Valor, `InvoiceStatusPill`,
   Paga em), linha que abre os itens, e as duas frases de rodapé. Lista vazia:
   o `EmptyState`/`TableEmptyState` existente, com "Nenhuma fatura ainda. A
   primeira sai no início do mês seguinte ao primeiro mês cobrado."
2. Se `apps/web/src/app/(admin)/plano/page.tsx` existe (015 mergeado), monte
   `<MyInvoicesSection />` abaixo do conteúdo dele, sem mexer no resto.
3. Se não existe, crie a página só com o título "Plano e cobrança" e
   `<MyInvoicesSection />`, e o item `{ href: '/plano', label: 'Plano e
   cobrança', …, requires: 'admin' }` no grupo Empresa. Registre no relatório
   que o 015 vai criar a mesma página: quem mergear por último junta as duas
   partes.

**Verificar**: `npm run type-check`, `npm run lint` e `npm run build:web`
exit 0.

### Passo 13: Documentação de operação

Em `docs/billing/README.md` (crie só esta seção se o arquivo ainda não
existir), a seção **Faturamento (plano 016)**, curta, com:

- o que o agendador faz a cada hora, na ordem dos passos;
- **como ligar**: deploy da API com a migration → no painel do Render,
  `BILLING_JOBS_ENABLED=true` no serviço → o mesmo valor em `render.yaml` →
  conferir no log `[billing-scheduler] ticker de 1 h iniciado`. Staging só de
  propósito; produção só depois do primeiro contrato aceito;
- `POST /admin/billing/jobs/run` (botão "Rodar faturamento") funciona com a env
  desligada e é seguro repetir;
- fatura cancelada ocupa a competência (D1); mês antigo entra por avulsa (D2,
  D3); fatura paga só muda NF e observação (D4);
- os `dedupeKey` usados (`invoice:<id>:due-reminder`,
  `document:<id>:pending-reminder`) e a regra de reserva e liberação;
- o que acontece no fim do contrato (D6);
- retenção: fatura é registro fiscal e nunca é apagada.

**Verificar**: o arquivo cita `BILLING_JOBS_ENABLED`, `jobs/run` e as decisões
D1 a D6.

### Passo 14: Migration (último commit, sozinha)

> ⚠️ Todo comando Prisma que conecta recebe `DATABASE_URL` **e**
> `DATABASE_URL_DIRECT` apontando para `localhost`. Sem os dois, o Prisma lê
> `packages/db/.env`, que aponta para o Neon. Confira com `echo` antes de cada
> comando. Nunca rode contra o Neon.

1. Nome: `<YYYYMMDDHHMMSS>_billing_invoices`, com `date -u +%Y%m%d%H%M%S` no
   momento da execução. Tem de ser posterior a `20261014120000` **e** a toda
   pasta existente (`ls packages/db/prisma/migrations | sort | tail -3`),
   inclusive as do 013, do 014 e, se já entrou, do 015.
2. Suba o Postgres e crie os dois bancos (tabela "Comandos").
3. Gere o delta para um arquivo temporário e depois mova:

   ```bash
   LOCAL=postgresql://addere_dev_user:addere_dev_password@localhost:5432
   cd packages/db
   DATABASE_URL=$LOCAL/addere_check_016 DATABASE_URL_DIRECT=$LOCAL/addere_check_016 \
     npx prisma migrate diff \
       --from-migrations ./prisma/migrations \
       --to-schema-datamodel ./prisma/schema.prisma \
       --shadow-database-url $LOCAL/addere_shadow_016 \
       --script > /tmp/016-billing.sql
   ```

   Crie a pasta, ponha o SQL em `migration.sql` e acrescente no topo um
   comentário em português, como em
   `20261014120000_intel_llm_calls/migration.sql`:

   ```sql
   -- Faturamento mensal pós-pago (plano 016): faturas e itens, com uma fatura
   -- por empresa e competência — a chave única é a idempotência do gerador. O
   -- contrato ganha os campos do cancelamento com efeito no fim do mês.
   -- Tabelas novas e vazias; as colunas novas são opcionais ou têm default.
   ```

   Se preferir escrever à mão, o resultado tem de ser equivalente ao diff.
4. O SQL só pode conter:
   - `CREATE TYPE` para `InvoiceStatus`, `InvoiceOrigin`, `InvoiceItemKind` e
     `InvoicePaymentMethod`;
   - `ALTER TYPE … ADD VALUE` para os tipos de `BillingEvent`, se for enum;
   - `ALTER TABLE "<tabela do CompanyContract>" ADD COLUMN` com os cinco
     campos (`endsAt DATE`, `cancelRequestedAt TIMESTAMP(3)`,
     `cancelRequestedById TEXT`, `cancelReason TEXT`,
     `deactivateCompanyOnEnd BOOLEAN NOT NULL DEFAULT false`);
   - `CREATE TABLE "billing_invoices"` (com `"number" SERIAL NOT NULL`) e
     `CREATE TABLE "billing_invoice_items"`;
   - os índices `billing_invoices_number_key`,
     `billing_invoices_companyId_competence_key`,
     `billing_invoices_status_dueDate_idx` e
     `billing_invoice_items_invoiceId_idx`;
   - as duas chaves estrangeiras (`companyId` → `companies`, `RESTRICT`;
     `invoiceId` → `billing_invoices`, `CASCADE`).

   Qualquer `DROP`, `ALTER COLUMN`, `RENAME` ou mudança em outra tabela:
   **PARE** (o schema local divergiu).
5. Valide num banco limpo:

   ```bash
   DATABASE_URL=$LOCAL/addere_check_016 DATABASE_URL_DIRECT=$LOCAL/addere_check_016 \
     npx prisma migrate deploy --schema prisma/schema.prisma
   DATABASE_URL=$LOCAL/addere_check_016 DATABASE_URL_DIRECT=$LOCAL/addere_check_016 \
     npx prisma migrate diff --from-url $LOCAL/addere_check_016 \
       --to-schema-datamodel prisma/schema.prisma --exit-code
   ```

   Esperado: `All migrations have been successfully applied` e depois
   `No difference detected.` com exit 0.
6. Apague os dois bancos de trabalho (`DROP DATABASE addere_check_016;` e
   `addere_shadow_016`).
7. Commit só com a pasta da migration:
   `feat(db): migration das faturas (billing_invoices)`.

## Plano de testes

Arquivos novos em `apps/api/src/modules/billing/__tests__/`:

| Arquivo | O que prova |
|---|---|
| `competence.test.ts` | 22h do último dia do mês (outubro e dezembro); `dueDay` 1 e 10 com virada de ano; mesma data que `computeBillingCalendar` |
| `invoice-rules.test.ts` | carência 0 e N; mês do aceite não cobrado; aceite às 23h30 do dia 31; mês do cancelamento cobrado e o seguinte não; DRAFT/PENDING nunca; somas Decimal exatas (`0.10 + 0.20`, total `2139.80`); `invoiceDisplayStatus` |
| `billing-mailer.test.ts` | sem chave não reserva; P2002 na reserva não envia; `error` do Resend libera a reserva; `idempotencyKey`; escape de HTML; destinatários |
| `invoices-generate.test.ts` | forma da consulta e a competência certa às 22h; idempotência por consulta e por P2002; mudança no dia 15 cobrada no mês seguinte; termos de 30/09 22h contam para outubro; checagem dupla (cancelado, carência, status); `dueDay`; erro isolado por contrato |
| `contract-cancel.test.ts` | `endsAt` no fuso certo; 409s; encerramento à 0h de São Paulo; Inteligência desligada; desativação na mesma transação; desfazer |
| `billing-scheduler.test.ts` | `shouldStartBillingScheduler`; não inicia em teste; nunca lança; transitório não vai ao Sentry; ordem dos passos |
| `reminders.test.ts` | janela do lembrete em São Paulo; `dedupeKey`; documento após 72 h; empresa sem ADMIN |
| `invoices-routes.test.ts` | 403 por perfil; filtros; PAID imutável; cancelada; recálculo preservando o manual; baixa; total negativo; item automático; avulsa; DTO do ADMIN; `jobs/run` |

Mais `apps/api/src/lib/__tests__/env.test.ts` (padrão `false`) e
`apps/web/src/lib/__tests__/billing-format.test.ts`.

Padrões a espelhar: `intelligence/jobs/__tests__/scheduler.test.ts` (relógio em
UTC, mock de `captureError`, `resetPrismaMock`) e
`companies/__tests__/companies-scope.test.ts` (`buildApp`, tokens por perfil).

**Mutação de controle**, antes de entregar: troque, só localmente, o `lte` da
consulta do gerador por `lt`, e depois a regra de `isCompetenceBillable` para
aceitar `PENDING_ACCEPTANCE`. Os testes têm de cair nas duas. Desfaça e
confirme que voltaram a passar. Registre no relatório quantos testes caíram em
cada mutação.

**Depois do merge, no staging** (operador, não o executor): com o 013 e o 014
no ar e um contrato de teste aceito, ligar a env no staging de propósito,
disparar "Rodar faturamento", conferir a fatura e os valores, dar baixa,
agendar e desfazer um cancelamento. Corresponde ao passo 10 da verificação de
ponta a ponta do plano aprovado, sem a parte de suspensão (017).

## Critérios de conclusão

- [ ] `npm run db:generate`, `npm run type-check` e `npm run lint` saem com 0
- [ ] `npm test` passa na raiz, com todos os arquivos de teste da tabela acima
- [ ] `npm run build:api` e `npm run build:web` saem com 0
- [ ] As duas mutações de controle derrubaram testes e foram desfeitas
- [ ] O comando "Conferir a env" mostra `env.ts` com `.default('false')`, os
      dois `.env.example` com `false` e o `render.yaml` com `value: 'false'`
      nos dois serviços; nenhum `true` nesses arquivos
- [ ] Migration no último commit, só com as instruções do passo 14, aplicada
      com `migrate deploy` num banco local limpo e com `migrate diff
      --exit-code` vazio
- [ ] Nenhum comando Prisma rodou contra URL que não fosse `localhost`; nenhum
      `.env` criado ou alterado
- [ ] `git diff --stat origin/staging..HEAD -- apps/mobile apps/api/src/middleware apps/api/src/modules/intelligence apps/api/src/modules/sync apps/api/src/modules/companies apps/api/src/modules/users` vazio
- [ ] `grep -n "Plano 017" apps/api/src/modules/billing/invoices.service.ts`
      mostra o gancho da baixa
- [ ] `grep -rn "formatDate(" apps/web/src/components/billing` vazio
- [ ] `grep -rnE "#[0-9a-fA-F]{6}" apps/web/src/components/billing apps/web/src/app/\(admin\)/gestao/faturas` vazio
- [ ] Linha de status do 016 atualizada em `plans/README.md`

## Condições de PARADA

- O 013 ou o 014 não estão na branch base (passo 0).
- A função de termos da competência do 013 não existe, ou erra o caso de 22h
  de São Paulo (termos de 30/09 às 22h têm de valer para outubro), ou o
  calendário do 013 põe o aceite das 23h30 do dia 31 no mês seguinte.
- O `dedupeKey` do `BillingEvent` não é único no schema do 013.
- Qualquer teste ou leitura mostra o gerador cobrando uma competência anterior
  à `firstBilledCompetence`, ou um contrato que não esteja ACTIVE nem
  cancelado com efeito dentro do mês.
- Parecer necessário uma tabela de trava (no estilo `IntelJobRun`), SQL cru
  fora do `migration.sql` ou isolamento `SERIALIZABLE`.
- `BILLING_JOBS_ENABLED` com `true` em `env.ts`, nos `.env.example` ou no
  `render.yaml`, ou o impulso de ligar a env no staging ou em produção. O
  executor nunca mexe no painel do Render.
- A migration gerada tem qualquer coisa além do listado no passo 14.
- Algum comando Prisma que conecta iria usar uma URL que não é `localhost`.
- O aceite do 014 consegue reativar um contrato CANCELLED (por exemplo, aceita
  documento sem conferir o status do contrato) e cancelar os documentos SENT
  no agendamento não basta para impedir. Reporte; não mexa no fluxo do 014.
- Parecer necessário mudar `authenticate.ts`, criar campo de bloqueio ou
  qualquer coisa do 017.

## Notas de manutenção

- **Ligar a env é um passo de operação, não de código.** Ordem: API com a
  migration no ar → `BILLING_JOBS_ENABLED=true` no painel do serviço → o mesmo
  valor no `render.yaml` → conferir o log de boot. No staging, só de propósito.
  Em produção, só depois do primeiro contrato aceito. Staging e produção têm
  bancos Neon separados, então ligar no staging não fatura ninguém de verdade.
- **Não ligue a env na sua máquina.** O `.env` local aponta para um banco real.
- **Fatura que nasce vencida** (env ligada tarde, servidor fora do ar no dia 1)
  vai ao Sentry. O plano não prorroga vencimento; o 017 tem a liberação manual
  até uma data, e é por ela que o superadmin evita uma suspensão injusta.
- **Fatura cancelada não volta.** Para cobrar a competência de novo, não há
  caminho além de um ajuste na fatura seguinte. Por isso o cancelamento pede
  motivo e confirmação.
- **Interação com o 017:**
  - a baixa tem o comentário `// Plano 017:` no ponto do desbloqueio;
  - os passos 3 e 4 do agendador entram depois de `STEPS`, na mesma lista;
  - o aviso de suspensão segue o padrão de `dedupeKey`
    (`invoice:<id>:<etapa>`) e usa `sendBillingEmailOnce`;
  - a "vencida" é `invoiceDisplayStatus`: o 017 deve usar a mesma função, e não
    uma segunda regra;
  - com a decisão 3, a opção "Desativar empresa também" passa a cortar o
    acesso quando o 017 entrar. Antes dele, desativar só para o sync e a
    Inteligência.
- **Interação com o 018:** "a receber" e "vencido" saem de `status` + `dueDate`
  (índice `[status, dueDate]`); "recebido no mês" sai de `paidAt` e
  `paidAmount`. O total da fatura é sempre a soma dos itens.
- **Interação com o 015:** os dois planos mexem em `schema.prisma`, em
  `packages/types/src/billing.ts` e, possivelmente, em `/plano`. Quem mergear
  por último resolve o conflito e roda de novo a validação do passo 14 sobre o
  resultado combinado.
- **Gateway, no futuro:** cabe em campos novos da `Invoice` (identificador
  externo, link de pagamento) e numa baixa automática que chame a mesma função
  da baixa manual. Nada aqui precisa ser refeito.
- **Possível melhoria, fora deste plano:** e-mail de confirmação do
  cancelamento agendado ao ADMIN e ao `billingEmail`, e a data de término no
  cartão do plano em `/plano`.
- **Retenção:** fatura é registro fiscal. Nunca apague `Invoice` nem
  `InvoiceItem` de fatura PAID; o encerramento do contrato não apaga nada.
- **Quem revisar deve olhar, nesta ordem:** (1) a consulta do gerador e
  `isCompetenceBillable` lado a lado; (2) toda conversão de data passando por
  São Paulo, e nenhuma data de calendário viajando como timestamp; (3) a
  imutabilidade de PAID em todas as rotas; (4) a env em `false` nos cinco
  lugares; (5) a reserva e a liberação do `dedupeKey` no envio.
