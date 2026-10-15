# Plano 017: Inadimplência: aviso de suspensão, bloqueio e liberação

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 80fe328..HEAD -- apps/api/src/middleware/ apps/api/src/app.ts apps/api/src/modules/auth/ apps/api/src/modules/companies/companies.service.ts apps/api/src/modules/intelligence/jobs/scheduler.ts apps/api/src/modules/intelligence/engine/business-days.ts packages/types/src/index.ts apps/web/src/lib/api.ts apps/web/src/contexts/AuthContext.tsx 'apps/web/src/app/(admin)/layout.tsx' 'apps/web/src/app/(admin)/empresas/[id]/page.tsx' apps/mobile/src/lib/api.ts apps/mobile/src/store/auth.store.ts apps/mobile/src/store/syncStore.ts apps/mobile/src/services/syncEngine.ts apps/mobile/app/_layout.tsx`
>
> Este plano roda **depois** do 013 ao 016, então parte da diferença é
> esperada e não é deriva: `app.ts` (registro do módulo `billing`,
> `trustProxy`), `companies.service.ts` (cadastro e trava de licenças),
> `packages/types/src/index.ts`, `(admin)/layout.tsx` (grupo Gestão Addere,
> itens Contrato e Plano e cobrança) e `web/src/lib/api.ts`
> (`getApiErrorCode`). Nesses arquivos, confira só que os trechos citados em
> "Estado atual" continuam lá, com o mesmo comportamento. Qualquer mudança em
> `authenticate.ts`, `require-company.ts`, `auth.routes.ts` (`/auth/me`), no
> `scheduler.ts` da Inteligência ou nos arquivos de `apps/mobile` é deriva de
> verdade: compare com "Estado atual" e, se não bater, trate como condição de
> PARADA.

## Status

- **Prioridade**: P1
- **Esforço**: L
- **Risco**: HIGH — mexe no `authenticate`, que roda em toda requisição
  autenticada; um erro tranca cliente pagante para fora do app e do painel
- **Depende de**: 016 (que pressupõe 013 e 014). As telas `/plano` (015/016) e
  `/contrato` (014) precisam existir — ver "O que o 013 ao 016 deixam pronto"
- **Categoria**: feature
- **Planejado em**: commit `80fe328` (`origin/staging`), 2026-10-15
- **Toca o app**: **sim, só JavaScript** — sai por OTA, sem build. Antes de ligar
  o bloqueio em produção, leia "Ordem de liberação" em "Notas de manutenção".
- **Migration**: sim (`company_access_block`), commitada por último.

## Por que isso importa

O Contrato de Licença de Uso (plano 014, cláusula de preço e pagamento) promete
ao cliente duas coisas sobre atraso, e a tabela "Promessas do contrato ×
sistema" do contrato diz que é este plano que cumpre as duas:

| O contrato promete | Quem cumpre |
|---|---|
| Aviso de suspensão com a data, ≥ 10 dias corridos antes | Código, plano 017: só bloqueia com o aviso gravado há ≥ 10 dias |
| Suspensão não apaga dados | Código, plano 017: o bloqueio é por rota |

Hoje não existe bloqueio nenhum. O único "desligar" é o `active` da empresa, e
ele não corta acesso: `toggleCompanyActive` só para o sync do Protheus. Os
usuários da empresa desativada continuam entrando no app e no painel.

Sem este plano, a Addere teria duas saídas ruins quando um cliente atrasa:
desativar a empresa à mão (que não bloqueia nada) ou bloquear sem o aviso de 10
dias (que quebra o contrato revisado por advogado). O sistema precisa
**garantir** o prazo, não depender de alguém lembrar dele.

Há também custo: a Inteligência roda jobs noturnos com IA para toda empresa
ligada, pague ou não.

### Regras de negócio que este plano cumpre

Todas são **decisão de produto de 15/10/2026**.

- **Atraso.** Lembretes ao ADMIN e ao contato de cobrança. A suspensão (app e
  painel bloqueados até a baixa) só acontece depois de um **aviso de suspensão
  com a data prevista, enviado com no mínimo 10 dias corridos de antecedência**.
  A regra vem do modelo revisado, e o sistema garante o prazo. Os dias de
  atraso para suspender têm um padrão global e exceção por empresa. A suspensão
  não apaga dados. O superadmin pode liberar manualmente até uma data.
- **Cobrança manual.** A Addere cobra por fora e o superadmin dá a baixa. A baixa
  desbloqueia na hora.
- **Fuso.** Todos os clientes estão no Brasil: datas em America/Sao_Paulo, pelos
  helpers de `business-days.ts`. O servidor roda em UTC.
- **Decisão 2.** ADMIN de empresa bloqueada ainda entra no painel, mas só vê
  Contrato e Plano e cobrança. Vendedores e gerentes veem a tela "Acesso
  suspenso". O login e o refresh não são bloqueados; o bloqueio é por rota
  (403 `COMPANY_BLOCKED`), senão o app desloga em loop.
- **Decisão 3.** Empresa desativada (`active=false`) também passa a ser
  bloqueada. As empresas atuais são de teste, não há impacto real, e não há
  script de pré-checagem.
- **Decisão 4.** O bloqueio automático nasce desligado (`autoBlockEnabled=false`).
  Só é ligado depois que a versão nova do app (OTA) estiver no ar; o app antigo
  marcaria pedidos da fila como falhos.
- **Decisão 7.** A Inteligência pausa os jobs noturnos para empresa bloqueada, o
  que economiza custo de IA. Retoma com catch-up ao desbloquear.
- **Decisão 8.** Quem opera é o papel SUPERADMIN atual. O histórico registra quem
  fez cada ação.

### Decisões de desenho deste plano

1. **O aviso só conta se foi entregue.** O evento do aviso é gravado **depois**
   de o Resend aceitar o envio. Falhou o envio, ou não há destinatário: nada é
   gravado, e sem aviso gravado não há bloqueio. Por isso o aviso **não** usa o
   `sendBillingEmailOnce` do 016, que grava a reserva antes de enviar: se o
   processo caísse entre a reserva e o envio, ficaria um aviso gravado sem
   e-mail, e 10 dias depois a empresa seria bloqueada sem ter sido avisada. No
   caminho deste plano, o pior caso (cair entre o envio e a gravação) é o
   cliente receber o aviso de novo no tick seguinte. O erro possível vai sempre
   para o lado do cliente, nunca para "bloqueou sem avisar". O lembrete de 3
   dias não é condição de bloqueio e usa o `sendBillingEmailOnce` normalmente.
2. **O piso de 10 dias é constante de código** (`MIN_NOTICE_DAYS = 10`), não
   configuração. Ele vem do contrato; mudar exige aditivo, não um campo na tela.
3. **A data prevista é a do aviso.** Ela é calculada no envio e gravada no
   evento. Mudar `overdueBlockDays` depois não muda a data já comunicada.
4. **Uma regra só, simétrica.** `overdueBlockHolds` decide se o bloqueio por
   atraso se sustenta. Se sustenta e a empresa está liberada, bloqueia; se não
   sustenta e o bloqueio é `OVERDUE`, libera. Desligar `autoBlockEnabled` faz a
   regra deixar de se sustentar, então **libera todos os bloqueios por atraso no
   tick seguinte**: o switch é o rollback. Bloqueio `MANUAL` nunca é tocado pela
   regra.
5. **Empresa inativa tem precedência no motivo.** Inativa e com fatura vencida
   aparece como `INACTIVE`: pagar não devolve o acesso, reativar sim.
6. **Liberação com data opcional, até 90 dias.** Com data, o bloqueio por atraso
   não volta até o fim daquele dia (São Paulo). Sem data, ele volta no tick
   seguinte se a fatura continuar vencida.
7. **Bloqueio manual não é para atraso.** É para violação do contrato ou pedido
   do cliente, e a tela diz isso. Atraso segue o aviso e o bloqueio automático.
8. **O expurgo LGPD continua para empresa bloqueada.** O `PURGE` roda dentro do
   `nightly` (`docs/intelligence/README.md`, seção "Retenção e LGPD"). Pausar o
   `nightly` sem mais nada pararia o apagamento das coordenadas de GPS de 90
   dias. Para empresa bloqueada, o agendador roda só o `PURGE`, uma vez por dia.
9. **No app, `COMPANY_BLOCKED` não gasta tentativa e para a fila.** Só tirar o
   403 das rejeições definitivas não basta: o item cairia no `markError`, que
   soma tentativas, e depois de 5 (`maxAttempts`) a fila não tenta mais sozinha.

## Estado atual

Conferido no commit `80fe328`.

### API — autenticação e guards

- `apps/api/src/middleware/authenticate.ts:6-23` — o `authenticate`. A consulta
  que roda em toda requisição está em `:16-19` e só traz `active`:

```ts
const dbUser = await prisma.user.findUnique({
  where: { id: request.user.sub },
  select: { active: true },
})
if (!dbUser?.active) {
  return reply.status(401).send({ message: 'Usuário inativo' })
}
```

- Todos os guards passam pelo `authenticate`. Conferido rota a rota no `80fe328`:

| Guard | Onde | Passa pelo `authenticate`? |
|---|---|---|
| `requireSuperAdmin` | `authenticate.ts:26-36` | sim, `:30` |
| `requirePermission` | `authenticate.ts:40-52` | sim, `:42` |
| `requireAnyPermission` | `authenticate.ts:57-69` | sim, `:59` |
| `requireCompanyScope` | `require-company.ts:23-40` | sim, `:25` |
| hook de `/uploads` | `app.ts:60-63` | sim: é o próprio `authenticate` como `onRequest` (`:61`) |
| `requireCompany` | `require-company.ts:6-12` | não chama, mas sempre vem depois de `authenticate` ou `requirePermission` |
| `requireVendorCode` | `require-vendor-code.ts:15-36` | não chama; é sempre o terceiro de `[authenticate, requireCompany, requireVendorCode]` |
| `resolveTenant` | `resolve-tenant.ts:18-53` | helper chamado dentro de rotas já protegidas por `requirePermission` |

- `jwtVerify` só aparece em `authenticate.ts:8`. As únicas rotas sem guard são
  públicas: `/health` (`app.ts:68`), `/auth/login` (`auth.routes.ts:36`),
  `/auth/refresh` (`:89`), `/auth/forgot-password` (`:207`),
  `/auth/reset-password` (`:237`) e `/auth/logout` (`:264`).
- `apps/api/src/modules/auth/auth.routes.ts:141-194` — `GET /auth/me`, com
  `preHandler: authenticate` em `:143`. O `select` da empresa está em `:158` e a
  resposta monta `company` em `:186-191`, sem nada de acesso.
  `GET /auth/me/permissions` está em `:197-204`.
- `apps/api/src/modules/auth/auth.service.ts:13-25` (`loginUser`) e `:37-66`
  (`rotateRefreshToken`) só olham `user.active` (`:15` e `:47`). Nenhum dos dois
  consulta a empresa, e assim deve continuar.
- `apps/api/src/lib/error-handler.ts:11-15` — o handler global devolve
  `{ message }`. O 403 deste plano é enviado direto pelo `authenticate`, então
  não depende do `AppError.code` do 013.

### Por que login, refresh e logout não podem ser bloqueados

Os dois clientes tratam **qualquer** erro do refresh como sessão morta:

- web, `apps/web/src/lib/api.ts:93-101`: o `catch` do refresh faz
  `clearAccessToken()` e manda para `/login`;
- app, `apps/mobile/src/lib/api.ts:76-83`: se o servidor rejeitou o refresh,
  `clearAuth()`;
- app, `apps/mobile/src/store/auth.store.ts:180-189`: no boot, o `hydrate` faz
  `dropSession()` em qualquer erro do refresh que tenha resposta.

Um 403 no refresh deslogaria o usuário, o login o mandaria de volta, o refresh
falharia de novo: o loop da decisão 2. O bloqueio fica nas rotas de negócio.

### API — empresa, jobs e datas

- `apps/api/src/modules/companies/companies.service.ts:79-88` —
  `toggleCompanyActive` grava `active` e liga ou desliga o auto-sync. Não corta
  acesso. A rota é `PATCH /companies/:id/active`
  (`companies.routes.ts:84-89`, só SUPERADMIN).
- `apps/api/src/modules/intelligence/jobs/scheduler.ts:90-95` — o filtro de
  empresas do agendador da Inteligência:

```ts
function listEnabledCompanies() {
  return prisma.company.findMany({
    where: { active: true, intelligenceEnabled: true },
    select: { id: true, intelligenceConfig: true },
  })
}
```

  O laço do tick está em `:118-140`; `computeDueJobs` (`:41-54`) decide
  `NIGHTLY` e `REFRESH` comparando com o último início de cada job. O ticker é
  de 1 minuto (`:12`, `:155-162`).
- `apps/api/src/modules/intelligence/jobs/nightly.ts:120` — o `PURGE` (expurgo
  LGPD) roda **dentro** do `nightly`.
- `apps/api/src/modules/intelligence/engine/business-days.ts` — `ymdSaoPaulo`
  (`:11`), `diffDays` (`:42`), `addDaysYmd` (`:49`), `ymdToDate` (`:84`),
  `daysOverdueOn` (`:98`) e `dateToYmdUtc` (`:104`). Datas como `'YYYYMMDD'`.
- `packages/db/prisma/schema.prisma:56-116` — modelo `Company`, `active` em `:61`,
  `@@map("companies")` em `:115`. Não há campo de bloqueio.
- `packages/types/src/index.ts:23-43` — `UserPublic`; `company` em `:34` é
  `{ intelligenceEnabled: boolean; defaultTone: string } | null`.

### Testes da API que o `authenticate` novo não pode quebrar

Mockam o usuário **sem** empresa — companhia ausente tem de valer como não
bloqueada:

- `prismaMock.user.findUnique.mockResolvedValue({ active: true })` em
  `companies/__tests__/companies-scope.test.ts:45`,
  `orders/__tests__/orders-blocked-customer.test.ts:39`,
  `users/__tests__/users-routes.test.ts:50`,
  `intelligence/admin/__tests__/admin-routes.test.ts:79`,
  `intelligence/admin/__tests__/admin-reconcile-contracts.test.ts:64`,
  `intelligence/manager/__tests__/manager-routes.test.ts:45`,
  `intelligence/manager/__tests__/conversion.test.ts:116`,
  `intelligence/manager/__tests__/manager-visits.test.ts:46` e
  `intelligence/manager/__tests__/manager-routes-phase2.test.ts:40`;
- `users/__tests__/users-routes.test.ts:61-64` devolve `{ active: true }` ou
  `{ companyId }`.

Mockam a empresa **sem** o campo `active` — por isso a checagem é
`company.active === false`, nunca `!company.active`:

- `intelligence/app/__tests__/app-routes.test.ts:21-25` (`USER_ROWS` com
  `company: { intelligenceEnabled: true }`);
- `intelligence/app/__tests__/app-routes-phase2.test.ts:27-31`.

### Web

- `apps/web/src/lib/api.ts:77-103` — interceptor de resposta. Tudo que não é 401
  passa direto (`:82-84`). `getApiErrorMessage` em `:108-114`.
- `apps/web/src/contexts/AuthContext.tsx:30-49` — `restoreSession` (refresh +
  `/auth/me`); `:51-67` — `login` (também chama `/auth/me`). Não existe função
  para recarregar o usuário depois do login.
- `apps/web/src/app/(admin)/layout.tsx:61-170` — `NAV_GROUPS`; `:258` filtra por
  `filterNavGroups`; `:275-287` é o gate de sessão; `:425-433` renderiza
  `children` dentro do `<main>`.
- `apps/web/src/lib/home-redirect.ts:13-15` — entram no painel SUPERADMIN, ADMIN
  e quem tem permissão `intel.*` (o gerente).
- `apps/web/src/app/(admin)/empresas/[id]/page.tsx:111-121` — botão "Desativar
  empresa", só SUPERADMIN, sem confirmação. Já existe um `ConfirmModal` na mesma
  pasta (`empresas/[id]/ConfirmModal.tsx:16-50`).
- `apps/web/src/app/(admin)/dashboard/page.tsx:87-100` — o ícone de cadeado da
  lista se chama "Bloquear empresa", mas alterna `active`. O 013 transforma
  `/dashboard` em redirect; se o arquivo ainda existir quando você executar, o
  rótulo muda (passo 8).
- `apps/web/vitest.config.ts` — ambiente `node`, só `src/**/*.test.ts`: o teste
  de web tem de ser de função pura.

### App (mobile)

- `apps/mobile/src/lib/api.ts:38-88` — interceptor. A condição do 401 está em
  `:46`; nada trata 403.
- `apps/mobile/src/store/auth.store.ts:21-32` — estado; `fetchMe` em `:87-100`
  (usa axios puro com o token, engole erro); `refreshSession` em `:105-146`;
  `hydrate` em `:149-203`.
- `apps/mobile/app/_layout.tsx:126-146` — o efeito de redirecionamento do
  `AuthGuard`:

```ts
const authenticated = Boolean(accessToken && user)

