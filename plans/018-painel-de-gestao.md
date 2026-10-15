# Plano 018: Painel administrativo da Gestão Addere

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 80fe328..HEAD -- packages/types/src/billing.ts packages/db/prisma/schema.prisma apps/api/src/modules/billing/ apps/api/src/middleware/authenticate.ts apps/web/src/lib/home-redirect.ts apps/web/src/lib/__tests__/home-redirect.test.ts apps/web/src/app/\(admin\)/layout.tsx apps/web/src/app/\(admin\)/gestao/ apps/web/src/hooks/ apps/web/src/components/ui/KpiCard.tsx apps/web/src/components/ui/StatCard.tsx apps/web/src/lib/brand-tokens.ts apps/web/src/app/\(admin\)/piloto/page.tsx`
>
> Este plano roda **depois** do 013 ao 017, então a checagem **vai** mostrar
> mudança em `billing.ts`, `schema.prisma`, `modules/billing/`, `authenticate.ts`,
> `home-redirect.ts`, `layout.tsx`, `gestao/` e `hooks/`. Isso é esperado. O que
> importa é de onde veio cada mudança: rode também
> `git log --oneline 80fe328..HEAD -- <os mesmos arquivos>`. Commit que não seja
> dos planos 013 a 017 → compare o trecho com "Estado atual"; se não bater, trate
> como condição de PARADA. Em `KpiCard.tsx`, `StatCard.tsx`, `brand-tokens.ts` e
> `piloto/page.tsx` o esperado é diff **vazio**; se mudaram, confira as linhas
> citadas abaixo antes de copiar o padrão.

## Status

- **Prioridade**: P2
- **Esforço**: M
- **Risco**: LOW — só leitura. O que pode dar errado é número errado na tela, não
  dado alterado. A única mudança de comportamento fora do painel é a home do
  SUPERADMIN e a situação mostrada na lista de Clientes.
- **Depende de**: 016 e 017 — e também do **015**, que cria o `LicenseRequest`
  (as solicitações pendentes do painel). O 015 não está na cadeia do 016/017 (os
  dois dependem só do 014), então confirme no passo 1 que ele foi mergeado.
- **Categoria**: feature
- **Planejado em**: commit `80fe328` (`origin/staging`), 2026-10-15
- **Sem migration.** Não toca o app.

## Por que isso importa

Depois do 013 ao 017, o Addere tem cadastro de clientes, contrato com aceite,
limite de licenças, faturas e bloqueio. Os dados existem, mas ficam espalhados:
a situação está na lista de Clientes, o dinheiro na tela de Faturas, os pedidos
de licença em Solicitações e os contratos pendentes na ficha de cada cliente.
Para responder "quanto a Addere fatura por mês?", "quanto está atrasado?",
"quem vai estourar a licença?" ou "quem ainda não aceitou?", o superadmin
precisaria abrir quatro telas e somar à mão.

Este plano entrega uma tela que responde as quatro perguntas, e ela passa a ser
a home do SUPERADMIN (`/gestao`).

Ele também fecha uma ponta solta do 013: a função `deriveClientStatus` nasceu lá
com as entradas de fatura e de bloqueio opcionais, porque as faturas (016) e o
bloqueio (017) ainda não existiam. Aqui ela recebe os dados reais e passa a ser
a **única** fonte da situação do cliente, na lista e no painel. Duas
implementações divergiriam: a lista diria "em dia" e o painel contaria o mesmo
cliente como "vencido".

Por fim, dinheiro: um painel de cobrança que soma em ponto flutuante e mostra um
centavo a mais derruba a confiança no módulo inteiro. As somas ficam em
`Decimal` na API.

### Regras que este plano aplica

Todas são **decisão de produto de 15/10/2026** (tabela de regras e decisões
padrão do plano aprovado da Gestão de clientes). Elas definem o que cada número
do painel quer dizer.

| Regra | Efeito no painel |
|---|---|
| Pacotes 10, 20, 30 e Ilimitado. Todo contrato tem **quantidade de licenças e valor total do pacote**; no Ilimitado a quantidade é digitada no contrato. | O Ilimitado entra no MRR pelo `packagePrice` e no "perto do limite" pela quantidade digitada, igual aos outros. |
| Adicionais: licença avulsa com preço unitário negociado por empresa. | MRR = `packagePrice + extraSeats × extraSeatPrice`. |
| Quem consome licença: usuário **ativo** com papel `SALESPERSON` (vendedor ou gerente). ADMIN é grátis. | "Licenças usadas" conta só `SALESPERSON` ativo. |
| Antes do aceite **nada começa**: sem limite, sem cobrança. | Só contrato `ACTIVE` soma no MRR e na ocupação de licenças. |
| Ciclo mensal pós-pago. A fatura da competência M é gerada no início de M+1 e vence no dia cadastrado (1 a 10). | O gráfico mostra os 12 meses **fechados**: a competência do mês corrente ainda não foi faturada e entraria como zero. |
| Mudança que entra no mês M só é cobrada a partir de M+1. O limite muda na hora. | O MRR usa os termos **atuais**; a fatura usa os termos **da competência**. Um aditivo aceito no dia 15 muda o MRR hoje e a fatura só no mês seguinte. |
| Carência: o mês do aceite não é cobrado; depois correm os N meses de carência. | "Em carência" e "MRR faturável" usam a mesma regra: competência corrente < `firstBilledCompetence`. |
| Cobrança manual: a Addere cobra por fora e o superadmin dá a baixa. | "Recebido" é a baixa registrada, no mês da baixa. |
| Empresa em piloto fica sem contrato. | Piloto aparece como "sem contrato". |
| Decisão 1: empresa sem contrato aceito continua sem limite e sem cobrança. | Fora do MRR e da ocupação. |
| Decisão 3: empresa desativada (`active=false`) também é bloqueada. | Conta como "bloqueado", exceto com contrato cancelado, que aparece como "cancelado" (revisão de 15/10/2026). |
| Decisão 5: redução de pacote não desativa ninguém; mostra "acima do limite". | Quem passou de 100 % aparece no topo de "perto do limite". |
| Decisão 6: o mês do cancelamento é cobrado. | A última fatura do cancelado aparece em "a receber", mas o contrato `CANCELLED` sai do MRR. |
| Decisão 8: quem opera o módulo é o SUPERADMIN. | Rota e tela só para SUPERADMIN. |

## Estado atual

### O que existe no commit `80fe328` (conferido linha a linha)

- `apps/web/src/lib/home-redirect.ts:17-20` — a home por papel. Em `80fe328`
  ainda devolve `/dashboard`; o 013 troca para `/gestao/clientes`. Este plano
  troca para `/gestao`:

```ts
// Home por papel: SUPERADMIN cai nas Empresas; demais na Inteligência
export function resolveHome(user: PanelUser): string {
  return user.role === 'SUPERADMIN' ? '/dashboard' : '/inteligencia'
}
```

  Quem usa `resolveHome`: `apps/web/src/app/login/page.tsx:48` e
  `apps/web/src/app/page.tsx:18`. Mudar a função cobre os dois.
- `apps/web/src/lib/__tests__/home-redirect.test.ts:27-33` — o teste de
  `resolveHome`, que espera `/dashboard` em `80fe328` (o 013 o atualiza para
  `/gestao/clientes`).
- `apps/web/src/app/(admin)/layout.tsx:61-170` — `NAV_GROUPS`. Em `80fe328` não
  há grupo "Gestão Addere"; o 013 o cria com `requires: 'superadmin'`. O padrão de
  item com casamento **exato**, que o "Painel" vai copiar, é a "Visão geral" em
  `:79-86`:

```ts
{
  href: '/inteligencia',
  label: 'Visão geral',
  // Exato: senão a Visão geral fica destacada em todas as subtelas
  match: (p) => p === '/inteligencia',
  icon: Sparkles,
  requires: { permission: ['intel.admin', 'intel.manager'], orAdmin: true },
},
```

- `apps/web/src/app/(admin)/piloto/page.tsx` — o único gráfico do painel:
  - `:6` importa `LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer` de `recharts`;
  - `:24` importa `BRAND` de `@/lib/brand-tokens`;
  - `:499-531` é o `ResponsiveContainer` com o `LineChart` (`:500-530`):
    ticks em `BRAND.muted` (`:503`, `:506`), `Tooltip` com `formatter` e
    `labelFormatter` (`:507-513`), `Legend` (`:514`), a série principal em
    `BRAND.primary` sólida (`:515-521`) e a segunda em `BRAND.accent` tracejada,
    `strokeDasharray="4 2"` (`:522-529`);
  - `:552-580` é a lista de feedbacks: `Card` sem padding, cabeçalho com
    `border-b` e `<ul className="divide-y ...">`. É o padrão das listas curtas.
  - `:216-275` é o `MetricCard`, com meta e semáforo. **Não** serve aqui: o
    painel não tem meta contra a qual julgar o número.
- `apps/web/src/components/ui/KpiCard.tsx:4-13` e `:26` —
  `KpiCard({ label, value, icon?, hint?, tone? })`, com
  `tone: 'neutral' | 'brand' | 'success' | 'warning' | 'danger'`. O comentário em
  `:23-25` diz exatamente o caso deste plano: número sem meta, com o contexto que
  o torna legível.
- `apps/web/src/components/ui/StatCard.tsx:3-12` e `:22` —
  `StatCard({ label, value, accent?, text? })`. Bom para a fileira de contagens.
- `apps/web/src/lib/brand-tokens.ts:1-3` — o **único** arquivo do web onde hex é
  permitido. `BRAND` em `:6-17` (`primary`, `accent`, `muted`…).
- `apps/web/src/app/(admin)/dashboard/page.tsx` — o padrão de estados:
  - carregando: `:117-137` troca os `StatCard` por `StatCardSkeleton`
    (`:181-188`) e `:141-142` mostra `TableSkeleton` (`:190-218`);
  - vazio: `:143-149` usa o `EmptyState` local (`:220-245`);
  - **não tem estado de erro.** O padrão de erro da casa está em
    `apps/web/src/app/(admin)/inteligencia/resultado/page.tsx:80-86`: `Card` com
    `border-danger/30 bg-danger/5` e `getApiErrorMessage(error, '…')`.

  Atenção: o 013 transforma `/dashboard` em redirect. Se os componentes de
  esqueleto e de vazio tiverem saído desse arquivo, eles foram para a lista de
  Clientes (`gestao/clientes/page.tsx`). Copie de onde estiverem.
- `apps/web/src/lib/intel-helpers.ts:55-61` — `brl(value: string | number | null)`,
  com o comentário "Valores monetários (strings Decimal da API)". Formata com
  `toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })` e devolve
  `—` para vazio. `:110-118` — `todayInSaoPaulo()`.
  `apps/web/src/lib/utils.ts:8-13` tem um `formatCurrency` equivalente, sem o
  tratamento de vazio. Use `brl`.
- `apps/web/src/components/SuperAdminOnly.tsx:12-29` — o gate das telas de
  superadmin; quem não é SUPERADMIN vai para `/inteligencia` (`:17`).
  `apps/web/src/app/(admin)/dashboard/layout.tsx:1-6` é o layout que o 013
  copiou para `gestao/layout.tsx`.
- `apps/web/vitest.config.ts:6` — o web só roda `src/**/*.test.ts`. Página
  `.tsx` não tem teste de render: a lógica da tela vai para um helper em `lib/`.
- `apps/api/src/middleware/authenticate.ts:26-36` — `requireSuperAdmin`
  (`authenticate` + 403 para quem não é SUPERADMIN). O 017 muda `:16-22` para
  trazer `company { active, accessBlockedAt, accessBlockReason }`; SUPERADMIN
  nunca é bloqueado.
- `apps/api/src/app.ts:89-103` — onde os módulos de rota são registrados. O 013
  registra ali o módulo `billing`.
- `apps/api/src/modules/intelligence/engine/business-days.ts`:
  - `:11-13` `ymdSaoPaulo(date)` → `'YYYYMMDD'` do instante em São Paulo;
  - `:42-46` `diffDays(a, b)`; `:49-55` `addDaysYmd(ymd, days)`;
  - `:84-88` `ymdToDate(ymd)` → meia-noite UTC (a convenção de `@db.Date`);
  - `:98-101` `daysOverdueOn(dueDate, todayYmd)`;
  - `:104-106` `dateToYmdUtc(date)` → `'YYYYMMDD'` de uma coluna `@db.Date`.
- `apps/api/src/modules/orders/orders.service.ts:126-141` — `getOrderStats`:
  consultas em `Promise.all` e a soma `Decimal` convertida em string na
  fronteira (`totalRevenue: revenueResult._sum.total?.toString() ?? '0'`).
  `apps/api/src/modules/intelligence/manager/losses.service.ts:134-136` faz o
  mesmo com `.toFixed(2)`.
- `apps/api/src/lib/error-handler.ts:3` e `apps/api/src/modules/pilot/pilot.routes.ts:3`
  — `import { Prisma } from '@prisma/client'` em tempo de execução. É dali que
  sai `Prisma.Decimal`.
- `apps/api/src/test-utils/prisma-mock.ts:20-27` — os retornos padrão do mock:
  `findMany`/`groupBy` → `[]`, `count` → `0`, **`aggregate` → `{}`** (sem
  `_sum`). `:54-55` expõe `$transaction` e `$queryRaw` como `vi.fn`.
- `apps/api/src/modules/companies/__tests__/companies-scope.test.ts:7-58` — o
  molde de teste de rota: `vi.mock('@addere/db', …)`, `buildApp()`, tokens
  assinados com `app.jwt.sign` e `prismaMock.user.findUnique` respondendo
  `{ active: true }` (depois do 017, o mock precisa da forma que o 017 usou nos
  testes dele — busque `COMPANY_BLOCKED` em `__tests__`).
- `packages/db/prisma/schema.prisma:18-22` — `enum Role` (`SUPERADMIN`, `ADMIN`,
  `SALESPERSON`). `:276` — `creditLimit Decimal? @db.Decimal(14, 2)`, o padrão de
  dinheiro que o 013 e o 016 seguiram. `:440-456` — `Pilot`, sem ligação com
  contrato.
- `packages/types/package.json` — **sem script de teste**. Função pura de
  `packages/types` é testada a partir de `apps/api` (o Vitest da API resolve
  `@addere/types`).
- `packages/types/src/billing.ts` **não existe** em `80fe328`; nasce no 013.

### O que o 013 ao 017 entregam (confira no passo 1)

Segundo o plano aprovado de 15/10/2026. Os nomes abaixo são os do desenho; o
código mergeado é que manda.

| Plano | O que este plano usa |
|---|---|
| 013 | `CompanyContract` 1:1 com `Company` (`status` DRAFT/PENDING_ACCEPTANCE/ACTIVE/CANCELLED, `startDate`, `graceMonths`, `firstBilledCompetence` `@db.Date`, `dueDay`); `ContractTerms` só de inclusão (`status` PROPOSED/EFFECTIVE/WITHDRAWN, `effectiveFrom`, `includedSeats`, `extraSeats`, `packagePrice`, `extraSeatPrice`, `Decimal(14,2)`); `packages/types/src/billing.ts` com a resolução dos termos atuais ("o EFFECTIVE com o maior `effectiveFrom <= agora`"), `computeBillingCalendar` e `deriveClientStatus` com entradas opcionais de fatura e bloqueio; rotas `/admin/billing/*`; grupo "Gestão Addere" em `NAV_GROUPS`; `gestao/layout.tsx` com `<SuperAdminOnly>`; lista de Clientes com a situação; home do SUPERADMIN em `/gestao/clientes`. |
| 014 | `ContractDocument` (`kind` CONTRACT/AMENDMENT, `status` SENT/ACCEPTED/CANCELLED, `sentAt`). |
| 015 | `LicenseRequest` (quantidade, status, data do pedido) e o filtro de quem consome licença usado pelo `withSeat`. |
| 016 | `Invoice` (`number`, `competence` e `dueDate` `@db.Date`, `status` OPEN/PAID/CANCELLED, total, `paidAt`, valor da baixa); `@@unique([companyId, competence])`. |
| 017 | `Company.accessBlockedAt`, `accessBlockReason`, `blockExemptUntil`; o predicado que o `authenticate` usa para devolver 403 `COMPANY_BLOCKED`. |

## Esboço de tela

### A — Painel com contratos ativos (`/gestao`)

```
Painel de gestão                                                       Atualizado às 14:32
Contratos, licenças e cobrança de todos os clientes · valores em R$

┌ MRR CONTRATADO ─────┐ ┌ MRR FATURÁVEL ──────┐ ┌ RECEBIDO NO MÊS ────┐ ┌ A RECEBER ──────────┐
│ R$ 12.167,50        │ │ R$ 11.167,50        │ │ R$ 7.200,00         │ │ R$ 9.300,00         │
│ 3 contratos ativos  │ │ 1 em carência, fora │ │ 4 baixas em outubro │ │ 6 faturas em aberto │
│                     │ │ da soma             │ │                     │ │                     │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘ └─────────────────────┘
┌ VENCIDO ────────────┐ ┌ VENCE EM 15 DIAS ───┐ ┌ LICENÇAS ───────────┐ ┌ AGUARDANDO ACEITE ──┐
│ R$ 1.740,00         │ │ R$ 6.100,00         │ │ 126 / 137           │ │ 2                   │
│ 1 fatura            │ │ 7 faturas           │ │ 91 % ocupadas       │ │ 1 contrato ·        │
│                     │ │                     │ │                     │ │ 1 aditivo           │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘ └─────────────────────┘

Clientes por situação
┌ SEM CONTRATO ┐┌ AGUARD. ACEITE ┐┌ EM CARÊNCIA ┐┌ EM DIA ┐┌ VENCIDO ┐┌ BLOQUEADO ┐┌ CANCELADO ┐
│ 4            ││ 1              ││ 1           ││ 1      ││ 1       ││ 0         ││ 1         │
└──────────────┘└────────────────┘└─────────────┘└────────┘└─────────┘└───────────┘└───────────┘

┌ Receita — últimos 12 meses fechados ──────────────────────────────────────────────────────┐
│ R$ 15 mil ┤                                                          ●─────●              │
│ R$ 10 mil ┤                                              ●─────●────╱                     │
│  R$ 5 mil ┤                                  ●─────●────╱      ○ ─ ─ ○ ─ ─ ○              │
│      R$ 0 ┼──●─────●─────●─────●─────●─────╱──○ ─ ─ ○                                     │
│            out/25 nov/25 dez/25  …                                    ago/26 set/26       │
│            ── Faturado (competência)     ─ ─ Recebido (mês da baixa)                      │
│ ▸ Ver os valores em tabela                                                                │
└───────────────────────────────────────────────────────────────────────────────────────────┘

┌ Vencidas (1) ────────────────────────────────┐ ┌ Próximos vencimentos (7) ──────────────────┐
│ Mercado Sol Ltda                 R$ 1.740,00 │ │ Distribuidora Norte            R$ 9.427,50 │
│ nº 12 · venceu 05/10 · 10 dias             › │ │ nº 15 · vence 20/10 · em 5 dias          › │
│                                              │ │ Casa do Campo Ltda             R$ 1.000,00 │
│                                              │ │ nº 16 · vence 25/10 · em 10 dias         › │
│                                              │ │ …                     Ver todas as faturas │
└──────────────────────────────────────────────┘ └────────────────────────────────────────────┘
┌ Aguardando aceite (2) ───┐ ┌ Solicitações pendentes (2) ┐ ┌ Perto do limite (3) ──────────┐
│ Empório Vale Claro       │ │ Mercado Sol Ltda           │ │ Mercado Sol Ltda              │
│ Contrato · há 4 dias   › │ │ +2 licenças · há 1 dia   › │ │ 13 / 12 · acima do limite   › │
│ Mercado Sol Ltda         │ │ Atacado Ponte Alta         │ │ Distribuidora Norte           │
│ Aditivo · há 1 dia     › │ │ +5 licenças · há 3 dias  › │ │ 95 / 105 · 90 %             › │
└──────────────────────────┘ └────────────────────────────┘ └───────────────────────────────┘
```

- Os nomes de empresa do esboço são fictícios e os números são ilustrativos. Os
  que fecham entre si são os dos testes do passo 4.
- Grades: `grid-cols-2 lg:grid-cols-4` nos KPIs; `grid-cols-2 sm:grid-cols-4
  lg:grid-cols-7` na situação; listas em `lg:grid-cols-2` e `lg:grid-cols-3`.
  No celular tudo empilha (o plano 008 tirou a rolagem lateral do painel; não a
  traga de volta).
- Ícones Lucide, todos presentes no `lucide-react@0.400` do web:
  `Wallet` (MRR contratado), `Receipt` (MRR faturável), `HandCoins` (recebido),
  `Inbox` (a receber), `TriangleAlert` (vencido), `CalendarClock` (vence em 15
  dias), `Gauge` (licenças), `FileSignature` (aguardando aceite),
  `LayoutDashboard` (item "Painel" da sidebar).
- "Vencido" usa `tone="danger"` só quando o valor é maior que zero. O tom vem com
  rótulo e ícone, nunca sozinho.
- Cada item de lista é um `Link` para a ficha do cliente
  (`/gestao/clientes/{companyId}`). "Ver todas" leva a `/gestao/faturas` (016),
  `/gestao/solicitacoes` (015) ou `/gestao/clientes` (013), sem parâmetro de
  filtro. Se a ficha do 013 já abrir uma aba por `?tab=`, use-a; **não** acrescente
  esse suporte neste plano.

### B — Nenhum contrato ativo (o estado de hoje: todas as empresas são de teste)

```
Painel de gestão                                                       Atualizado às 14:32
Contratos, licenças e cobrança de todos os clientes · valores em R$

┌ Nenhum contrato ativo ainda ───────────────────────────────────────────────────────────────┐
│ O MRR, as faturas e as licenças aparecem aqui quando o primeiro cliente aceitar o          │
│ contrato. Enquanto isso, as empresas ficam sem limite e sem cobrança.                      │
│                                                                       [ Ir para Clientes ] │
└────────────────────────────────────────────────────────────────────────────────────────────┘

Clientes por situação
┌ SEM CONTRATO ┐┌ AGUARD. ACEITE ┐┌ EM CARÊNCIA ┐┌ EM DIA ┐┌ VENCIDO ┐┌ BLOQUEADO ┐┌ CANCELADO ┐
│ 6            ││ 0              ││ 0           ││ 0      ││ 0       ││ 0         ││ 0         │
└──────────────┘└────────────────┘└─────────────┘└────────┘└─────────┘└───────────┘└───────────┘

┌ Aguardando aceite (0) ───┐ ┌ Solicitações pendentes (0) ┐
│ Nenhum documento enviado │ │ Nenhum pedido de licença   │
└──────────────────────────┘ └────────────────────────────┘
```

- Mostrado quando `mrr.activeContracts === 0` **e** não há fatura nenhuma (nem
  aberta, nem no gráfico). Os KPIs de dinheiro e o gráfico somem; a situação e as
  listas de "aguardando aceite" e "solicitações" continuam, porque fazem sentido
  antes do primeiro aceite.
- Com contratos ativos mas sem fatura nos 12 meses (o primeiro mês depois do
  aceite), os KPIs aparecem e o gráfico vira o aviso "Nenhuma fatura emitida nos
  últimos 12 meses" — uma linha reta em zero pareceria queda.
- Cada lista vazia tem frase própria ("Nenhuma fatura vencida", "Nenhum
  vencimento nos próximos 15 dias", "Ninguém perto do limite").

### C — Carregando e erro

- **Carregando**: 8 esqueletos de `KpiCard`, 7 de `StatCard` e um bloco do
  tamanho do gráfico, no padrão de `StatCardSkeleton`
  (`dashboard/page.tsx:181-188`), com `animate-skeleton-pulse`.
- **Erro**: o `Card` de erro de `inteligencia/resultado/page.tsx:80-86`, com
  `getApiErrorMessage(error, 'Não foi possível carregar o painel de gestão.')`.

## Quem acessa

| Perfil | Efeito |
|---|---|
| SUPERADMIN | Vê o item "Painel" no topo do grupo Gestão Addere e cai em `/gestao` ao entrar. `GET /admin/billing/dashboard` → 200. Nunca é bloqueado (017). |
| ADMIN | Não vê o item. URL direta: `<SuperAdminOnly>` (o `gestao/layout.tsx` do 013) manda para `/inteligencia`. A API responde 403. |
| Vendedor / gerente | Igual ao ADMIN: sem item, redirecionado, 403 na API. |

## Comandos que você vai precisar

| Para quê | Comando | Esperado quando dá certo |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Gerar o client (precisa para `Prisma.Decimal` nos testes) | `npm run db:generate` | exit 0 (não precisa de banco) |
| Checar tipos | `npm run type-check` | exit 0, sem erros |
| Lint | `npm run lint` | exit 0 |
| Testes do billing | `npm test -w @addere/api -- billing` | todos passam |
| Testes da API | `npm test --workspace=apps/api` | todos passam |
| Testes do web | `npm test --workspace=apps/web` | todos passam |
| Tudo | `npm test` | api, web e mobile passam |
| Build da API | `npm run build:api` | exit 0 |
| Build do web | `npm run build:web` | exit 0 — exige `apps/web/.env.local` copiado de `apps/web/.env.local.example` (o arquivo é ignorado pelo git) |
| Sem SQL cru | `grep -rn -e queryRaw -e executeRaw apps/api/src/modules/billing` | nenhuma linha |
| Uma função de situação | `grep -rn -e "function deriveClientStatus" -e "const deriveClientStatus" apps packages --include=*.ts` | uma linha, em `packages/types/src/billing.ts` |
| Sem hex fora dos tokens | `grep -rnE "#[0-9a-fA-F]{6}" apps/web/src/app/\(admin\)/gestao apps/web/src/lib/billing-dashboard.ts` | nenhuma linha |

## Escopo

**Dentro do escopo:**

- `packages/types/src/billing.ts` — completar `deriveClientStatus` e acrescentar
  os tipos do painel (`BillingDashboardDto` e companhia) e as constantes do
  passo 4.
- `apps/api/src/modules/billing/dashboard.ts` (novo) — agregação pura:
  recebe as linhas do banco e devolve o DTO.
- `apps/api/src/modules/billing/dashboard.service.ts` (novo) — as cinco
  consultas e a chamada da agregação.
- O arquivo de rotas `/admin/billing/*` do 013 (pelo padrão da casa,
  `apps/api/src/modules/billing/billing.routes.ts`) — a rota nova.
- O serviço da lista de Clientes do 013 (busque `deriveClientStatus(` em
  `apps/api/src/modules/billing/`) — passar os dados reais de fatura e bloqueio.
- Testes novos em `apps/api/src/modules/billing/__tests__/`:
  `client-status.test.ts` (ou o arquivo onde o 013 já testa `deriveClientStatus`
  — estenda em vez de duplicar), `dashboard.test.ts` e `dashboard-routes.test.ts`.
- `apps/web/src/lib/billing-dashboard.ts` (novo) e
  `apps/web/src/lib/__tests__/billing-dashboard.test.ts` (novo).
- O hook de billing do web que o 013 criou (provavelmente
  `apps/web/src/hooks/useBilling.ts`) — `useBillingDashboard`. Se não existir,
  crie esse arquivo.
- `apps/web/src/app/(admin)/gestao/page.tsx` — a tela. Se o 013 deixou ali um
  redirect para `/gestao/clientes`, substitua-o.
- `apps/web/src/app/(admin)/gestao/RevenueChart.tsx` (novo) — o gráfico e a
  tabela que o acompanha.
- `apps/web/src/app/(admin)/layout.tsx` — o item "Painel".
- `apps/web/src/lib/home-redirect.ts` e
  `apps/web/src/lib/__tests__/home-redirect.test.ts`.
- `docs/billing/README.md` — uma seção curta com a definição dos indicadores
  (passo 9), se o arquivo existir.
- `plans/README.md` — só a linha de status do 018.

**Fora do escopo (NÃO toque):**

- `packages/db/prisma/**` — este plano **não tem migration**. Parecer precisar de
  uma é condição de PARADA.
- `apps/mobile/**` — o painel é só web.
- O agendador e os jobs de billing, a geração de faturas, o `seat-guard`, o
  `authenticate.ts` e as rotas `/billing/me/*` — o painel lê o que eles gravam;
  não muda nenhum deles.
- `apps/web/src/components/ui/KpiCard.tsx`, `StatCard.tsx` e
  `apps/web/src/lib/brand-tokens.ts` — use como estão. Cor nova de gráfico é
  decisão de marca (ver "Notas de manutenção").
- `apps/web/src/app/(admin)/piloto/page.tsx` — só referência.
- O redirect de `/dashboard` e a ficha do cliente (013).
- Métricas de uso do produto (pedidos, visitas, sync), custo de IA por empresa
  (pendência da segunda etapa; o `IntelLlmCall` já guarda os tokens por empresa)
  e exportação CSV.

## Fluxo de git

- Comece da `staging` atualizada, **depois** de o 013 ao 017 estarem mergeados:
  `git fetch origin && git switch -c advisor/018-painel-de-gestao origin/staging`.
- Branch: `advisor/018-painel-de-gestao`.
- Um commit por passo com código (passos 2 a 9; o passo 1 só lê). Estilo da casa,
  em português: `feat(billing): …`, `feat(web): …`, `test(billing): …`,
  `docs(billing): …`.
- **Este plano não tem migration.** A regra da casa de "migration commitada por
  último, em commit separado" não se aplica; se algum passo parecer precisar de
  uma, é PARADA.
- NÃO faça push nem abra PR a menos que quem despachou tenha mandado. Quando
  houver PR, ele vai direto para `staging` (lição do incidente do #171 no
  `plans/README.md`).
- NÃO rode `eas build` nem `eas update`. O plano não toca o app, então não há o
  que publicar nele.
- NÃO conecte em banco nenhum e não copie `.env` para o worktree. Nada aqui
  precisa de banco: os testes usam o Prisma mockado.

## Passos

### Passo 1: Conferir o que o 013 ao 017 entregaram (sem commit)

Antes de escrever código, leia e anote os nomes reais. Este plano usa os nomes
do desenho aprovado; onde o código tiver outro nome, **use o do código** e não
crie um paralelo.

1. `packages/db/prisma/schema.prisma`: os modelos `CompanyContract`,
   `ContractTerms`, `ContractDocument`, `LicenseRequest` e `Invoice`, e os campos
   de bloqueio em `Company`. Anote:
   - o nome da relação `Company → CompanyContract` (aqui: `contract`) e
     `CompanyContract → ContractTerms` (aqui: `terms`);
   - como o `ContractDocument` chega à empresa (`companyId` direto ou pelo
     contrato);
   - o valor de status do pedido pendente em `LicenseRequest` (aqui: `PENDING`) e
     o nome do campo de quantidade (aqui: `quantity`);
   - em `Invoice`: o campo do total (aqui: `total`), o do valor da baixa (aqui:
     `paidAmount`) e **o tipo de `paidAt`** — `@db.Date` ou `DateTime`. Isso decide
     a função que dá o mês do recebimento no passo 4.
2. `packages/types/src/billing.ts`: a assinatura atual de `deriveClientStatus`, o
   tipo da situação (aqui: `ClientStatus`, com `NO_CONTRACT`,
   `AWAITING_ACCEPTANCE`, `IN_GRACE`, `CURRENT`, `OVERDUE`, `BLOCKED`, `CANCELLED`), a
   lista ordenada e os rótulos em português se existirem, a função que resolve os
   termos atuais (aqui: `resolveCurrentTerms`) e o formato de data que o módulo
   usa (`'YYYYMMDD'`, `'YYYY-MM-DD'` ou `Date`).
3. O predicado de bloqueio do 017 (o que o `authenticate` usa para responder
   `COMPANY_BLOCKED`). Se ele foi exportado (ex.: `isCompanyBlocked`), o painel o
   reaproveita.
4. O filtro de quem consome licença do 015. Se virou constante exportada,
   reaproveite; senão o filtro é `{ role: 'SALESPERSON', active: true }`.
5. Se o 016 criou uma função que calcula o valor mensal dos termos
   (`packagePrice + extraSeats × extraSeatPrice`) em `Decimal`, anote o nome: o
   MRR usa a mesma.
6. O arquivo de rotas `/admin/billing/*`, o serviço da lista de Clientes, o hook
   de billing do web (e as chaves de query dele) e o `gestao/layout.tsx`.

**Verificar**:

- `grep -rn -e "function deriveClientStatus" -e "const deriveClientStatus" apps packages --include=*.ts` → uma
  linha, em `packages/types/src/billing.ts`;
- `grep -n "model LicenseRequest\|model Invoice\|model ContractDocument\|accessBlockedAt" packages/db/prisma/schema.prisma`
  → os quatro aparecem;
- `grep -n "SUPERADMIN" apps/web/src/lib/home-redirect.ts` → devolve
  `/gestao/clientes`.

Se faltar qualquer um desses (015, 016 ou 017 não mergeado), PARE.

### Passo 2: A situação do cliente com os dados reais

Arquivo: `packages/types/src/billing.ts`. Teste:
`apps/api/src/modules/billing/__tests__/client-status.test.ts` (ou o arquivo de
teste de `deriveClientStatus` que o 013 criou).

O formato exato da entrada é o do 013. O que este passo exige:

1. **Os campos de fatura e de bloqueio deixam de ser opcionais.** Assim o
   compilador aponta toda chamada que ainda não passa os dados reais. A entrada
   precisa carregar:
   - o motivo do bloqueio — **o mesmo** do `authenticate` do 017: o
     `accessBlockReason` que sai de `resolveCompanyAccess` (`OVERDUE`, `MANUAL`,
     `INACTIVE` ou `null`). A tela não pode dizer "em dia" para quem não
     consegue entrar;
   - as datas de vencimento das faturas `OPEN` da empresa;
   - o dia de hoje em São Paulo;
   - o contrato (ou `null`) com `status` e `firstBilledCompetence`.
2. **A comparação "vencido" fica dentro do módulo puro.** Exporte
   `isInvoiceOverdue(dueDate, today)`: vencida é a fatura `OPEN` com vencimento
   **anterior** a hoje, comparando dias civis. Vence hoje não é vencida. A API
   passa `today = ymdSaoPaulo(now)` e o vencimento por `dateToYmdUtc(dueDate)`
   (as duas de `business-days.ts`), no formato de data do módulo.
3. **Carência e "já faturável" são duas perguntas.** A situação `IN_GRACE` é a
   do 013 e não muda: só com `graceMonths > 0` e antes da
   `firstBilledCompetence`. No mês do aceite com carência 0 a situação é
   `CURRENT`, porque não há nada vencido nem carência contratada (revisão de
   15/10/2026, que alinhou o 013 e este plano). O MRR faturável do passo 4 é
   outra pergunta: exporte `isBillableNow(contract, today)`, verdadeira para
   contrato `ACTIVE` cuja `firstBilledCompetence` já chegou (mês corrente em
   São Paulo ≥ mês da `firstBilledCompetence`). Ela exclui o mês do aceite e a
   carência. Contrato `ACTIVE` sem `firstBilledCompetence` não deveria existir
   (o aceite grava os dois juntos); se aparecer, conte como não faturável, que é
   o lado que não infla o MRR.
4. **Precedência.** É a mesma do 013 (as duas foram alinhadas na revisão de
   15/10/2026), e a função é uma só. O critério é "a situação diz o que o
   superadmin precisa fazer com o cliente":

| Ordem | Situação | Quando | Por que vence as de baixo |
|---|---|---|---|
| 1 | `BLOCKED` | motivo `OVERDUE` ou `MANUAL` | A equipe do cliente não trabalha, por decisão de cobrança. |
| 2 | `OVERDUE` | alguma fatura `OPEN` vencida | Dívida vencida aparece sempre, até de cliente cancelado ou em carência (fatura avulsa). |
| 3 | `CANCELLED` | contrato `CANCELLED` (mesmo com a empresa desativada) | Terminal. O cancelamento do 016 desativa a empresa por padrão; sem esta linha antes da 4, nenhum cliente encerrado apareceria como cancelado. |
| 4 | `BLOCKED` | motivo `INACTIVE` (empresa desativada sem contrato cancelado) | Ninguém da empresa entra. |
| 5 | `AWAITING_ACCEPTANCE` | contrato `PENDING_ACCEPTANCE` | — |
| 6 | `IN_GRACE` | `graceMonths > 0` e antes da `firstBilledCompetence` | — |
| 7 | `CURRENT` | contrato `ACTIVE` fora da carência | — |
| 8 | `NO_CONTRACT` | sem contrato, ou contrato `DRAFT` | `DRAFT` é "nada começou" (decisão 1). |

   Os estados 3 e 5 a 8 são mutuamente exclusivos pelo status do contrato; a
   precedência só decide quando bloqueio ou fatura vencida se somam a eles.
   A liberação manual do 017 (`blockExemptUntil`) não esconde a dívida: empresa
   liberada com fatura vencida é `OVERDUE`.

   Se o 013 tiver tratado alguma linha de forma **diferente** (não só com outro
   nome), PARE e reporte: a tabela aparece em duas telas e a divergência é decisão
   do Gustavo.

**Testes, em tabela** (`it.each`), um caso por linha:

| Caso | Esperado |
|---|---|
| sem contrato | `NO_CONTRACT` |
| contrato `DRAFT` | `NO_CONTRACT` |
| contrato `PENDING_ACCEPTANCE` | `AWAITING_ACCEPTANCE` |
| `ACTIVE`, `firstBilledCompetence` 11/2026 (aceite em 15/10/2026, carência 0), hoje 20/10/2026 | `CURRENT` (e `isBillableNow` = false: o mês do aceite não é cobrado) |
| `ACTIVE`, `firstBilledCompetence` 01/2027 (aceite em 15/10/2026, carência 2), hoje 31/12/2026 | `IN_GRACE` |
| o mesmo, hoje 01/01/2027 | `CURRENT` (a competência 01/2027 já é cobrada) |
| `ACTIVE` fora da carência, sem fatura aberta | `CURRENT` |
| `ACTIVE`, fatura que vence hoje | `CURRENT` |
| `ACTIVE`, fatura que venceu ontem | `OVERDUE` |
| `ACTIVE` em carência com fatura avulsa vencida | `OVERDUE` (vencido > carência) |
| `CANCELLED` sem fatura aberta | `CANCELLED` |
| `CANCELLED` com fatura vencida | `OVERDUE` (vencido > cancelado) |
| `ACTIVE` vencido e bloqueado | `BLOCKED` (bloqueado > vencido) |
| `CANCELLED` e motivo `MANUAL` | `BLOCKED` (bloqueado > cancelado) |
| `CANCELLED` e motivo `INACTIVE` | `CANCELLED` (a desativação é a do próprio cancelamento) |
| `ACTIVE` e motivo `INACTIVE` | `BLOCKED` (decisão 3) |
| contrato `PENDING_ACCEPTANCE` e motivo `MANUAL` | `BLOCKED` (bloqueado > aguardando aceite) |
| sem contrato e motivo `INACTIVE` | `BLOCKED` (decisão 3) |
| `ACTIVE` vencido, liberação manual vigente (`blockExemptUntil` no futuro, sem bloqueio ativo) | `OVERDUE` |

E um teste fora da tabela, para a virada do dia: fatura com vencimento
10/02/2027, `today` calculado por `ymdSaoPaulo(new Date('2027-02-11T02:59:00Z'))`
(23:59 de 10/02 em São Paulo) → `CURRENT`; com `'2027-02-11T03:00:00Z'` (00:00 de
11/02) → `OVERDUE`. É o caso do servidor em UTC que já virou o dia antes de São
Paulo.

**Verificar**: `npm test -w @addere/api -- billing` → passam, incluindo os novos;
`npm run type-check` → exit 0. Se o type-check acusar chamadas que não passam os
campos novos, elas são as da lista de Clientes: faça o passo 3 antes de commitar
e junte os dois num commit só. Nenhum commit fica com o type-check vermelho.

Commit: `feat(billing): situação do cliente com fatura vencida e bloqueio reais`.

### Passo 3: A lista de Clientes usa a mesma função, com os dados reais

Arquivo: o serviço da lista de Clientes do 013.

1. Se o 016 e o 017 já passam fatura e bloqueio para `deriveClientStatus`, este
   passo é só o teste do item 3.
2. Senão: busque as faturas `OPEN` de **todas** as empresas da página numa
   consulta só (`invoice.findMany({ where: { status: 'OPEN', companyId: { in: ids } }, select: { companyId: true, dueDate: true } })`),
   agrupe por empresa em memória e passe as datas. Os campos de bloqueio vêm na
   própria linha da empresa. Nada de consulta por empresa.
3. Teste de rota: lista com três empresas — uma com fatura vencida (`OVERDUE`),
   uma bloqueada (`BLOCKED`) e uma em dia (`CURRENT`) — e
   `expect(prismaMock.invoice.findMany).toHaveBeenCalledTimes(1)`.

**Verificar**: `npm test -w @addere/api -- billing` → passam.

Commit: `feat(billing): lista de clientes com a situação completa`.

### Passo 4: Os tipos do painel e a agregação pura

Arquivos: `packages/types/src/billing.ts` (tipos e constantes) e
`apps/api/src/modules/billing/dashboard.ts` (novo). Teste:
`apps/api/src/modules/billing/__tests__/dashboard.test.ts`.

#### Os tipos

Em `packages/types/src/billing.ts`:

```ts
// Painel da Gestão Addere (plano 018). Dinheiro chega como string com 2 casas e
// ponto decimal ("12167.50"): é a soma Decimal da API, sem passar por float.
export const DASHBOARD_LIST_LIMIT = 5
export const NEAR_SEAT_LIMIT_PCT = 90
export const UPCOMING_DUE_DAYS = 15

export interface MoneyTotal {
  count: number
  amount: string
}

export interface DashboardList<T> {
  total: number // tamanho real da lista; items traz no máximo DASHBOARD_LIST_LIMIT
  items: T[]
}

export interface DashboardInvoiceItem {
  invoiceId: string
  companyId: string
  companyName: string
  number: number // o tipo que o 016 deu a Invoice.number
  competence: string // 'YYYY-MM'
  dueDate: string // 'YYYY-MM-DD'
  total: string
  daysOverdue: number // 0 nas que ainda não venceram
}

export interface DashboardDocumentItem {
  documentId: string
  companyId: string
  companyName: string
  kind: 'CONTRACT' | 'AMENDMENT'
  sentAt: string // ISO
  daysWaiting: number // dias civis em São Paulo desde o envio
}

export interface DashboardLicenseRequestItem {
  requestId: string
  companyId: string
  companyName: string
  quantity: number
  createdAt: string // ISO
}

export interface DashboardSeatItem {
  companyId: string
  companyName: string
  used: number
  limit: number
}

export interface RevenueMonth {
  month: string // 'YYYY-MM'
  billed: string // faturado por competência
  received: string // recebido no mês da baixa
}

export interface BillingDashboardDto {
  generatedAt: string // ISO
  today: string // 'YYYY-MM-DD' em São Paulo
  mrr: { contracted: string; billable: string; activeContracts: number; graceContracts: number }
  clientsByStatus: Record<ClientStatus, number> // as sete chaves, sempre
  seats: { used: number; limit: number } // só contratos ACTIVE
  receivable: {
    open: MoneyTotal
    overdue: MoneyTotal
    dueNext15Days: MoneyTotal
    receivedThisMonth: MoneyTotal
  }
  overdueInvoices: DashboardList<DashboardInvoiceItem>
  upcomingInvoices: DashboardList<DashboardInvoiceItem>
  pendingAcceptance: DashboardList<DashboardDocumentItem>
  pendingLicenseRequests: DashboardList<DashboardLicenseRequestItem>
  nearSeatLimit: DashboardList<DashboardSeatItem>
  revenue12m: RevenueMonth[] // 12 meses fechados, do mais antigo ao mais recente
}
```

Se o 013 já tiver um tipo de dinheiro ou de lista, use o dele. Se ele não
exportou a ordem e os rótulos das situações, acrescente aqui
`CLIENT_STATUS_ORDER` (a ordem da linha "Clientes por situação" do esboço) e
`CLIENT_STATUS_LABELS` ("Sem contrato", "Aguardando aceite", "Em carência", "Em
dia", "Vencido", "Bloqueado", "Cancelado"), e faça a lista de Clientes usar os
mesmos. Exporte tudo pelo `index.ts` do pacote, do jeito que o 013 exportou
`billing.ts`.

#### Moeda: por que `Decimal` na API e string na fronteira

- **Somar em `Decimal`.** As colunas de dinheiro são `Decimal(14, 2)`
  (`schema.prisma:276` é o padrão; o 013 e o 016 seguiram). Somar em `number`
  acumula erro binário (`0.1 + 0.2 = 0.30000000000000004`), e num painel de
  cobrança um centavo errado faz o superadmin desconfiar de todos os outros
  números. `Prisma.Decimal` (`import { Prisma } from '@prisma/client'`, como em
  `error-handler.ts:3`) soma exato: use `.plus()` e `.times()`, comece de
  `new Prisma.Decimal(0)` e **nunca** passe por `Number()` dentro da API.
- **String na fronteira.** JSON não tem tipo decimal, e `number` traria o float de
  volta. A casa já faz assim (`orders.service.ts:139`, `losses.service.ts:134-136`)
  e o web já tem `brl()`, que aceita a string (`intel-helpers.ts:55-61`). Formato:
  `.toFixed(2)` → `"12167.50"`, ponto decimal, sem separador de milhar.
- **No web**, `brl(valor)` para todo texto; `Number(valor)` só no mapeamento para o
  gráfico, porque o recharts precisa de número. É só exibição: nada é somado de
  novo no web.

#### Definição dos indicadores

`today` = `ymdSaoPaulo(now)`. "Mês corrente" = os seis primeiros dígitos de
`today`. Termos atuais = a função do 013 (passo 1, item 2). Valor mensal dos
termos = `packagePrice + extraSeats × extraSeatPrice` (a função do 016 se
existir; senão `termsMonthlyValue(terms)` em `dashboard.ts`).

| Indicador | Definição |
|---|---|
| MRR contratado | Soma do valor mensal dos **termos atuais** de todo contrato `ACTIVE`. Termos `PROPOSED` e termos `EFFECTIVE` com `effectiveFrom` no futuro não contam. |
| MRR faturável | O mesmo, só dos contratos com `isBillableNow` (exclui o mês do aceite e a carência). |
| `activeContracts` / `graceContracts` | Quantos `ACTIVE`; quantos deles em carência. |
| Clientes por situação | `deriveClientStatus` para **toda** empresa, contado por situação. As sete chaves sempre presentes, com zero quando for o caso. |
| Ocupação de licenças | Só contratos `ACTIVE`: `used` = soma dos consumidores de licença; `limit` = soma de `includedSeats + extraSeats` dos termos atuais. |
| Perto do limite | Contrato `ACTIVE` com `used × 100 ≥ limit × NEAR_SEAT_LIMIT_PCT` (conta inteira, sem float). O Ilimitado entra pela quantidade digitada. Ordem: maior ocupação primeiro, comparando por produto cruzado (`usedA × limitB` contra `usedB × limitA`); acima do limite fica no topo (decisão 5). Empate: pelo nome. |
| A receber | Faturas `OPEN`: quantidade e soma do total. |
| Vencido | Faturas `OPEN` com `isInvoiceOverdue`. Lista do vencimento mais antigo para o mais novo, com `daysOverdue = daysOverdueOn(dueDate, today)`. |
| Vence em 15 dias | Faturas `OPEN` com `0 ≤ diffDays(today, vencimento) ≤ UPCOMING_DUE_DAYS` (inclui hoje). Lista do mais próximo para o mais distante. |
| Recebido no mês | Faturas `PAID` cuja baixa caiu no mês corrente de São Paulo: soma do valor da baixa. Mês da baixa: `ymdSaoPaulo(paidAt)` se `paidAt` for `DateTime`; `dateToYmdUtc(paidAt)` se for `@db.Date`. Errar isso joga a baixa das 22h do dia 31 no mês seguinte. |
| Aguardando aceite | `ContractDocument` `SENT` (contrato **e** aditivo). Lista do envio mais antigo primeiro, com `daysWaiting = diffDays(ymdSaoPaulo(sentAt), today)`. É diferente da situação `AWAITING_ACCEPTANCE`, que só conta o primeiro contrato: cliente ativo com aditivo pendente continua "em dia". |
| Solicitações pendentes | `LicenseRequest` pendente, do mais antigo para o mais novo. |
| Receita 12 meses | Os 12 meses **fechados** antes do mês corrente (hoje em out/2026 → de out/2025 a set/2026). `billed` = soma do total das faturas não canceladas com aquela competência; `received` = soma do valor da baixa das `PAID` com a baixa naquele mês. Mês sem nada → `"0.00"`. |

Faturas `CANCELLED` não entram em nenhum indicador.

#### A agregação

`buildBillingDashboard(source, now): BillingDashboardDto`, pura (sem Prisma, sem
relógio: `now` vem de fora). `source` traz as linhas das cinco consultas do
passo 5 e um `Map<companyId, number>` de licenças usadas. Os nomes de empresa das
listas saem do mapa das empresas, não de `include` em cada consulta.

Helper puro exportado e testado junto: `lastClosedMonths(today, 12)` → os 12
`'YYYY-MM'` antes do mês corrente.

**Testes** (fixtures com `new Prisma.Decimal('…')`; rode `npm run db:generate`
antes):

- **MRR com Ilimitado e adicionais.** Empresa A, Pacote 10 Padrão, `ACTIVE` fora
  da carência: `packagePrice` 1500.00, `extraSeats` 2 × 120.00 → 1740.00. Empresa B,
  Ilimitado com Inteligência, `includedSeats` 100: 9000.00 + 5 × 85.50 → 9427.50.
  Empresa C, `ACTIVE` em carência: 1000.00. Empresa D, `PENDING_ACCEPTANCE` com
  termos `PROPOSED` de 3000.00. Empresa E, `CANCELLED`. Esperado:
  `contracted: '12167.50'`, `billable: '11167.50'`, `activeContracts: 3`,
  `graceContracts: 1`.
- **Aditivo que ainda não vale.** A tem também um termo `EFFECTIVE` de 2500.00 com
  `effectiveFrom` no mês que vem → o MRR continua `'12167.50'`.
- **Licenças.** A: limite 12, usadas 13; B: limite 105, usadas 95; C: limite 20,
  usadas 18; D (pendente) com 30 vendedores → `seats: { used: 126, limit: 137 }`;
  `nearSeatLimit.items` na ordem A (108 %), B (90,5 %), C (90 %); D fora. Com B
  em 94 usadas (89,5 %), B sai da lista; C em 18/20 (exatos 90 %) fica.
- **Vencido na virada do dia em São Paulo.** Fatura `OPEN` com vencimento
  10/02/2027. Com `now = 2027-02-11T02:59:00Z` → `overdue.count 0` e a fatura em
  `upcomingInvoices` com `daysOverdue 0`; com `now = 2027-02-11T03:00:00Z` →
  `overdue.count 1`, `daysOverdue 1`, e a situação da empresa vira `OVERDUE`.
- **Recebido no mês.** Se `paidAt` for `DateTime`: baixa em
  `2027-03-01T01:00:00Z` (22h de 28/02 em São Paulo) conta em fevereiro, não em
  março — no KPI e no gráfico.
- **12 meses.** `today` 05/01/2027 → meses de `2026-01` a `2026-12`; fatura com
  competência no mês corrente fica fora; meses vazios saem `'0.00'`; fatura
  `CANCELLED` fora de tudo.
- **Situação.** `clientsByStatus` tem as sete chaves e soma o número de empresas.
- **Listas.** Com 7 faturas vencidas, `overdueInvoices.total` é 7 e `items` tem 5,
  as mais antigas.

**Verificar**: `npm test -w @addere/api -- billing` → passam;
`grep -n "Number(" apps/api/src/modules/billing/dashboard.ts` → nenhuma soma de
dinheiro (contagem de licenças pode usar `number`).

Commit: `feat(billing): agregação do painel de gestão`.

### Passo 5: A rota `GET /admin/billing/dashboard`

Arquivos: `apps/api/src/modules/billing/dashboard.service.ts` (novo) e o arquivo
de rotas `/admin/billing/*` do 013. Teste:
`apps/api/src/modules/billing/__tests__/dashboard-routes.test.ts`.

1. `getBillingDashboard(now = new Date())` faz **cinco** consultas em
   `Promise.all`, como `getOrderStats` (`orders.service.ts:128-133`), e chama
   `buildBillingDashboard`:

   | # | Consulta | O que traz |
   |---|---|---|
   | 1 | `company.findMany` | todas as empresas: `id`, `name`, `active`, campos de bloqueio do 017 e, aninhado, o contrato (`status`, `firstBilledCompetence`) com os termos `EFFECTIVE` (`effectiveFrom`, `includedSeats`, `extraSeats`, `packagePrice`, `extraSeatPrice`). Os termos atuais são escolhidos em memória pela função do 013, nunca por `orderBy` + `take` na consulta: a regra de "termos atuais" mora num lugar só. |
   | 2 | `invoice.findMany` | `status ≠ CANCELLED` e (`status = OPEN` **ou** competência ≥ 1º dia da janela de 12 meses **ou** `paidAt` ≥ 1º dia da janela menos 1 dia). A folga de um dia cobre o fuso; o recorte fino é em memória, pelo mês de São Paulo. |
   | 3 | `contractDocument.findMany` | `status = SENT`: `id`, `kind`, `sentAt` e a empresa. |
   | 4 | `licenseRequest.findMany` | pendentes: `id`, empresa, quantidade, data. |
   | 5 | `user.groupBy` | `by: ['companyId']`, filtro de quem consome licença, `_count: { _all: true }`. |

   Por que em memória: o Prisma não agrupa por mês de um `DateTime` sem SQL cru, e
   o volume é pequeno (uma fatura por empresa por mês). Os `select` aninhados da
   consulta 1 viram uma leitura por relação, em lote (`IN`), não uma por empresa —
   não é N+1. Sem `$transaction`: um painel não precisa de foto consistente entre
   as cinco tabelas; uma baixa no meio da requisição aparece no próximo
   carregamento.
2. A rota: `GET /dashboard` no prefixo `/admin/billing` do 013, com
   `preHandler: requireSuperAdmin`, sem parâmetros, devolvendo o DTO. Sem
   `$queryRaw`.

**Testes** (molde: `companies-scope.test.ts:7-58`, com o mock de usuário na forma
que o 017 deixou):

- SUPERADMIN → 200 e o corpo com as chaves do DTO; com os fixtures do passo 4
  (empresas A a E pelo mock), `mrr.contracted` é `'12167.50'` — prova que a
  consulta aninhada chega inteira à agregação.
- ADMIN → 403; vendedor → 403; sem token → 401.
- **Sem N+1.** Rode a rota com 1 empresa e depois com 3: nas duas,
  `company.findMany`, `invoice.findMany`, `contractDocument.findMany`,
  `licenseRequest.findMany` e `user.groupBy` são chamados **uma** vez cada; e
  `companyContract.findUnique`, `companyContract.findFirst`,
  `contractTerms.findMany`, `invoice.findFirst`, `invoice.aggregate` e `user.count`
  **não** são chamados.
- **Sem SQL cru.** `expect(prismaMock.$queryRaw).not.toHaveBeenCalled()`.
- Banco vazio (os padrões do mock) → 200, tudo zerado, sete chaves de situação com
  0, 12 meses com `'0.00'`. Lembre que `aggregate` no mock devolve `{}`: se você
  usou `aggregate`, o teste quebra — mais um motivo para não usar.

**Verificar**: `npm test -w @addere/api -- billing` → passam;
`grep -rn -e queryRaw -e executeRaw apps/api/src/modules/billing` → nada.

Commit: `feat(billing): rota do painel de gestão`.

### Passo 6: Dados do painel no web

Arquivos: `apps/web/src/lib/billing-dashboard.ts` (novo), o hook de billing do
013 e `apps/web/src/lib/__tests__/billing-dashboard.test.ts` (novo).

1. Helpers puros em `lib/billing-dashboard.ts`:
   - `monthLabel('2026-10')` → `'out/26'` (meses em minúsculas: jan, fev, mar,
     abr, mai, jun, jul, ago, set, out, nov, dez);
   - `monthLongLabel('2026-10')` → `'outubro de 2026'` (tooltip e tabela);
   - `brlCompact(12500)` → `'R$ 12,5 mil'`, com
     `new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })`
     (eixo Y);
   - `revenueChartData(revenue12m)` → `{ month, label, billed: number, received: number }[]`;
   - `hasRevenue(revenue12m)` → `true` se algum mês tem valor diferente de zero;
   - `seatsPct({ used, limit })` → inteiro arredondado para baixo, `null` se
     `limit === 0`;
   - `isEmptyDashboard(dto)` → `mrr.activeContracts === 0`, sem fatura aberta e sem
     receita nos 12 meses (o estado B do esboço).
2. Hook `useBillingDashboard()`: `api.get<BillingDashboardDto>('/admin/billing/dashboard')`,
   `enabled: isSuperAdmin` (como `useCompanies`, `hooks/useCompanies.ts:14-23`).
   Ponha a chave de query **debaixo da raiz de chaves de billing do 013** (ex.:
   `billingKeys.dashboard`), para que as mutações que já invalidam a raiz (baixa,
   aprovação de pedido, envio de contrato) atualizem o painel sem código novo. Sem
   `refetchInterval`.

**Testes**: um por helper, incluindo virada de ano em `monthLabel`
(`'2027-01'` → `'jan/27'`), `seatsPct` com limite 0 e acima de 100 %, e
`isEmptyDashboard` nos dois estados. O `Intl` põe espaço inseparável depois do
`R$`: compare com `.replace(/\u00a0/g, ' ')`.

**Verificar**: `npm test --workspace=apps/web` → passam; `npm run type-check` →
exit 0.

Commit: `feat(web): dados do painel de gestão`.

### Passo 7: A tela `/gestao` e o gráfico

Arquivos: `apps/web/src/app/(admin)/gestao/page.tsx` e
`apps/web/src/app/(admin)/gestao/RevenueChart.tsx` (novo).

1. **Página** (`'use client'`), seguindo o esboço A, B e C:
   - cabeçalho com `h1` "Painel de gestão" e "Atualizado às HH:MM" a partir de
     `generatedAt`;
   - oito `KpiCard` com `icon`, `hint` e `tone` (o `danger` só em "Vencido" maior
     que zero). Licenças: `value` = `'126 / 137'`, `hint` = `'91 % ocupadas'` (`seatsPct` arredonda para baixo);
     sem contrato ativo, `'—'`;
   - sete `StatCard` de situação, na ordem da lista de situações do 013 e com os
     rótulos dele;
   - `<RevenueChart data={dto.revenue12m} />`, ou o aviso "Nenhuma fatura emitida
     nos últimos 12 meses" quando `!hasRevenue`;
   - as cinco listas curtas no padrão de `piloto/page.tsx:552-580` (`Card` com
     `p-0 overflow-hidden`, cabeçalho com `border-b`, `<ul className="divide-y
     divide-[var(--border)]">`). Título com a contagem total (`Vencidas (7)`), no
     máximo `DASHBOARD_LIST_LIMIT` itens, cada um um `Link` para a ficha, e "Ver
     todas" quando `total > items.length`;
   - estados: carregando, erro e vazio como na seção C do esboço.
   Dinheiro na tela por `brl()`. Datas `@db.Date` (vencimento, competência) por
   `formatBillingDate` e `formatCompetence` do 013 — nunca `formatDate` de
   `lib/utils.ts:15-21`, que mostra o dia anterior no Brasil. Espaçamento em múltiplos de 4 px (`gap-4`,
   `space-y-6`), raio dos componentes existentes, nenhum hex.
2. **Gráfico** (`RevenueChart.tsx`), seguindo `piloto/page.tsx:499-531`:
   - `ResponsiveContainer` de 100 % × 240 com `LineChart` sobre
     `revenueChartData(data)`;
   - `XAxis dataKey="label"` e `YAxis` com `tickFormatter={brlCompact}` e
     `width={72}` (o rótulo em reais é mais largo que o do piloto; a margem
     esquerda negativa do piloto, `left: -20`, cortaria o texto — use `left: 0`).
     Ticks em `BRAND.muted`, como `:503` e `:506`;
   - "Faturado (competência)": `BRAND.primary`, sólida, `strokeWidth={2}`;
     "Recebido (mês da baixa)": `BRAND.accent`, `strokeWidth={2}`,
     `strokeDasharray="4 2"`. O tracejado é a segunda codificação: a série não
     depende só da cor. Pontos com `dot={{ r: 4 }}` — são 12 meses discretos;
   - `Tooltip` com `brl` no valor e `monthLongLabel` no rótulo; `Legend` com os
     dois nomes;
   - um eixo só (as duas séries são reais na mesma escala), sem grade;
   - abaixo do gráfico, `<details>` "Ver os valores em tabela" com o `Table` de
     `components/ui/Table.tsx` (Mês, Faturado, Recebido). É a alternativa
     acessível ao gráfico e a compensação do contraste baixo do ciano (ver "Notas
     de manutenção"). O `Table` já contém a rolagem lateral (plano 008).

**Verificar**: `npm run type-check && npm run lint` → exit 0;
`npm run build:web` → exit 0; o grep de hex da tabela de comandos → nada.

Commit: `feat(web): painel da Gestão Addere`.

### Passo 8: O "Painel" abre a Gestão Addere

Arquivos: `apps/web/src/app/(admin)/layout.tsx`,
`apps/web/src/lib/home-redirect.ts` e
`apps/web/src/lib/__tests__/home-redirect.test.ts`.

1. No grupo "Gestão Addere" de `NAV_GROUPS`, **antes** de "Clientes":

```ts
{
  href: '/gestao',
  label: 'Painel',
  // Exato: senão o Painel fica destacado em Clientes, Faturas e nas outras subtelas
  match: (p) => p === '/gestao',
  icon: LayoutDashboard,
  requires: 'superadmin',
},
```

   e `LayoutDashboard` no import de `lucide-react`.
2. `resolveHome`: SUPERADMIN → `'/gestao'`. Atualize o comentário acima da função.
3. O teste de `resolveHome` passa a esperar `'/gestao'`, com o título
   `'SUPERADMIN cai no Painel da Gestão; demais na Inteligência'`. Os outros casos
   do arquivo não mudam.
4. `grep -rn "'/gestao/clientes'" apps/web/src --include=*.ts --include=*.tsx`:
   onde aparecer como **home** do superadmin (e não como link para a lista), troque
   por `resolveHome`.

**Verificar**: `npm test --workspace=apps/web` → passam;
`grep -n "SUPERADMIN" apps/web/src/lib/home-redirect.ts` → `'/gestao'`.

Commit: `feat(web): Painel como home do superadmin`.

### Passo 9: Registro

1. Se `docs/billing/README.md` existir, acrescente a seção "Painel — definição dos
   indicadores" com a tabela do passo 4 resumida e a tabela de precedência do
   passo 2. Se não existir, não crie: reporte.
2. Atualize a linha do 018 em `plans/README.md`.
3. Rode a verificação final: `npm run lint`, `npm run type-check`, `npm test`,
   `npm run build:api`, `npm run build:web`.

Commit: `docs(billing): painel de gestão — indicadores e status do plano 018`.

## Plano de testes

**Novos na API** (`apps/api/src/modules/billing/__tests__/`):

- `deriveClientStatus` em tabela: as linhas do passo 2, cobrindo cada situação
  e as precedências bloqueado (atraso ou manual) > vencido > cancelado >
  bloqueado (desativada) > aguardando aceite > carência > em dia, mais a virada
  do dia em São Paulo e `isBillableNow`;
- a lista de Clientes com situação real e uma consulta de faturas só (passo 3);
- a agregação pura (passo 4): MRR com Ilimitado e adicionais, aditivo que ainda
  não vale, ocupação e "perto do limite" com a fronteira de 90 %, vencido na
  virada do dia, recebido no mês com a baixa das 22h, os 12 meses na virada do
  ano, listas cortadas em 5 com o total certo;
- a rota com o Prisma mockado (passo 5): 200/403/401, as cinco consultas uma vez
  cada com 1 e com 3 empresas, nada de consulta por empresa, nada de `$queryRaw`,
  banco vazio.

**Novos no web**: `lib/__tests__/billing-dashboard.test.ts` (helpers do passo 6) e
o caso atualizado de `home-redirect.test.ts`.

**Padrões a espelhar**: `companies-scope.test.ts` para rota com tokens por papel;
`nav-gating.test.ts` e `home-redirect.test.ts` para helper puro do web.

**Fora do automático, para quem revisar no staging**: abrir `/gestao` como
SUPERADMIN em 1280 px e em 390 px, nos temas claro e escuro, com e sem contrato
ativo, e conferir que nenhum rótulo do eixo Y é cortado.

## Critérios de conclusão

- [ ] `npm run lint` e `npm run type-check` saem com 0
- [ ] `npm test` passa (API, web e mobile), incluindo os testes novos
- [ ] `npm run build:api` e `npm run build:web` saem com 0
- [ ] `grep -rn -e "function deriveClientStatus" -e "const deriveClientStatus" apps packages --include=*.ts` → uma linha, em `packages/types/src/billing.ts`
- [ ] A lista de Clientes e o painel chamam a mesma `deriveClientStatus`
- [ ] `grep -rn -e queryRaw -e executeRaw apps/api/src/modules/billing` → vazio
- [ ] O teste de rota prova cinco consultas, uma de cada, com 1 e com 3 empresas
- [ ] Nenhuma soma de dinheiro passa por `Number()` na API
- [ ] `git diff --stat origin/staging -- packages/db/` vazio (sem migration)
- [ ] `git diff --stat origin/staging -- apps/mobile/` vazio
- [ ] `git diff --stat origin/staging -- apps/web/src/components/ui/ apps/web/src/lib/brand-tokens.ts` vazio
- [ ] O grep de hex em `gestao/` e `lib/billing-dashboard.ts` → vazio
- [ ] `resolveHome` devolve `/gestao` para SUPERADMIN, com teste
- [ ] "Painel" é o primeiro item do grupo Gestão Addere e só ele acende em `/gestao`
- [ ] Linha de status atualizada em `plans/README.md`

## Condições de PARADA

- Precisar de SQL cru (`$queryRaw`, `$executeRaw`) para qualquer parte da
  agregação.
- A agregação passar de cinco chamadas ao Prisma, ou o número de chamadas crescer
  com o número de empresas (N+1).
- Precisar de migration ou de qualquer mudança em `schema.prisma`.
- O 015, o 016 ou o 017 não estar mergeado, ou faltar algum modelo ou campo do
  passo 1 (`LicenseRequest`, `Invoice` com total e valor da baixa,
  `ContractDocument`, campos de bloqueio).
- Existir mais de uma função de situação do cliente, ou a do 013 discordar da
  tabela de precedência do passo 2 em alguma linha (diferença de sentido, não de
  nome).
- A checagem de deriva acusar commit de fora dos planos 013 a 017 nos arquivos do
  escopo, com "Estado atual" que não bate.
- O gráfico parecer precisar de cor nova ou de mudar `KpiCard`, `StatCard` ou
  `brand-tokens.ts`: é decisão de marca, não deste plano.
- Parecer necessário conectar em um banco para concluir qualquer passo.

## Notas de manutenção

- **MRR e fatura não batem no mês da mudança, e isso está certo.** O MRR usa os
  termos atuais; a fatura usa os termos da competência. Um aditivo aceito no dia
  15 muda o MRR na hora e a fatura só na competência seguinte (decisão de produto
  de 15/10/2026). Quem comparar os dois vai ver a diferença por um mês.
- **MRR é o contratado, não o uso.** A cobrança é do pacote e dos adicionais
  contratados; licença sobrando não reduz o MRR.
- **Contrato cancelado sai do MRR, mas a última fatura fica.** O mês do
  cancelamento é cobrado (decisão 6); a fatura dele aparece em "a receber" quando
  for gerada.
- **A tabela de precedência mora numa função só.** Lista de Clientes e painel
  leem a mesma `deriveClientStatus`. Mudar a ordem muda as duas telas, e o teste
  em tabela é o contrato. A ordem é decisão deste plano, não regra de produto:
  se o Gustavo pedir outra, muda a tabela e os testes, nada mais.
- **"Em carência" inclui o mês do aceite**, mesmo com carência 0, porque ele não é
  cobrado. Se isso confundir na lista, o caminho é mostrar a 1ª competência
  cobrada ao lado da situação, não criar uma oitava situação.
- **Volume.** A agregação lê todas as empresas e as faturas de 12 meses e soma em
  memória. Com dezenas de clientes é trivial. Se passar de algumas centenas de
  empresas, reveja a consulta 2: o faturado por competência pode ir para
  `invoice.groupBy({ by: ['competence'] })`; o recebido por mês continua em
  memória, porque o Prisma não agrupa por mês de `DateTime` sem SQL cru.
- **Fuso.** Nenhum `-3` fixo no código: tudo passa por `ymdSaoPaulo` e
  `dateToYmdUtc`. Mantenha assim.
- **Cores do gráfico no tema escuro.** As duas cores vêm de `BRAND` (regra da
  marca, e o mesmo que o gráfico do piloto faz). O validador de paleta da skill
  `dataviz` deu, em 15/10/2026: no claro, separação boa entre as duas e contraste
  baixo do ciano sobre o branco (2,1:1); no escuro (`--bg-surface` `#161b27`), o
  azul `#1B4FA8` fica com 2,2:1 e as duas saem da faixa de luminosidade
  recomendada. A compensação deste plano é a tabela sob o gráfico, a legenda e o
  tracejado. Uma paleta de gráfico própria para o tema escuro, em
  `brand-tokens.ts`, resolveria este gráfico e o do piloto juntos — decisão de
  marca, fora deste plano.
- **Pendências que tocam este painel** (segunda etapa, sem plano): custo de IA por
  empresa e cobrança por uso de IA (o `IntelLlmCall` já tem os tokens por
  empresa); exportação CSV; com um gateway de pagamento, "recebido" passa a vir
  dele, e o painel continua lendo a baixa.
- **Quem revisar deve olhar, nesta ordem:** (1) nenhuma soma de dinheiro em
  `number` na API; (2) as cinco consultas, sem nada por empresa; (3) a virada do
  dia em São Paulo no vencido e na baixa; (4) a tabela de precedência igual na
  lista e no painel; (5) o mês de `paidAt` pela função certa para o tipo da coluna.