if (!authenticated && !inAuthGroup) {
  router.replace('/(auth)/login')
} else if (authenticated && inAuthGroup) {
  router.replace('/(app)')
}
```

- `apps/mobile/src/services/syncEngine.ts:19-24`:

```ts
const TRANSIENT_4XX = new Set([401, 408, 429])

export function isPermanentRejection(err: unknown): boolean {
  const status = (err as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' && status >= 400 && status < 500 && !TRANSIENT_4XX.has(status)
}
```

  Um 403 vira `markFailedPermanently` (`:62-79`). O caminho transitório chama
  `markError` (`:81`), que soma uma tentativa (`syncStore.ts:112-123`). Com
  `maxAttempts: 5` (`syncStore.ts:64`), depois da quinta o filtro de
  `processSyncQueue` (`syncEngine.ts:118-121`) não pega mais o item.
- `apps/mobile/src/hooks/useSyncQueue.ts:32-39` — `retryItem` zera as tentativas
  (é o "Reenviar" manual). Não muda neste plano.
- `apps/mobile/src/lib/query-client.ts:10-14` — `retry` das queries: até 3 vezes.
- `apps/mobile/package.json` — `test:unit` é `jest src/ --ci`: teste fora de
  `src/` não roda. O teste do redirecionamento precisa de função pura em `src/`.
- `apps/mobile/src/lib/__tests__/api.test.ts:6-14` — o axios é mockado no Jest; o
  interceptor real não executa em teste. A lógica testável vai para funções puras.

### O que o 013 ao 016 deixam pronto (confira antes do passo 1)

Os nomes abaixo vêm do desenho aprovado. Use os nomes que o código real tiver e
anote as diferenças no relatório final. **Se faltar qualquer item, PARE.**

| Item | Plano | Como conferir |
|---|---|---|
| `ClientProfile.billingEmail` | 013 | `grep -n "billingEmail" packages/db/prisma/schema.prisma` |
| `CompanyContract.overdueBlockDays` (opcional, por empresa) | 013 | `grep -n "overdueBlockDays" packages/db/prisma/schema.prisma` |
| `BillingSettings.overdueBlockDays` (padrão 15) e `autoBlockEnabled` (padrão `false`) | 013 | `grep -n -A12 "model BillingSettings" packages/db/prisma/schema.prisma` |
| `BillingEvent` com `type String` (lista fechada `BILLING_EVENT_TYPES` em `packages/types/src/billing.ts`), `actorId` (null = job), `payload` e `dedupeKey String? @unique` | 013 | `grep -n -A15 "model BillingEvent" packages/db/prisma/schema.prisma` |
| `deriveClientStatus` com a entrada opcional `accessBlockReason`, e `BILLING_EVENT_LABELS` em `apps/web/src/lib/billing-ui.ts` | 013 | `grep -rn "accessBlockReason\|BILLING_EVENT_LABELS" packages/types/src apps/web/src/lib` |
| `Invoice` com `status` (OPEN/PAID/CANCELLED), `dueDate @db.Date`, `number`, `competence`; relação `Company.invoices` | 016 | `grep -n -A25 "model Invoice " packages/db/prisma/schema.prisma` |
| Agendador `billing/jobs/billing-scheduler.ts` (`initBillingScheduler`), com tick de hora em hora e `BILLING_JOBS_ENABLED` | 016 | `ls apps/api/src/modules/billing/jobs/` |
| `billing/billing-mailer.ts` com `sendBillingEmailOnce`, `billingRecipients` (`billingEmail` + ADMINs ativos) e `escapeHtml`; `dedupeKey` no formato `invoice:<id>:<etapa>` | 016 | `grep -n "export" apps/api/src/modules/billing/billing-mailer.ts` |
| Baixa `POST /admin/billing/invoices/:id/pay` e cancelamento de fatura, em `invoices.routes.ts` / `invoices.service.ts`, com o comentário `// Plano 017: o desbloqueio da empresa na baixa entra aqui` | 016 | `grep -rn "Plano 017" apps/api/src/modules/billing` |
| `POST /admin/billing/jobs/run` | 016 | `grep -rn "jobs/run" apps/api/src/modules/billing` |
| Rotas `/billing/me/*` (entre elas `GET /billing/me/invoices`) e hooks do ADMIN em `apps/web/src/hooks/useInvoices.ts` (`useMyInvoices`) | 014–016 | `grep -rn "billing/me\|'/me" apps/api/src/modules/billing` |
| Ficha `/gestao/clientes/[id]` com aba Histórico; Pacotes e regras `/gestao/pacotes` | 013 | `ls 'apps/web/src/app/(admin)/gestao'` |
| Telas `/contrato` (014) e `/plano` (015/016) | 014–016 | `ls 'apps/web/src/app/(admin)'` |
| `packages/types/src/billing.ts` | 013 | `ls packages/types/src` |

## Esboço de tela

### Faixa de cobrança (ADMIN, empresa ainda liberada)

Aparece no topo do conteúdo, em todas as telas do painel, enquanto houver
fatura vencida. Tom de alerta (`bg-warning/5`, `border-warning/30`, ícone
`AlertTriangle`).

```
┌──────────────────────────────────────────────────────────────────────┐
│ (!) Fatura nº 12 (09/2026) vencida em 10/10/2026.                     │
│     Se não for paga, o acesso ao app e ao painel será suspenso em     │
│     25/10/2026 (em 9 dias).                  [ Ver Plano e cobrança ] │
└──────────────────────────────────────────────────────────────────────┘
```

Variações do texto (todas saem de uma função pura, passo 7):

- vencida, aviso ainda não enviado: "Fatura nº 12 (09/2026) vencida em 10/10/2026.";
- data prevista já passou, sem bloqueio: "Fatura nº 12 (09/2026) vencida desde
  10/10/2026. O acesso pode ser suspenso a qualquer momento.";
- bloqueada por atraso (tom de perigo, `bg-danger/5`): "Acesso suspenso desde
  25/10/2026: fatura nº 12 vencida em 10/10/2026. Nenhum dado foi apagado. A
  baixa do pagamento libera o acesso na hora.";
- bloqueio manual: "Acesso suspenso pela Addere. Fale com a Addere.";
- empresa desativada: "Empresa desativada. Fale com a Addere.".

### Tela de bloqueio no painel (ADMIN)

Aparece em toda rota, menos `/plano` e `/contrato`. O menu fica só com esses
dois itens.

```
┌────────────┬─────────────────────────────────────────────────────────┐
│ addere     │ [faixa de perigo, como acima]                           │
│            │                                                         │
│ EMPRESA    │                   (ícone Lock)                          │
│ Contrato   │                                                         │
│ Plano e    │             Acesso da empresa suspenso                  │
│ cobrança   │                                                         │
│            │   O app e o painel estão suspensos. Nenhum dado foi     │
│            │   apagado. Você ainda vê o Contrato e o Plano e         │
│            │   cobrança.                                             │
│            │                                                         │
│            │   [ Ver Plano e cobrança ]   [ Verificar de novo ]      │
│ ────────── │                                                         │
│ Sair       │                                                         │
└────────────┴─────────────────────────────────────────────────────────┘
```

### Tela de bloqueio no painel (gerente)

Menu vazio, só o rodapé com "Sair".

```
┌────────────┬─────────────────────────────────────────────────────────┐
│ addere     │                   (ícone Lock)                          │
│            │                                                         │
│            │       Acesso da sua empresa suspenso.                   │
│            │       Fale com o administrador.                         │
│            │                                                         │
│            │              [ Verificar de novo ]                      │
│ ────────── │                                                         │
│ Sair       │                                                         │
└────────────┴─────────────────────────────────────────────────────────┘
```

### Ficha do cliente (SUPERADMIN) — cartão "Acesso"

No cabeçalho da ficha `/gestao/clientes/[id]`, visível em todas as abas.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Clientes                                                           │
│ Distribuidora Exemplo Ltda              [ Integração ] [ Bloquear ]  │
│ 12.345.678/0001-90                                [ Liberar até… ]   │
│                                                                      │
│ ┌ Acesso ──────────────────────────────────────────────────────────┐ │
│ │ ● Bloqueado por atraso desde 25/10/2026                          │ │
│ │   Aviso de suspensão enviado em 11/10/2026 (fatura nº 12),       │ │
│ │   com data prevista 25/10/2026.                                  │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

Estados do cartão: "Acesso liberado"; "Aviso enviado em dd/mm — suspensão
prevista em dd/mm (fatura nº N)"; "Bloqueado por atraso desde dd/mm";
"Bloqueado manualmente desde dd/mm (motivo no Histórico)"; "Liberado até
dd/mm"; "Empresa desativada — o acesso está cortado (ficha técnica, Ativar
empresa)". "Bloquear" some quando o bloqueio já é manual; "Liberar até…"
aparece quando há bloqueio, aviso pendente ou liberação vigente.

```
┌ Bloquear acesso ──────────────────────────────────┐
│ O app e o painel da empresa ficam bloqueados até   │
│ você liberar. O administrador ainda vê Contrato e  │
│ Plano e cobrança. Nenhum dado é apagado.           │
│                                                    │
│ Use só para violação do contrato ou pedido do      │
│ cliente. Atraso de pagamento segue o aviso de 10   │
│ dias e o bloqueio automático.                      │
│                                                    │
│ Motivo (fica no Histórico) *                       │
│ ┌────────────────────────────────────────────────┐ │
│ │                                                │ │
│ └────────────────────────────────────────────────┘ │
│                         [ Cancelar ] [ Bloquear ]  │
└────────────────────────────────────────────────────┘

┌ Liberar acesso ───────────────────────────────────┐
│ Liberar até (opcional)   [ 05/11/2026 ]            │
│ Até essa data o bloqueio por atraso não volta.     │
│ Sem data, ele volta no próximo ciclo (até 1 hora)  │
│ se a fatura continuar vencida.                     │
│                         [ Cancelar ] [ Liberar ]   │
└────────────────────────────────────────────────────┘
```

### Confirmação de "Desativar empresa" (ficha técnica `/empresas/[id]`)

```
┌ Desativar empresa ─────────────────────────────┐
│ (!) Desativar corta o acesso de todos os        │
│     usuários da empresa ao app e ao painel —    │
│     o administrador só vê Contrato e Plano e    │
│     cobrança — e para o sync automático do      │
│     Protheus. Nenhum dado é apagado. Para       │
│     inadimplência, use Bloquear na ficha do     │
│     cliente.                                    │
│                       [ Manter ] [ Desativar ]  │
└─────────────────────────────────────────────────┘
```

### App — `app/bloqueado.tsx`

Fundo `colors.neutral.bg`, ícone `Lock` do `lucide-react-native` (stroke 1.5),
título em Plus Jakarta Sans, corpo em Inter, `Button` do app.

```
┌─────────────────────────────┐
│                             │
│         (ícone Lock)        │
│                             │
│  Acesso da sua empresa      │
│  suspenso.                  │
│                             │
│  Fale com o administrador.  │
│                             │
│  2 pedidos aguardando envio.│
│  Eles serão enviados quando │
│  o acesso voltar.           │
│                             │
│  [   Tentar novamente   ]   │
│  [         Sair         ]   │
└─────────────────────────────┘
```

A linha da fila só aparece com itens pendentes. "Tentar novamente" que
encontra a empresa ainda bloqueada mostra, abaixo dos botões, "Ainda suspenso."

## Quem acessa

| Perfil | Empresa com fatura vencida | Empresa bloqueada (ou desativada) |
|---|---|---|
| SUPERADMIN | Vê o cartão "Acesso" na ficha; pode bloquear e liberar | Nunca é bloqueado. Bloqueia e libera pela ficha |
| ADMIN | Faixa com a fatura e a data prevista | Painel abre, mas só Contrato e Plano e cobrança funcionam; o resto mostra a tela de bloqueio. No app, tela de bloqueio |
| Gerente (`SALESPERSON` + `intel.manager`) | Nada muda | Painel e app mostram a tela de bloqueio |
| Vendedor (`SALESPERSON`) | Nada muda | App mostra a tela de bloqueio; a fila de pedidos espera |

Rotas novas:

| Rota | Guard | Liberada com a empresa bloqueada? |
|---|---|---|
| `POST /admin/billing/clients/:companyId/block` | `requireSuperAdmin` | n/a (SUPERADMIN nunca é bloqueado) |
| `POST /admin/billing/clients/:companyId/unblock` | `requireSuperAdmin` | n/a |
| `GET /billing/me/overdue` | o mesmo das outras `/billing/me/*` (ADMIN) | sim |

Rotas que passam a aceitar empresa bloqueada (`config.allowBlockedCompany`):
`GET /auth/me`, `GET /auth/me/permissions` e todas as `/billing/me/*`. Nenhuma
outra.

## Comandos que você vai precisar

| Para quê | Comando | Esperado quando dá certo |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Gerar o client | `npm run db:generate` | exit 0 (não precisa de banco) |
| Validar o schema | `cd packages/db && DATABASE_URL=postgresql://addere_dev_user:addere_dev_password@localhost:5432/addere_017 npx prisma validate` | "The schema … is valid" |
| Checar tipos | `npm run type-check` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Testes da API | `npm test --workspace=apps/api` | todos passam |
| Um arquivo da API | `npm test --workspace=apps/api -- authenticate-company-block` | passa |
| Testes do web | `npm test --workspace=apps/web` | todos passam |
| Testes do app | `npm run test:unit --workspace=apps/mobile` | todos passam |
| Build da API | `npm run build:api` | exit 0 |
| Build do web | `npm run build:web` (exige `apps/web/.env.local`, copiado de `apps/web/.env.local.example`) | exit 0 |
| Postgres local | `docker compose up -d db` (ou o Postgres local que você tiver) | container de pé |
| Bancos de trabalho | `docker compose exec db createdb -U addere_dev_user addere_017` e o mesmo com `addere_017_shadow` | exit 0 |
| Gerar a migration | ver passo 11 (`prisma migrate diff --from-migrations … --shadow-database-url …`) | só o delta deste plano |
| Aplicar em banco limpo | `DATABASE_URL=postgresql://addere_dev_user:addere_dev_password@localhost:5432/addere_017 DATABASE_URL_DIRECT=postgresql://addere_dev_user:addere_dev_password@localhost:5432/addere_017 npx prisma migrate deploy` (as **duas** variáveis: o schema usa `directUrl`, e sem a segunda o Prisma lê o `packages/db/.env`, que aponta para o Neon) | "All migrations have been successfully applied" |
| Conferir drift | `npx prisma migrate diff --from-url postgresql://addere_dev_user:addere_dev_password@localhost:5432/addere_017 --to-schema-datamodel ./prisma/schema.prisma --exit-code` | exit 0, sem diferença |

> ⚠️ **NÃO rode `npm run db:migrate`, `prisma migrate dev` contra o Neon,
> `prisma migrate reset` nem `prisma db push`. NÃO copie `.env` com URL do Neon
> para o worktree.** Todo comando do Prisma deste plano leva `DATABASE_URL`
> explícito apontando para o Postgres local. A migration chega ao Neon pelo
> `migrate deploy` do pipeline de deploy, sob controle de quem opera.

Este plano **não** cria variável de ambiente. `BILLING_JOBS_ENABLED` é do 016;
o bloqueio automático é o `BillingSettings.autoBlockEnabled`, no banco.

## Escopo

**Dentro do escopo:**

- `packages/db/prisma/schema.prisma` (enum `AccessBlockReason` e três campos na
  `Company`)
- `packages/db/prisma/migrations/<timestamp>_company_access_block/migration.sql`
- `packages/types/src/index.ts` (`CompanyAccess`, `CompanyAccessReason`,
  `COMPANY_BLOCKED_CODE`, `CompanyBlockedResponse`, `isCompanyBlockedError`,
  `UserPublic.company.access`)
- `packages/types/src/billing.ts` (`ClientBlockState`, `BillingOverdueStatus`)
- `apps/api/src/lib/company-access.ts` (novo)
- `apps/api/src/middleware/authenticate.ts`
- `apps/api/src/modules/auth/auth.routes.ts` (só `/me` e `/me/permissions`)
- `apps/api/src/modules/billing/overdue-block.ts` e
  `overdue-block.service.ts` (novos), `billing-mailer.ts` (envio que grava
  depois e os modelos de e-mail novos), `jobs/billing-scheduler.ts`,
  `invoices.routes.ts` / `invoices.service.ts` (baixa e cancelamento), as rotas
  e o serviço de clientes do superadmin (inclusive as chamadas de
  `deriveClientStatus`) e as rotas `/billing/me/*`
- `packages/types/src/billing.ts` também recebe os quatro tipos novos em
  `BILLING_EVENT_TYPES`; `apps/web/src/lib/billing-ui.ts`, os rótulos
- `apps/api/src/modules/intelligence/jobs/scheduler.ts`
- testes novos em `apps/api/src/middleware/__tests__/`,
  `apps/api/src/lib/__tests__/`, `apps/api/src/modules/auth/__tests__/`,
  `apps/api/src/modules/billing/__tests__/` e
  `apps/api/src/modules/intelligence/jobs/__tests__/`
- web: `lib/api.ts`, `lib/company-block.ts` (novo), `contexts/AuthContext.tsx`,
  `(admin)/layout.tsx`, `components/billing/BillingBanner.tsx` e
  `components/billing/CompanyBlockedScreen.tsx` (novos), `hooks/useInvoices.ts`
  (016), a ficha `gestao/clientes/[id]` (cartão e modais novos),
  `empresas/[id]/page.tsx`, `dashboard/page.tsx` (só o rótulo, se o arquivo
  ainda existir), a tela Pacotes e regras (texto do switch) e o mapa de rótulos
  do Histórico; testes em `lib/__tests__/`
- app: `src/lib/api.ts`, `src/lib/query-client.ts`, `src/store/auth.store.ts`,
  `src/store/syncStore.ts`, `src/services/syncEngine.ts`,
  `src/utils/authRedirect.ts` (novo), `app/_layout.tsx`, `app/bloqueado.tsx`
  (novo) e os testes em `src/**/__tests__/`
- docs: `docs/billing/README.md`, `docs/intelligence/README.md`,
  `apps/mobile/docs/DEPLOY_CHECKLIST.md` (uma linha de teste manual)

**Fora do escopo (NÃO toque):**

- `apps/api/src/modules/auth/auth.service.ts` e as rotas `/auth/login`,
  `/auth/refresh`, `/auth/logout`, `/auth/forgot-password` e
  `/auth/reset-password`. Bloquear qualquer uma delas desloga em loop.
- `toggleCompanyActive` e a rota `PATCH /companies/:id/active`. A desativação
  passa a cortar acesso pelo `authenticate`, sem mudar o serviço.
- O sync do Protheus (`apps/api/src/modules/sync/scheduler.ts`). Ele continua
  rodando para empresa bloqueada: não tem custo de IA, e a empresa liberada
  volta com o cadastro em dia. Empresa desativada já tem o sync parado.
- `intelligence/jobs/nightly.ts`, `purge.ts` e `run-job.ts`. Só o agendador muda.
- `requireVendorCode`, `requireCompany`, `resolveTenant`.
- Configuração nativa do app: `app.config.js`, `eas.json`, plugins, permissões,
  dependências nativas. O plano sai por OTA.
- O painel `/gestao` e a agregação dele (plano 018). A coluna "Situação" da
  lista de clientes só ganha o `accessBlockReason` (passo 5); a função
  `deriveClientStatus` não muda.
- Gateway de pagamento, NFS-e, exportação e eliminação de dados (pendências da
  segunda etapa).
- A lista de exceções do bloqueio. Não acrescente rota a ela por conta própria
  (nem `/help/*`, nem `/pilot/events`).

## Fluxo de git

- Branch `advisor/017-inadimplencia-e-bloqueio`, criada de `origin/staging`
  **depois** do merge do 016. PR vai direto para `staging` (lição do incidente
  do #171, em `plans/README.md`).
- Um commit por passo, em português. Sugestões: `db: campos de bloqueio de
  acesso na empresa`, `api: bloqueio por rota no authenticate`, `api: regra do
  aviso de suspensão`, `api: aviso, lembrete e bloqueio no agendador`, `api:
  bloquear e liberar pela ficha`, `api: Inteligência pausa para empresa
  bloqueada`, `web: faixa de cobrança e tela de acesso suspenso`, `web: bloqueio
  na ficha do cliente`, `mobile: tela de acesso suspenso e fila que espera`,
  `docs: operação do bloqueio`, `db: migration company_access_block`.
- A migration entra **por último**, num commit só dela (passo 11). O passo 1
  muda só o `schema.prisma`.
- NÃO faça push nem abra PR sem pedido de quem despachou.
- **NÃO publique o app**: nada de `eas build`, `eas update` ou loja. O OTA é
  passo de operação, depois da API no ar (ver "Ordem de liberação").
- **NÃO ligue `autoBlockEnabled`** em ambiente nenhum de produção. Em staging,
  só para o teste de ponta a ponta.

## Passos

### Passo 0: Conferir a base (sem commit)

1. Rode a checagem de deriva do topo e leia a nota sobre a diferença esperada.
2. Confira a tabela "O que o 013 ao 016 deixam pronto". Anote os nomes reais
   (campo dos dias para bloquear em `BillingSettings`, tipo do `BillingEvent`,
   formato do `dedupeKey`, arquivo das rotas `/billing/me`, função de envio de
   e-mail, rota de baixa). Eles vão no relatório final.
3. Refaça a varredura de guards, agora com as rotas do 013 ao 016:

```bash
grep -rn "jwtVerify" apps/api/src --include=*.ts | grep -v __tests__
grep -rn "addHook('onRequest'" apps/api/src --include=*.ts | grep -v __tests__
```

   O primeiro tem de achar só `middleware/authenticate.ts`; o segundo, só o hook
   de `/uploads` em `app.ts`. Abra os arquivos de rotas de `modules/billing/` e
   confira que toda rota usa `requireSuperAdmin`, `authenticate`,
   `requirePermission`, `requireAnyPermission` ou `requireCompanyScope`. Rota
   protegida por outro mecanismo é condição de PARADA.

**Verificar**: nada a commitar; a lista de nomes reais está anotada.

### Passo 1: Campos de bloqueio e tipos compartilhados

**Arquivos**: `packages/db/prisma/schema.prisma`, `packages/types/src/index.ts`,
`packages/types/src/billing.ts`.

1. No `schema.prisma`, junto dos enums de cobrança do 013:

```prisma
/// Motivo do bloqueio de acesso da empresa (plano 017). Empresa desativada
/// (active=false) também fica bloqueada, mas pelo próprio `active`.
enum AccessBlockReason {
  OVERDUE // fatura vencida, depois do aviso de 10 dias — o sistema limpa sozinho
  MANUAL  // decisão do superadmin — só ele limpa
}
```

2. No modelo `Company`, logo depois de `active`:

```prisma
  // ─── Bloqueio de acesso (plano 017) — null = liberado ───
  accessBlockedAt   DateTime?
  accessBlockReason AccessBlockReason?
  blockExemptUntil  DateTime?          @db.Date // liberado pelo superadmin até este dia (São Paulo), inclusive
```

3. No 013, `BillingEvent.type` é `String`, com a lista fechada
   `BILLING_EVENT_TYPES` em `packages/types/src/billing.ts`. Acrescente lá
   `SUSPENSION_NOTICE_SENT`, `SUSPENSION_REMINDER_SENT`, `ACCESS_BLOCKED` e
   `ACCESS_UNBLOCKED` (os rótulos vêm no passo 8). Se o código real tiver
   transformado o tipo em enum do Prisma, acrescente os quatro valores ao enum
   e à migration do passo 11.
4. Em `packages/types/src/index.ts`, na seção Auth:

```ts
// ─── Acesso da empresa (plano 017) ─────────────────────────────────────────
/** OVERDUE e MANUAL vêm de Company.accessBlockReason; INACTIVE é active = false. */
export type CompanyAccessReason = 'OVERDUE' | 'MANUAL' | 'INACTIVE'

export interface CompanyAccess {
  blocked: boolean
  reason: CompanyAccessReason | null
}

export const COMPANY_BLOCKED_CODE = 'COMPANY_BLOCKED'

/** Corpo do 403 que o authenticate devolve para empresa bloqueada. */
export interface CompanyBlockedResponse {
  message: string
  code: typeof COMPANY_BLOCKED_CODE
  reason: CompanyAccessReason
}

/** Erro do axios (web ou app) que é o 403 de empresa bloqueada. */
export function isCompanyBlockedError(err: unknown): boolean {
  const response = (err as { response?: { status?: unknown; data?: { code?: unknown } } } | null)
    ?.response
  return response?.status === 403 && response.data?.code === COMPANY_BLOCKED_CODE
}
```

   E em `UserPublic.company` acrescente `access?: CompanyAccess` (opcional: o app
   guarda o `/auth/me` antigo no SecureStore, sem o campo). Se o 014 já tiver
   posto `pendingDocument` ali, mantenha.
5. Em `packages/types/src/billing.ts`:

```ts
/** Estado do bloqueio na ficha do cliente (superadmin). Datas 'YYYY-MM-DD'. */
export interface ClientBlockState {
  companyActive: boolean
  blockedAt: string | null // ISO
  reason: 'OVERDUE' | 'MANUAL' | null
  exemptUntil: string | null
  pendingNotice: {
    invoiceId: string
    invoiceNumber: number
    sentAt: string // ISO
    plannedBlockDate: string
  } | null
}

/** GET /billing/me/overdue — a faixa do ADMIN. */
export interface BillingOverdueStatus {
  access: CompanyAccess
  blockedAt: string | null // ISO
  invoice: { id: string; number: number; competence: string; dueDate: string } | null
  plannedBlockDate: string | null
}
```

   `competence` segue o formato que o 016 já usa nos tipos de fatura.

**Verificar**: `npm run db:generate && npm run type-check` → exit 0; `prisma
validate` (tabela de comandos) → válido. `git status` não mostra pasta nova em
`migrations/`.

### Passo 2: Bloqueio por rota no `authenticate` e o acesso no `/auth/me`

**Arquivos**: `apps/api/src/lib/company-access.ts` (novo),
`apps/api/src/middleware/authenticate.ts`, `apps/api/src/modules/auth/auth.routes.ts`,
o plugin das rotas `/billing/me/*`.

1. `lib/company-access.ts` — função pura, usada pelo `authenticate` e pelo
   `/auth/me`:

```ts
import type { AccessBlockReason } from '@prisma/client'
import type { CompanyAccess } from '@addere/types'

interface CompanyAccessFields {
  active?: boolean | null
  accessBlockedAt?: Date | null
  accessBlockReason?: AccessBlockReason | null
}

/**
 * Empresa ausente (SUPERADMIN, ou mock de teste sem empresa) não é bloqueada.
 * `active === false`, e não `!active`: campo ausente também não bloqueia.
 */
export function resolveCompanyAccess(company: CompanyAccessFields | null | undefined): CompanyAccess {
  if (!company) return { blocked: false, reason: null }
  if (company.active === false) return { blocked: true, reason: 'INACTIVE' }
  if (company.accessBlockedAt) return { blocked: true, reason: company.accessBlockReason ?? 'MANUAL' }
  return { blocked: false, reason: null }
}
```

   Bloqueio sem motivo gravado vale como `MANUAL`: nunca é limpo sozinho.
2. `authenticate.ts`:
   - augment do Fastify, no topo do arquivo:

```ts
declare module 'fastify' {
  interface FastifyContextConfig {
    /** Rota que a empresa bloqueada ainda pode chamar (plano 017). */
    allowBlockedCompany?: boolean
  }
}
```

   - a consulta de `:16-19` passa a trazer a empresa:

```ts
select: {
  active: true,
  company: { select: { active: true, accessBlockedAt: true, accessBlockReason: true } },
},
```

   - depois do 401 de usuário inativo, que continua vindo primeiro:

```ts
// Bloqueio por rota (plano 017): login, refresh e logout não passam por aqui,
// e /auth/me, /auth/me/permissions e /billing/me/* são marcados com
// allowBlockedCompany — senão o app e o painel deslogariam em loop.
if (request.user.role === 'SUPERADMIN') return
const access = resolveCompanyAccess(dbUser.company)
if (access.blocked && !request.routeOptions.config.allowBlockedCompany) {
  return reply.status(403).send({
    message: 'Acesso da empresa suspenso. Fale com o administrador.',
    code: COMPANY_BLOCKED_CODE,
    reason: access.reason,
  })
}
```

   `request.routeOptions.config` existe também no `onRequest` do `/uploads`
   (Fastify `^5.8.5`, `apps/api/package.json:35`).
3. `auth.routes.ts`:
   - `/me` e `/me/permissions` ganham `config: { allowBlockedCompany: true }` ao
     lado do `preHandler`;
   - o `select` da empresa em `/me` (`:158`) passa a trazer `active`,
     `accessBlockedAt` e `accessBlockReason`;
   - a resposta (`:186-191`) ganha `access: resolveCompanyAccess(user.company)`
     dentro de `company`.
   - Login, refresh, logout, forgot e reset **não mudam**.
4. Rotas `/billing/me/*`: se elas estão num plugin só delas, ponha no topo do
   plugin, antes de qualquer rota:

```ts
// Tudo em /billing/me continua acessível com a empresa bloqueada (plano 017):
// é por aqui que o ADMIN vê a fatura, o contrato e o pedido de licenças.
app.addHook('onRoute', (routeOptions) => {
  routeOptions.config = { ...routeOptions.config, allowBlockedCompany: true }
})
```

   O `onRoute` é encapsulado: vale só para as rotas daquele plugin. Se as rotas
   `/billing/me` dividem plugin com as `/admin/billing`, ponha
   `config: { allowBlockedCompany: true }` em cada rota `/billing/me`.
5. Confira as telas `/plano` e `/contrato` (e `/contrato/[id]/imprimir`): todas
   as chamadas de API delas e dos hooks que usam têm de ir para `/auth/me` ou
   `/billing/me/*`. Liste com
   `grep -rn "api\.\(get\|post\|put\|patch\)" 'apps/web/src/app/(admin)/plano' 'apps/web/src/app/(admin)/contrato'`
   e siga os hooks importados. Chamada essencial fora dessas rotas é condição
   de PARADA: a lista de exceções não cresce sem decisão.
6. Testes — `apps/api/src/lib/__tests__/company-access.test.ts` (puro) e
   `apps/api/src/middleware/__tests__/authenticate-company-block.test.ts`, no
   padrão de `buildApp` + `app.inject` + `prismaMock`:
   - empresa `OVERDUE`: `GET /customers` (`authenticate`), `GET /users`
     (`requirePermission`) e `GET /companies/:id` com ADMIN
     (`requireCompanyScope`) → 403 com `{ code: 'COMPANY_BLOCKED', reason: 'OVERDUE' }`;
   - `GET /uploads/qualquer.png` com empresa bloqueada → 403 `COMPANY_BLOCKED`;
   - `GET /auth/me` → 200, com `company.access = { blocked: true, reason: 'OVERDUE' }`;
   - `GET /auth/me/permissions` → 200;
   - cada rota `GET` de `/billing/me/*` e o `POST` de aceite do 014 → não é 403
     `COMPANY_BLOCKED`;
   - SUPERADMIN com o mock devolvendo empresa bloqueada → `GET /companies` 200;
   - empresa `active: false` sem bloqueio → 403 com `reason: 'INACTIVE'`, e
     `/auth/me` com `access.reason = 'INACTIVE'`;
   - empresa ausente (`{ active: true }`) e empresa sem `active`
     (`company: { intelligenceEnabled: true }`) → passam;
   - usuário inativo com empresa bloqueada → 401 (a ordem não muda);
   - bloqueio `MANUAL` → 403 com `reason: 'MANUAL'`.
7. Teste `apps/api/src/modules/auth/__tests__/auth-company-block.test.ts`,
   mockando `../auth.service` como `refresh-csrf.test.ts` faz: com o
   `user.findUnique` devolvendo empresa bloqueada, `POST /auth/login`,
   `POST /auth/refresh` (token no corpo) e `POST /auth/logout` → 200, e
   `prismaMock.user.findUnique` não é chamado nessas três rotas.

**Verificar**: `npm test --workspace=apps/api` → todos passam, **sem alterar**
nenhum dos testes citados em "Estado atual". `git diff --stat --
apps/api/src/modules/auth/auth.service.ts` → vazio.

### Passo 3: A regra do aviso e do bloqueio, como funções puras

**Arquivo**: `apps/api/src/modules/billing/overdue-block.ts` (novo). Datas em
`'YYYYMMDD'`, com os helpers de `intelligence/engine/business-days.ts`.

```ts
/** Piso contratual entre o aviso de suspensão e o bloqueio. Não é configuração. */
export const MIN_NOTICE_DAYS = 10
/** Lembrete antes da data prevista. */
export const REMINDER_DAYS_BEFORE = 3
/** Teto da liberação manual com data. */
export const MAX_EXEMPTION_DAYS = 90

/** max(vencimento + overdueBlockDays, envio + 10 dias corridos). */
export function computePlannedBlockDate(input: {
  dueYmd: string
  overdueBlockDays: number
  sentYmd: string
}): string

/** Aviso vence no dia seguinte ao vencimento (ou depois, se o job atrasou). */
export function noticeDue(input: {
  status: string
  dueYmd: string
  todayYmd: string
  hasNotice: boolean
}): boolean

/** Lembrete: fatura em aberto, aviso enviado, faltam de 1 a 3 dias para a data. */
export function reminderDue(input: {
  status: string
  todayYmd: string
  plannedBlockYmd: string
  hasReminder: boolean
  exemptUntilYmd: string | null
}): boolean

/**
 * O bloqueio por atraso se sustenta? Só com:
 * - autoBlockEnabled;
 * - nenhuma liberação vigente (exemptUntilYmd >= hoje);
 * - pelo menos uma fatura OPEN com aviso gravado há >= MIN_NOTICE_DAYS dias
 *   corridos E data prevista alcançada.
 * Sem aviso gravado, nunca — por mais atrasada que esteja a fatura.
 */
export function overdueBlockHolds(input: {
  autoBlockEnabled: boolean
  exemptUntilYmd: string | null
  todayYmd: string
  invoices: Array<{
    status: string
    notice: { sentYmd: string; plannedBlockYmd: string } | null
  }>
}): boolean
```

Regras de implementação:

- `noticeDue`: `status === 'OPEN' && !hasNotice && daysOverdueOn(ymdToDate(dueYmd), todayYmd) >= 1`.
- `reminderDue`: `status === 'OPEN' && !hasReminder`, `diffDays(todayYmd,
  plannedBlockYmd)` entre 1 e `REMINDER_DAYS_BEFORE`, e nenhuma liberação que
  cubra a data prevista (`exemptUntilYmd === null || exemptUntilYmd < plannedBlockYmd`).
- `overdueBlockHolds`: as duas condições do aviso valem juntas —
  `diffDays(notice.sentYmd, todayYmd) >= MIN_NOTICE_DAYS` **e**
  `todayYmd >= notice.plannedBlockYmd`. A segunda já implica a primeira quando
  a data foi calculada certa; a primeira fica como defesa, porque é ela que o
  contrato promete.

Testes — `apps/api/src/modules/billing/__tests__/overdue-block.test.ts`:

- `computePlannedBlockDate`: vence 10/10, 15 dias, aviso em 11/10 → 25/10;
  vence 10/10, **3 dias**, aviso em 11/10 → **21/10** (o piso vence); aviso
  atrasado em 20/10 com 15 dias → 30/10; aviso em 25/12 com 3 dias → 04/01 do
  ano seguinte;
- `noticeDue`: vence hoje → false; venceu ontem → true; já avisada → false;
  `PAID` → false;
- `reminderDue`: 3 dias antes → true; 4 dias antes → false; no próprio dia →
  false; já enviado → false; liberação até depois da data → false;
- `overdueBlockHolds`:
  - **sem aviso, 60 dias de atraso e `overdueBlockDays = 3` → false**;
  - aviso há 9 dias, mesmo com a data prevista forçada para hoje → false;
  - aviso há 10 dias e data alcançada → true;
  - aviso há 12 dias e data no futuro → false;
  - liberação até hoje → false; até ontem → true;
  - `autoBlockEnabled = false` → false;
  - fatura `PAID` ou `CANCELLED` com aviso antigo → false;
  - duas faturas, só uma qualifica → true.

**Verificar**: `npm test --workspace=apps/api -- overdue-block` → passa.

### Passo 4: Aviso, lembrete, bloqueio e liberação no agendador

**Arquivos**: `apps/api/src/modules/billing/overdue-block.service.ts` (novo),
`billing/billing-mailer.ts` (016), `billing/jobs/billing-scheduler.ts` (016),
`invoices.routes.ts` / `invoices.service.ts` (baixa e cancelamento, 016), o
plugin `/billing/me/*`.

1. **Envio que grava depois** — em `billing-mailer.ts`, ao lado do
   `sendBillingEmailOnce`, acrescente `sendBillingEmailThenRecord`, com a
   entrada do `sendBillingEmailOnce` mais um `idempotencyKey: string`, o mesmo
   `SendOutcome` e a ordem inversa:
   1. sem `RESEND_API_KEY` ou sem destinatário → `'skipped'`, nada gravado;
   2. já existe evento com o `dedupeKey` → `'duplicate'`, sem enviar;
   3. envia com `resend.emails.send(payload, { idempotencyKey })`. Para o aviso,
      a chave é o `dedupeKey` seguido de `:` e do `plannedBlockYmd` — a data
      entra na chave porque um reenvio com data recalculada é outro e-mail;
   4. erro do Resend (retorno com `error` ou exceção) → `captureError` e
      `'failed'`, **nada gravado**;
   5. sucesso → cria o `BillingEvent`; P2002 aqui é outro tick que gravou
      primeiro → `'duplicate'`; → `'sent'`.

   Use os mesmos `from`, `replyTo`, `billingRecipients` e `escapeHtml` do 016.
   Comente no código por que o aviso não usa o `sendBillingEmailOnce` (decisão
   de desenho 1).
2. **Aviso de suspensão** — `sendSuspensionNotices(now)`:
   - `todayYmd = ymdSaoPaulo(now)`;
   - faturas `OPEN` com `dueDate` antes de hoje, de empresas `active = true`;
   - para cada uma sem evento com `dedupeKey = 'invoice:<invoiceId>:suspension-notice'`
     (formato do 016), com `noticeDue` verdadeiro:
     - `overdueBlockDays` = o do contrato da empresa, ou o padrão global de
       `BillingSettings` quando ele for nulo;
     - `plannedBlockYmd = computePlannedBlockDate({ dueYmd, overdueBlockDays, sentYmd: todayYmd })`;
     - envia por `sendBillingEmailThenRecord`, com o tipo
       `SUSPENSION_NOTICE_SENT`, autor nulo e
       `payload: { invoiceId, plannedBlockYmd, recipients: <quantidade> }`.
       Nada de e-mail no payload (LGPD);
     - `'skipped'` por falta de destinatário → `captureError` com o `companyId`
       (a empresa nunca será bloqueada por essa fatura enquanto ninguém puder
       ser avisado, e alguém precisa saber);
     - `'failed'` → segue para a próxima fatura. O tick seguinte tenta de novo,
       com a data recalculada a partir do novo envio.
3. **E-mail do aviso** — `buildSuspensionNoticeEmail`, em `billing-mailer.ts`
   junto dos modelos do 016. Assunto: `Aviso de suspensão do Addere — fatura
   nº {número}`. Corpo:

   > A fatura nº {número}, da competência {MM/AAAA}, no valor de R$ {total},
   > venceu em {dd/mm/aaaa} e ainda não tem pagamento registrado.
   >
   > Se ela não for paga, o acesso da {empresa} ao app e ao painel do Addere
   > será suspenso em **{dd/mm/aaaa}**.
   >
   > A suspensão não apaga nenhum dado. O administrador continua vendo o
   > Contrato e o Plano e cobrança, e o acesso volta assim que a Addere
   > registrar o pagamento. Se o pagamento já foi feito, responda este e-mail
   > com o comprovante.
   >
   > Ver Plano e cobrança: {WEB_URL}/plano

4. **Lembrete** — `sendSuspensionReminders(now)`: para cada aviso gravado cuja
   fatura continua `OPEN` e `reminderDue` é verdadeiro, envia
   `buildSuspensionReminderEmail` (assunto `Lembrete: o acesso ao Addere será
   suspenso em {dd/mm/aaaa}`, mesmo corpo resumido) pelo `sendBillingEmailOnce`
   do 016, com o tipo `SUSPENSION_REMINDER_SENT` e
   `dedupeKey = 'invoice:<invoiceId>:suspension-reminder'`.
5. **Bloqueio e liberação** — `reconcileCompanyBlock(tx, companyId, now, actor)`,
   onde `tx` é um `Prisma.TransactionClient` e `actor` é
   `{ userId: string | null; cause: 'RULE' | 'PAYMENT' | 'INVOICE_CANCELLED' }`:
   - carrega a empresa (`accessBlockedAt`, `accessBlockReason`,
     `blockExemptUntil`), `BillingSettings.autoBlockEnabled`, as faturas `OPEN`
     vencidas e os eventos de aviso delas (busca por `dedupeKey: { in: [...] }`;
     `sentYmd = ymdSaoPaulo(evento.createdAt)`, `plannedBlockYmd` do payload);
   - `holds = overdueBlockHolds(...)`;
   - `holds` e empresa liberada → bloqueia com
     `tx.company.updateMany({ where: { id, accessBlockedAt: null, invoices: { some: { id: { in: idsQueQualificam }, status: 'OPEN' } } }, data: { accessBlockedAt: now, accessBlockReason: 'OVERDUE' } })`.
     O filtro de relação faz a mesma instrução conferir que a fatura continua
     em aberto. `count === 1` → evento `ACCESS_BLOCKED`
     (`payload: { reason: 'OVERDUE', invoiceIds }`);
   - `!holds` e bloqueio `OVERDUE` → libera com
     `tx.company.updateMany({ where: { id, accessBlockReason: 'OVERDUE' }, data: { accessBlockedAt: null, accessBlockReason: null } })`;
     `count === 1` → evento `ACCESS_UNBLOCKED` (`payload: { cause, previousReason: 'OVERDUE' }`);
   - bloqueio `MANUAL`: nunca muda aqui.

   **Esta função é o único lugar do código que grava `accessBlockReason:
   'OVERDUE'`.**
6. `reconcileOverdueBlocks(now)`: empresas com `accessBlockReason = 'OVERDUE'`
   **ou** com fatura `OPEN` vencida; para cada uma,
   `prisma.$transaction((tx) => reconcileCompanyBlock(tx, id, now, { userId: null, cause: 'RULE' }))`.
7. `billing-scheduler.ts`: depois dos passos do 016, cada um no mesmo
   `try/catch` com `captureError` que o 016 usa:
   `sendSuspensionNotices` → `sendSuspensionReminders` → `reconcileOverdueBlocks`.
8. **A baixa desbloqueia na hora, na mesma transação.** O 016 deixou na baixa o
   comentário `// Plano 017: o desbloqueio da empresa na baixa entra aqui,
   depois da transação.` Este plano põe o desbloqueio **dentro** da transação
   que marca a fatura `PAID`, não depois: chame
   `reconcileCompanyBlock(tx, companyId, now, { userId: request.user.sub, cause: 'PAYMENT' })`
   antes do fim da transação e apague o comentário. Assim não existe instante
   com a fatura paga e a empresa ainda bloqueada. Se a baixa do 016 não usar
   transação interativa, envolva as escritas num `prisma.$transaction(async (tx) => …)`.
   Faça o mesmo no cancelamento de fatura, com `cause: 'INVOICE_CANCELLED'`.
9. `getOverdueStatus(companyId, now): BillingOverdueStatus` e a rota
   `GET /billing/me/overdue` no plugin `/billing/me`, com o guard das outras.
   `invoice` é a fatura `OPEN` vencida mais antiga; `plannedBlockDate` vem do
   aviso dela (`'YYYY-MM-DD'`); `access` sai de `resolveCompanyAccess`.

Testes de `sendBillingEmailThenRecord`, em `billing/__tests__/billing-mailer.test.ts`
(016), com o `resend` mockado como lá:

- sucesso → o `send` é chamado **antes** do `billingEvent.create` (confira a
  ordem pelas chamadas dos mocks) e o resultado é `'sent'`;
- `send` devolve `error` ou lança → `'failed'`, `billingEvent.create` **não** é
  chamado, `captureError` é;
- evento já existe com o `dedupeKey` → `'duplicate'` e o `send` não é chamado;
- P2002 no `create` depois do envio → `'duplicate'`, sem lançar.

Testes — `apps/api/src/modules/billing/__tests__/overdue-block.service.test.ts`,
com `prismaMock` e o `billing-mailer` mockado:

- aviso: o e-mail sai com a data prevista no corpo; o evento é gravado com o
  `dedupeKey` `invoice:<id>:suspension-notice` e o `plannedBlockYmd`; o segundo
  tick não envia de novo;
- envio `'failed'` → nenhum evento de aviso, e nenhum bloqueio depois;
- sem destinatário → nenhum evento, `captureError` chamado;
- **com `overdueBlockDays = 3`**: tick no dia seguinte ao vencimento grava a
  data = envio + 10; ticks em vencimento + 4 e em envio + 9 **não bloqueiam**;
  tick em envio + 10 bloqueia (`autoBlockEnabled = true`);
- **nenhum tick bloqueia empresa sem evento de aviso**, com 60 dias de atraso;
- `autoBlockEnabled = false` → nunca bloqueia, e libera um `OVERDUE` existente;
- bloqueio `MANUAL` com a fatura paga → continua `MANUAL`;
- `blockExemptUntil` = hoje → não bloqueia; no dia seguinte, bloqueia;
- `sendBillingEmailThenRecord` devolvendo `'duplicate'` → o tick segue sem erro;
- baixa de empresa `OVERDUE` → a liberação acontece dentro da mesma chamada de
  `$transaction` que marca `PAID`; com outra fatura ainda qualificando, continua
  bloqueada; empresa `MANUAL` → continua bloqueada;
- `GET /billing/me/overdue` com a empresa bloqueada → 200 com a fatura e a data.

Ponha os testes da baixa no arquivo de testes da baixa que o 016 criou, se
existir.

**Verificar**: `npm test --workspace=apps/api` → passa;
`grep -rn "accessBlockReason: 'OVERDUE'" apps/api/src --include=*.ts | grep -v __tests__`
→ só `overdue-block.service.ts`.

### Passo 5: Bloquear e liberar pela ficha do cliente (API)

**Arquivos**: as rotas e o serviço de clientes do superadmin (013; procure
`/admin/billing/clients/:companyId`), `overdue-block.service.ts`, o schema zod
das rotas de cobrança, `billing-mailer.ts` (e-mail de liberação) e toda chamada
de `deriveClientStatus` na API.

1. `POST /admin/billing/clients/:companyId/block`, `requireSuperAdmin`, corpo
   `{ note: string }` (zod: `trim`, de 10 a 500 caracteres; mensagem "Descreva
   o motivo do bloqueio"). Numa transação:
   `accessBlockedAt = now`, `accessBlockReason = 'MANUAL'`,
   `blockExemptUntil = null`, e o evento `ACCESS_BLOCKED` com o autor e
   `payload: { reason: 'MANUAL', note }`. Empresa já bloqueada por `MANUAL` →
   409 "A empresa já está bloqueada". Um `OVERDUE` vira `MANUAL`.
2. `POST /admin/billing/clients/:companyId/unblock`, `requireSuperAdmin`, corpo
   `{ until?: 'YYYY-MM-DD' }`. `until` tem de ser ≥ hoje e ≤ hoje +
   `MAX_EXEMPTION_DAYS` (São Paulo); fora disso, 400 com a faixa válida. Numa
   transação: `accessBlockedAt = null`, `accessBlockReason = null`,
   `blockExemptUntil = until ? ymdToDate(until sem hífens) : null`, e o evento
   `ACCESS_UNBLOCKED` com o autor e `payload: { previousReason, until }`.
   Empresa liberada e sem `until` → 409 "Nada a liberar". Com `until`, a rota
   funciona mesmo sem bloqueio: é a liberação antecipada de quem prometeu pagar.
3. Com `until`, depois da transação, envie `buildAccessReleasedEmail` ao
   `billingEmail` e aos ADMINs: "O acesso da {empresa} ao Addere está liberado
   até {dd/mm/aaaa}. Se a fatura nº {N} não for paga até lá, o acesso volta a
   ser suspenso em {dia seguinte}." Falha no envio não desfaz a liberação: a
   resposta leva `emailSent: false`.
4. `getClientBlockState(companyId, now): ClientBlockState` e o campo `block` na
   resposta da ficha (`GET /admin/billing/clients/:companyId` do 013).
   `pendingNotice` é o aviso da fatura `OPEN` vencida mais antiga.
5. Situação do cliente: o 013 deixou em `deriveClientStatus` a entrada opcional
   `accessBlockReason`, "que existe a partir do plano 017". Em toda chamada da
   função na API (`grep -rn "deriveClientStatus" apps/api/src`), passe
   `accessBlockReason: resolveCompanyAccess(company).reason` (`OVERDUE`,
   `MANUAL`, `INACTIVE` ou `null`), o mesmo motivo do `authenticate`. A função
   já decide a precedência: cancelado e desativado aparece como cancelado;
   desativado sem contrato cancelado aparece como bloqueado. Para isso, as consultas dessas chamadas passam a
   trazer `active`, `accessBlockedAt` e `accessBlockReason`. A função em si não
   muda.
6. Testes — `apps/api/src/modules/billing/__tests__/client-access-routes.test.ts`:
   bloquear sem `note` → 400; bloquear grava `MANUAL` e o evento com o autor;
   ADMIN chamando qualquer das duas → 403; liberar com `until` no passado ou
   além de 90 dias → 400; liberar com `until` grava a data e o evento; a ficha
   devolve `block` com o aviso pendente; a lista de clientes mostra a situação
   `BLOCKED` para empresa bloqueada e para empresa inativa.

**Verificar**: `npm test --workspace=apps/api` → passa.

### Passo 6: A Inteligência pausa para empresa bloqueada

**Arquivo**: `apps/api/src/modules/intelligence/jobs/scheduler.ts`.

1. `listEnabledCompanies` (`:90-95`) mantém o `where` e acrescenta
   `accessBlockedAt: true` ao `select`. Empresa desativada já fica de fora pelo
   `active: true`.
2. Função pura exportada:

```ts
/**
 * Empresa bloqueada (plano 017, decisão 7): sem NIGHTLY nem REFRESH — sem custo
 * de IA. O PURGE continua uma vez por dia, porque o expurgo LGPD (GPS em 90
 * dias) mora dentro do NIGHTLY. Ao desbloquear, o NIGHTLY está vencido desde o
 * último dia em que rodou: o catch-up sai sozinho.
 */
export function selectJobsForTick(due: IntelJob[], blocked: boolean): IntelJob[] {
  if (!blocked) return due
  return due.includes('NIGHTLY') ? ['PURGE'] : []
}
```

3. No laço (`:118-140`), para empresa bloqueada, busque também
   `lastRunStartedAt(company.id, 'PURGE')` e passe ao `computeDueJobs`, como
   `lastNightlyAt`, o mais recente entre o último `NIGHTLY` e o último `PURGE`.
   Sem isso o `NIGHTLY` fica "vencido" o dia inteiro e o `PURGE` sairia a cada
   minuto. Depois, `for (const job of selectJobsForTick(due, blocked))`.
4. Testes — `apps/api/src/modules/intelligence/jobs/__tests__/scheduler-blocked.test.ts`,
   com `vi.mock('../run-job', () => ({ startJobRun: vi.fn() }))`:
   - `selectJobsForTick`: liberada devolve `due`; bloqueada com `NIGHTLY` →
     `['PURGE']`; bloqueada só com `REFRESH` → `[]`;
   - tick com empresa bloqueada e noturno vencido → `startJobRun` só com
     `'PURGE'`;
   - bloqueada com `PURGE` já rodado hoje → nenhum `startJobRun`;
   - empresa liberada com o último `NIGHTLY` de dias atrás → `NIGHTLY` e
     `REFRESH` (o catch-up).

**Verificar**: `npm test --workspace=apps/api -- scheduler` → passa, inclusive o
`scheduler.test.ts` existente sem alteração.

### Passo 7: Web — interceptor, sessão, faixa e tela de bloqueio

**Arquivos**: `apps/web/src/lib/api.ts`, `apps/web/src/lib/company-block.ts`
(novo), `apps/web/src/contexts/AuthContext.tsx`,
`apps/web/src/components/billing/BillingBanner.tsx` e
`CompanyBlockedScreen.tsx` (novos), `apps/web/src/hooks/useInvoices.ts` (016),
`apps/web/src/app/(admin)/layout.tsx`.

1. `lib/api.ts`: exporte `COMPANY_BLOCKED_EVENT = 'addere:company-blocked'` e
   reexporte `isCompanyBlockedError` de `@addere/types`. No interceptor de
   resposta, **antes** do teste do 401:

```ts
// 403 COMPANY_BLOCKED (plano 017): não é sessão inválida — nada de refresh nem
// logout. Avisa o AuthContext, que recarrega o /auth/me e troca a tela.
if (isCompanyBlockedError(error) && typeof window !== 'undefined') {
  window.dispatchEvent(new CustomEvent(COMPANY_BLOCKED_EVENT))
  return Promise.reject(error)
}
```

2. `AuthContext.tsx`:
   - `refreshUser(): Promise<void>` — `GET /auth/me` e `setUser`. Uma chamada por
     vez (promessa em andamento num `useRef`) e no máximo uma a cada 10 s, porque
     uma página com cinco queries dispara cinco eventos. Erro não desloga;
   - um `useEffect` que escuta `COMPANY_BLOCKED_EVENT` e chama `refreshUser`;
   - enquanto `user.company.access.blocked`, também recarrega no
     `visibilitychange` (a aba volta ao foco depois do pagamento);
   - exponha `companyAccess: CompanyAccess | null` e `refreshUser` no contexto.
3. `lib/company-block.ts` (puro):
   - `BLOCKED_ALLOWED_PREFIXES = ['/plano', '/contrato']`;
   - `isAllowedWhileBlocked(pathname, { isAdmin })` — só ADMIN, só esses
     prefixos;
   - `blockedNavGroups(groups)` — mantém só os itens cujo `href` começa com um
     dos prefixos e remove grupos vazios;
   - `billingBannerContent(status: BillingOverdueStatus, todayYmd: string)` →
     `{ tone: 'warning' | 'danger'; text: string } | null`, com os textos do
     "Esboço de tela". "Em N dias" sai de `todayYmd` contra a data prevista.
4. Hook `useBillingOverdue()` em `hooks/useInvoices.ts`, ao lado do
   `useMyInvoices` do 016: `GET /billing/me/overdue`, `staleTime` de 5 min,
   `enabled` só para ADMIN.
5. `BillingBanner` (ADMIN): usa o hook e `billingBannerContent`; tom de alerta
   com `bg-warning/5 border-warning/30 text-warning` e `AlertTriangle`; tom de
   perigo com `bg-danger/5 border-danger/30 text-danger`; botão "Ver Plano e
   cobrança" (`Button`, link para `/plano`). Hoje em São Paulo: helper que já
   exista em `lib/`, senão `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })`.
6. `CompanyBlockedScreen({ reason, isAdmin })`: ícone `Lock`, título e texto do
   esboço. ADMIN: botões "Ver Plano e cobrança" e "Verificar de novo"
   (`refreshUser`). Gerente: "Acesso da sua empresa suspenso. Fale com o
   administrador." e "Verificar de novo". Componentes de `components/ui`, cores
   por classes da marca e variáveis CSS, nenhum hex.
7. `(admin)/layout.tsx` (localize pelos nomes; o 013 ao 016 mudaram o arquivo):
   - `const blocked = !isSuperAdmin && companyAccess?.blocked === true`;
   - `navGroups` passa por `blockedNavGroups` quando `blocked`;
   - dentro do `<main>`, depois do spinner: `{isAdmin && <BillingBanner />}` e,
     no lugar de `children`,
     `blocked && !isAllowedWhileBlocked(pathname, { isAdmin }) ? <CompanyBlockedScreen … /> : children`.
8. Testes — `apps/web/src/lib/__tests__/company-block.test.ts`:
   `isCompanyBlockedError` (403 com o código → true; 403 sem código, 401 e erro
   sem resposta → false); `isAllowedWhileBlocked` (ADMIN em `/plano` e em
   `/contrato/abc/imprimir` → true; ADMIN em `/users` → false; gerente em
   `/plano` → false); `blockedNavGroups`; cada variação de
   `billingBannerContent`, inclusive "sem fatura vencida e liberada → null".

**Verificar**: `npm run type-check && npm run lint && npm test --workspace=apps/web`
→ exit 0; `npm run build:web` → exit 0.

### Passo 8: Web — ficha do cliente, Desativar empresa e Pacotes e regras

**Arquivos**: a ficha `apps/web/src/app/(admin)/gestao/clientes/[id]/` (013),
`ClientAccessCard.tsx`, `BlockClientModal.tsx` e `UnblockClientModal.tsx`
(novos, na mesma pasta), os hooks de gestão do 013,
`apps/web/src/app/(admin)/empresas/[id]/page.tsx`,
`apps/web/src/app/(admin)/dashboard/page.tsx` (se existir), a tela
`/gestao/pacotes`, o mapa de rótulos do Histórico.

1. `ClientAccessCard` no cabeçalho da ficha, com os estados do esboço, lendo o
   `block` do passo 5. Datas em `dd/mm/aaaa`.
2. Botões "Bloquear" (`danger-outline`) e "Liberar até…" (`outline`), com as
   regras de visibilidade do esboço.
3. `BlockClientModal` e `UnblockClientModal` com react-hook-form + zod, como
   `empresas/[id]/EntityModals.tsx`: o motivo com 10 a 500 caracteres; a data
   opcional, com `min` = hoje e `max` = hoje + 90. Hooks `useBlockClient(companyId)`
   e `useUnblockClient(companyId)`, que invalidam a ficha. Erro com
   `getApiErrorMessage`; sucesso com toast. Se a resposta de liberar vier com
   `emailSent: false`, o toast avisa "Liberado, mas o e-mail não saiu".
4. Histórico: em `BILLING_EVENT_LABELS` (`apps/web/src/lib/billing-ui.ts`, do
   013), os rótulos dos quatro tipos novos — "Aviso de suspensão enviado",
   "Lembrete de suspensão enviado", "Acesso bloqueado", "Acesso liberado". O
   `Record` obriga: sem eles, o type-check falha.
5. `empresas/[id]/page.tsx:113-121`: desativar passa a abrir o `ConfirmModal`
   da mesma pasta, com título "Desativar empresa", o texto do esboço e
   `confirmLabel="Desativar"`. Ativar continua sem confirmação.
6. `dashboard/page.tsx`: se o arquivo ainda existir, troque "Bloquear empresa"
   por "Desativar empresa" no `title` e no `aria-label` (`:91-92`), para não
   confundir com o bloqueio novo.
7. Pacotes e regras: ao lado do switch `autoBlockEnabled` (se o 013 não o pôs na
   tela, ponha), o texto: "Bloqueia o app e o painel de quem tem fatura vencida,
   sempre depois do aviso de 10 dias. Desligar libera os bloqueios por atraso
   no ciclo seguinte. Só ligue depois que a versão do app com a tela de acesso
   suspenso estiver no ar."

**Verificar**: `npm run type-check && npm run lint && npm run build:web` → exit 0.

### Passo 9: App — tela de acesso suspenso e fila que espera (só JavaScript)

**Arquivos**: `apps/mobile/src/lib/api.ts`, `src/lib/query-client.ts`,
`src/store/auth.store.ts`, `src/store/syncStore.ts`,
`src/services/syncEngine.ts`, `src/utils/authRedirect.ts` (novo),
`app/_layout.tsx`, `app/bloqueado.tsx` (novo).

1. `auth.store.ts`:
   - estado `companyBlocked: boolean` (inicial `false`) e ações
     `markCompanyBlocked()` e `recheckCompanyAccess()`;
   - `fetchMe` (`:87-100`): `set({ user: data, companyBlocked: data.company?.access?.blocked === true })`;
   - `hydrate` (`:154-155`): quando `partial.user` vier, `applySession` calcula
     `companyBlocked` do mesmo jeito (o usuário salvo no SecureStore vale
     offline no boot);
   - `clearAuth` (`:59-68`): `companyBlocked: false`;
   - `markCompanyBlocked`: `set({ companyBlocked: true })`;
   - `recheckCompanyAccess`: tenta `refreshSession()` (o access token pode ter
     vencido na tela de bloqueio); em erro, segue com o token atual; depois
     `fetchMe(token)`.
2. `src/lib/api.ts`, no começo do handler de erro (`:40`), **antes** do ramo do
   401 (`:46`):

```ts
// 403 COMPANY_BLOCKED (plano 017): a empresa está suspensa. Não é sessão
// inválida — nada de refresh nem logout; o AuthGuard leva para /bloqueado.
if (isCompanyBlockedError(error)) {
  useAuthStore.getState().markCompanyBlocked()
  return Promise.reject(error)
}
```

3. `syncStore.ts`: ação `requeue(id, error)` — `status: 'pending'`, `attempts`
   inalterado, `lastError: error`.
4. `syncEngine.ts`:
   - `isPermanentRejection` (`:21-24`) devolve `false` para
     `isCompanyBlockedError(err)`, antes do teste de status;
   - no `catch` de `processItem`, antes do ramo permanente: se for
     `COMPANY_BLOCKED`, `requeue(item.id, msg)` e devolva um sinal (por exemplo,
     `'company-blocked'`). Não chama `markError` (não gasta tentativa) nem manda
     evento ao Sentry;
   - em `processSyncQueue`, o laço (`:128-132`) para no primeiro
     `'company-blocked'`: os outros itens dariam o mesmo 403.
5. `query-client.ts`: o `retry` devolve `false` para `isCompanyBlockedError(error)`.
6. `src/utils/authRedirect.ts`:

```ts
export type AuthRedirect = '/(auth)/login' | '/(app)' | '/bloqueado'

export function resolveAuthRedirect(input: {
  authenticated: boolean
  companyBlocked: boolean
  firstSegment: string | undefined
}): AuthRedirect | null {
  const { authenticated, companyBlocked, firstSegment } = input
  if (!authenticated) return firstSegment === '(auth)' ? null : '/(auth)/login'
  if (companyBlocked) return firstSegment === 'bloqueado' ? null : '/bloqueado'
  if (firstSegment === '(auth)' || firstSegment === 'bloqueado') return '/(app)'
  return null
}
```

7. `app/_layout.tsx`, no efeito de `:126-146`: mantenha o retorno do
   `dev-preview`; troque o `if/else` por
   `const target = resolveAuthRedirect({ authenticated, companyBlocked, firstSegment: segments[0] })`
   e `if (target) router.replace(target)`. Acrescente `companyBlocked` ao que o
   componente lê do store e às dependências do efeito.
8. `app/bloqueado.tsx`, com `testID="screen-bloqueado"`: o layout do esboço;
   "Tentar novamente" (`testID="btn-bloqueado-tentar"`, com `loading`) chama
   `recheckCompanyAccess()` e, se continuar bloqueado, mostra "Ainda suspenso.";
   "Sair" (`testID="btn-bloqueado-sair"`, variante `ghost`) usa `useLogout()`
   de `src/hooks/useAuth.ts`. A linha da fila usa `useSyncStore(selectPendingCount)`.
   Também chama `recheckCompanyAccess()` quando o app volta ao primeiro plano
   (`AppState` `active`). Cores, espaçamento e tipografia de `src/theme`; ícone
   `Lock` do `lucide-react-native`; nenhum hex.
9. Testes Jest:
   - `src/services/__tests__/syncEngine.test.ts`: `isPermanentRejection` com 403
     `COMPANY_BLOCKED` → false; 403 sem código → true; 422 → true; 401 → false.
     `processSyncQueue` com dois itens e o primeiro recebendo 403
     `COMPANY_BLOCKED` → o primeiro volta a `pending` com `attempts` 0 e
     `lastError` preenchido, e o segundo não é enviado (`mockPost` uma vez só);
   - `src/store/__tests__/syncStore.test.ts`: `requeue` não soma tentativa;
   - `src/store/__tests__/auth.store.test.ts`: `markCompanyBlocked` liga;
     `fetchMe` com `access.blocked` true e false; `clearAuth` desliga; `hydrate`
     com usuário salvo bloqueado liga;
   - `src/utils/__tests__/authRedirect.test.ts`: sem sessão fora do login →
     login; sem sessão no login → nada; bloqueado em `(app)` → `/bloqueado`;
     bloqueado em `bloqueado` → nada; liberado em `bloqueado` → `(app)`;
     liberado em `(auth)` → `(app)`; liberado em `(app)` → nada; sem sessão em
     `bloqueado` → login;
   - `src/lib/__tests__/companyBlocked.test.ts`: `isCompanyBlockedError` com os
     mesmos casos do web.

**Verificar**: `npm run type-check && npm run lint && npm run test:unit --workspace=apps/mobile`
→ exit 0. `git diff --stat -- apps/mobile/app.config.js apps/mobile/eas.json apps/mobile/package.json`
→ vazio (nada nativo, nada de dependência nova).

### Passo 10: Documentação de operação

1. `docs/billing/README.md` (se não existir, crie só com esta seção), seção
   "Inadimplência e bloqueio": a regra do aviso (data =
   max(vencimento + dias, envio + 10)); o lembrete de 3 dias; o bloqueio
   automático e o switch como rollback; o bloqueio manual e quando usá-lo; a
   liberação com data; a baixa que libera na hora; `BILLING_JOBS_ENABLED`
   desligado (sem aviso, sem bloqueio e sem liberação automática — a baixa e o
   "Liberar" continuam funcionando); e a "Ordem de liberação" das notas abaixo.
2. `docs/intelligence/README.md`: na seção "Jobs", uma linha dizendo que empresa
   bloqueada não roda `nightly` nem `refresh`, só o `PURGE` diário, e retoma
   com catch-up; na seção "Retenção e LGPD", que o `PURGE` continua para
   empresa bloqueada.
3. `apps/mobile/docs/DEPLOY_CHECKLIST.md`, em "Testes manuais obrigatórios",
   um item novo: "Empresa bloqueada (staging): o app mostra 'Acesso suspenso',
   um pedido criado offline fica na fila sem falhar e é enviado depois da
   liberação."

**Verificar**: `npm run lint` → exit 0 (o Prettier não reclama do Markdown, se
estiver configurado para ele).

### Passo 11: Migration (por último)

1. Nome: `packages/db/prisma/migrations/<YYYYMMDDHHMMSS>_company_access_block/migration.sql`,
   com o timestamp do momento da execução, **posterior a `20261014120000` e a
   todas as migrations do 013 ao 016** (`ls packages/db/prisma/migrations | tail`).
2. Gere o delta contra o Postgres local limpo, nunca contra o Neon:

```bash
cd packages/db
DATABASE_URL=postgresql://addere_dev_user:addere_dev_password@localhost:5432/addere_017 \
DATABASE_URL_DIRECT=postgresql://addere_dev_user:addere_dev_password@localhost:5432/addere_017 \
npx prisma migrate diff \
  --from-migrations ./prisma/migrations \
  --to-schema-datamodel ./prisma/schema.prisma \
  --shadow-database-url postgresql://addere_dev_user:addere_dev_password@localhost:5432/addere_017_shadow \
  --script
```

   Ou escreva à mão. O resultado tem de ser só isto, com o comentário no topo,
   no padrão de `20261008180000_visit_remote_channel/migration.sql`:

```sql
-- Bloqueio de acesso da empresa (plano 017): por atraso (OVERDUE), só depois do
-- aviso de suspensão com 10 dias corridos, ou por decisão do superadmin
-- (MANUAL). O bloqueio é por rota e não apaga dado nenhum. Colunas novas e
-- nulas: toda empresa existente nasce liberada.

-- CreateEnum
CREATE TYPE "AccessBlockReason" AS ENUM ('OVERDUE', 'MANUAL');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "accessBlockedAt" TIMESTAMP(3),
ADD COLUMN     "accessBlockReason" "AccessBlockReason",
ADD COLUMN     "blockExemptUntil" DATE;
```

   A tabela é `companies` (`@@map` em `schema.prisma:115`), não `Company`.
3. Valide em banco limpo: apague e recrie `addere_017`, rode `migrate deploy`
   com o `DATABASE_URL` **e** o `DATABASE_URL_DIRECT` locais (sem o segundo, o
   Prisma lê o `packages/db/.env`, que aponta para o Neon) e depois o `migrate diff --from-url … --exit-code`
   da tabela de comandos. Ele tem de sair com 0, sem diferença.

**Verificar**: o `migrate deploy` aplica todas as migrations, inclusive a nova;
o `migrate diff` sai com 0; o `migration.sql` só tem `CREATE TYPE`,
`ALTER TYPE … ADD VALUE` e `ADD COLUMN` nulo.

Depois do passo 11, atualize a linha do 017 em `plans/README.md`.

## Plano de testes

**Automatizados** (todos descritos nos passos):

| Arquivo | O que prova |
|---|---|
| `apps/api/src/lib/__tests__/company-access.test.ts` | ausente e sem `active` não bloqueiam; `INACTIVE` tem precedência; bloqueio sem motivo vale `MANUAL` |
| `apps/api/src/middleware/__tests__/authenticate-company-block.test.ts` | 403 nas rotas de negócio e nos guards, inclusive `/uploads`; 200 em `/auth/me`, `/auth/me/permissions` e `/billing/me/*`; SUPERADMIN nunca bloqueado; empresa inativa bloqueada |
| `apps/api/src/modules/auth/__tests__/auth-company-block.test.ts` | login, refresh e logout nunca bloqueados, sem consultar a empresa |
| `apps/api/src/modules/billing/__tests__/overdue-block.test.ts` | data prevista com o piso de 10 dias; nunca bloqueia sem aviso nem antes de 10 dias, mesmo com `overdueBlockDays = 3`; liberação respeitada |
| `apps/api/src/modules/billing/__tests__/billing-mailer.test.ts` (016, casos novos) | o aviso é gravado só depois de o Resend aceitar; falha não grava |
| `apps/api/src/modules/billing/__tests__/overdue-block.service.test.ts` | data no e-mail; `dedupeKey`; envio que falha não vira aviso; baixa desbloqueia na mesma transação; `MANUAL` não é limpo; switch desligado libera `OVERDUE` |
| `apps/api/src/modules/billing/__tests__/client-access-routes.test.ts` | bloquear e liberar, validações e autoria |
| `apps/api/src/modules/intelligence/jobs/__tests__/scheduler-blocked.test.ts` | jobs da Inteligência pulam a bloqueada, `PURGE` continua, catch-up ao liberar |
| `apps/web/src/lib/__tests__/company-block.test.ts` | rotas liberadas, menu reduzido e textos da faixa |
| `apps/mobile/src/services/__tests__/syncEngine.test.ts` | `isPermanentRejection` com `COMPANY_BLOCKED`; a fila espera sem gastar tentativa |
| `apps/mobile/src/utils/__tests__/authRedirect.test.ts` | redirecionamento do `AuthGuard` |
| `apps/mobile/src/store/__tests__/auth.store.test.ts` e `syncStore.test.ts` | `companyBlocked` e `requeue` |

Os testes que já existem e mockam `{ active: true }` ou empresa sem `active`
passam **sem alteração**.

**De ponta a ponta no staging** (banco próprio; feito por quem opera, depois do
merge — o executor não publica nada):

1. API do 017 no staging, `BILLING_JOBS_ENABLED=true`, `autoBlockEnabled=false`.
   OTA do app no canal `preview`, com as três variáveis do `DEPLOY_CHECKLIST.md`
   apontando para o staging.
2. Numa empresa de teste com contrato ACTIVE, crie uma fatura avulsa vencida
   ontem e rode `POST /admin/billing/jobs/run`: chega o aviso com a data
   prevista, a pelo menos 10 dias; a faixa aparece para o ADMIN; a ficha mostra
   "Aviso enviado".
3. Num aparelho logado como vendedor da empresa, crie um pedido offline. Na
   ficha, "Bloquear" com motivo. Volte a ficar online: o app vai para "Acesso
   suspenso" e o pedido continua na fila, sem erro.
4. No painel: o ADMIN só abre `/plano` e `/contrato`; o gerente vê a tela de
   bloqueio. O login e o F5 continuam funcionando, sem loop.
5. "Liberar até…" com data: o app, em "Tentar novamente", volta ao normal e o
   pedido da fila é enviado. Chega o e-mail de liberação.
6. Ligue `autoBlockEnabled` **só no staging**. O bloqueio automático exige os 10
   dias do aviso; os testes automatizados cobrem a regra, e no staging dá para
   deixar a fatura do passo 2 correndo e conferir no dia previsto.
7. Dê baixa na fatura de uma empresa bloqueada por atraso: o acesso volta na hora.
8. Na tela Saúde dos dados da empresa bloqueada, o `nightly` e o `refresh` param
   e o `PURGE` aparece uma vez por dia; liberada, o `nightly` volta no horário.

## Critérios de conclusão

- [ ] `npm run type-check`, `npm run lint` e `npm test` na raiz saem com 0
- [ ] `npm run build:api` e `npm run build:web` saem com 0
- [ ] Os testes listados em "Estado atual" que mockam `{ active: true }` ou
      empresa sem `active` passam sem alteração (`git diff --stat` neles vazio)
- [ ] `grep -rn "jwtVerify" apps/api/src --include=*.ts | grep -v __tests__` só
      acha `middleware/authenticate.ts`
- [ ] `git diff --stat 80fe328..HEAD -- apps/api/src/modules/auth/auth.service.ts`
      vazio, e o diff de `auth.routes.ts` só toca `/me` e `/me/permissions`
- [ ] `grep -rn "accessBlockReason: 'OVERDUE'" apps/api/src --include=*.ts | grep -v __tests__`
      só acha `overdue-block.service.ts`
- [ ] `MIN_NOTICE_DAYS = 10` é constante de código, sem campo em
      `BillingSettings` nem na tela
- [ ] Nenhum lugar grava `autoBlockEnabled = true` (migration, seed ou código)
- [ ] A migration só tem `CREATE TYPE`, `ALTER TYPE … ADD VALUE` e `ADD COLUMN`
      nulo; `migrate deploy` em banco limpo e `migrate diff --exit-code` com 0
- [ ] `git diff --stat -- apps/mobile/app.config.js apps/mobile/eas.json apps/mobile/package.json`
      vazio
- [ ] `git diff --stat -- apps/api/src/lib/env.ts render.yaml` vazio (nenhuma
      env nova)
- [ ] Nenhum comando de banco contra o Neon e nenhum `.env` de banco criado no
      worktree
- [ ] Nenhum `eas build`, `eas update` ou push
- [ ] Linha de status do 017 atualizada em `plans/README.md`, com os nomes reais
      do 013 ao 016 que divergiram deste plano

## Condições de PARADA

- A checagem de deriva acusa mudança fora do esperado e o "Estado atual" não
  bate, ou falta algum item de "O que o 013 ao 016 deixam pronto".
- Parecer necessário bloquear o login, o refresh ou o logout, ou mexer em
  `auth.service.ts`, para o bloqueio funcionar.
- Um guard, hook ou rota autenticada que não passe pelo `authenticate`.
- Qualquer caminho que grave `accessBlockReason = 'OVERDUE'` sem um aviso
  entregue e gravado há ≥ 10 dias corridos, ou um teste de "nunca bloqueia"
  falhar e o conserto parecer exigir afrouxar o teste.
- Ligar `autoBlockEnabled`, ou usar o "Bloquear" manual, em produção antes de o
  OTA estar no ar. O executor não liga nada em produção.
- `/plano` ou `/contrato` dependerem de rota fora de `/auth/me` e
  `/billing/me/*`.
- Um teste existente que mocka `{ active: true }` ou empresa sem `active` quebrar
  e a correção parecer exigir mudar o mock: o código está tratando campo
  ausente como bloqueio.
- A migration sair com qualquer coisa além de `CREATE TYPE`,
  `ALTER TYPE … ADD VALUE` e `ADD COLUMN` nulo (sinal de schema local divergente).
- A mudança do app exigir algo nativo (plugin, permissão, `app.config.js`,
  dependência com código nativo): deixaria de ser OTA.
- Parecer necessário conectar no Neon para concluir qualquer passo.

## Notas de manutenção

### Ordem de liberação em produção (obrigatória)

1. **API no ar com `autoBlockEnabled=false`** (o padrão do 013). A migration vai
   junto, pelo `migrate deploy` do deploy. A partir daqui, empresa desativada
   (`active=false`) e bloqueio manual já cortam o acesso — por isso ninguém usa
   o "Bloquear" até o passo 3. Pela decisão 3, todas as empresas desativadas
   hoje são de teste.
2. **OTA no ar**, pelo `DEPLOY_CHECKLIST.md` (as três variáveis, canal
   `production`, runtime igual ao da loja). Confira num aparelho real: feche e
   reabra o app (o OTA só troca o bundle no restart). Dê alguns dias de uso
   para os aparelhos em campo reiniciarem o app.
3. **Ligar `autoBlockEnabled`** em Pacotes e regras.

O risco que essa ordem evita: o app antigo trata qualquer 4xx fora de 401, 408
e 429 como rejeição definitiva (`isPermanentRejection`). Um vendedor com app
antigo numa empresa bloqueada teria cada pedido da fila marcado como falho — o
mesmo modo de falha registrado no 011 no `plans/README.md`. Os pedidos não
somem (o "Reenviar" zera as tentativas), mas o vendedor teria de reenviar um a
um depois da liberação, e cada item geraria um aviso no Sentry. A ordem
contrária é inofensiva: o app novo contra a API velha nunca recebe
`COMPANY_BLOCKED` e não vê `access` no `/auth/me`, então nada muda.

### O resto

- **Promessas do contrato.** `MIN_NOTICE_DAYS` e o "só conta o aviso entregue"
  são o que o contrato promete. Mudar qualquer um dos dois exige mudar o
  contrato antes, por aditivo.
- **Desligar `autoBlockEnabled` é o rollback.** No tick seguinte (até 1 hora),
  todo bloqueio `OVERDUE` é liberado. Os `MANUAL` ficam.
- **`BILLING_JOBS_ENABLED` desligado** para os avisos, os lembretes, o bloqueio
  e a liberação automáticos. A baixa e o "Liberar" continuam liberando na hora.
- **A data prevista não se move.** Mudar `overdueBlockDays` vale só para avisos
  futuros. Para adiar uma suspensão já avisada, use "Liberar até…".
- **O que continua para empresa bloqueada:** o sync do Protheus e o `PURGE` da
  Inteligência. O que para: `nightly` e `refresh` (e, com eles, o custo de IA).
- **Rota nova liberada para empresa bloqueada** só com `allowBlockedCompany`, e
  só para o que o contrato manda manter acessível (contrato e cobrança). `/help`
  e `/pilot/events` ficam bloqueados de propósito.
- **App antigo instalado** em empresa bloqueada: telas com erro de permissão e
  fila marcando falha. É a janela que a ordem de liberação fecha.
- **O 018** lê `accessBlockedAt`, `accessBlockReason` e o aviso pendente para a
  situação "bloqueado" e "vencido" do painel. Reaproveite `getClientBlockState`
  em vez de recalcular.
- **Corrida baixa × tick.** O bloqueio usa `updateMany` com filtro de relação
  (fatura ainda `OPEN`). Se a baixa e o tick se cruzarem com a transação da
  baixa ainda aberta, a empresa pode ficar bloqueada até o tick seguinte, que a
  libera. A janela é de no máximo um tick.
- **Quem revisar** deve olhar, nesta ordem: (1) `overdueBlockHolds` e o aviso
  gravado só depois do envio; (2) o `authenticate`, a lista de exceções e o
  `active === false`; (3) a fila do app, que não pode gastar tentativa nem
  marcar falha com `COMPANY_BLOCKED`.
