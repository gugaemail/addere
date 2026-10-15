# Plano 014: Contrato de licença de uso e aceite eletrônico no painel

> **Instruções para o executor**: siga este plano passo a passo. Rode cada
> comando de verificação e confirme o resultado esperado antes de ir para o
> passo seguinte. Se acontecer qualquer coisa listada em "Condições de PARADA",
> pare e reporte — não improvise. Ao terminar, atualize a linha de status deste
> plano em `plans/README.md`.
>
> **Checagem de deriva (rode primeiro)**:
> `git diff --stat 80fe328..HEAD -- apps/api/src/app.ts apps/api/src/lib/env.ts apps/api/src/lib/rate-limit.ts apps/api/src/modules/auth/ apps/api/src/modules/intelligence/admin/config.routes.ts apps/api/src/modules/intelligence/admin/__tests__/admin-routes.test.ts apps/web/src/components/intel/IntelConfigForm.tsx 'apps/web/src/app/(admin)/configuracoes/page.tsx' 'apps/web/src/app/(admin)/layout.tsx' apps/web/src/hooks/useIntel.ts apps/web/src/contexts/AuthContext.tsx packages/types/src/index.ts packages/db/prisma/schema.prisma render.yaml .env.example apps/api/.env.example`
>
> Este plano depende do 013, então **espere** diferença causada por ele em
> `schema.prisma`, `app.ts`, `(admin)/layout.tsx` e `packages/types/src/index.ts`.
> Fora isso, se algum arquivo mudou, compare os trechos de "Estado atual" com o
> código vivo antes de prosseguir; se não bater, trate como condição de PARADA.

## Status

- **Prioridade**: P1
- **Esforço**: L
- **Risco**: ALTO — grava um aceite com valor de prova, muda quem liga a
  Inteligência e muda o `request.ip` de toda a API
- **Depende de**: 013 (mergeado na `staging` antes de começar)
- **Categoria**: feature (gestão comercial)
- **Planejado em**: commit `80fe328` (`origin/staging`), 2026-10-15
- **Entrega**: vai para produção **junto com o 013**. Sem o aceite, o contrato
  do 013 nunca sai do rascunho.

## Por que isso importa

O 013 cria o cadastro do cliente e o contrato em rascunho (`CompanyContract` em
DRAFT, `ContractTerms` em PROPOSED). Nada mais acontece depois disso: não existe
texto de contrato, não existe envio e não existe aceite. Sem este plano:

1. **Nada começa.** Limite de licenças (015), cobrança (016) e Inteligência pelo
   contrato dependem de um contrato ACTIVE, e só o aceite deixa um contrato
   ACTIVE.
2. **O aceite não valeria como prova.** Ele precisa registrar quem aceitou,
   quando, de qual IP, com qual navegador e o hash do texto congelado. Hoje a
   API não enxerga o IP de quem chama: o `Fastify({...})` não liga
   `trustProxy`, e atrás do proxy do Render o `request.ip` tende a ser o IP do
   proxy. O registro gravaria o mesmo IP para todo mundo.
3. **O recurso pago é self-service.** O ADMIN do cliente liga a Inteligência
   sozinho em `/configuracoes` (`IntelConfigForm.tsx:92`).
4. **Os documentos públicos contradizem o modelo comercial.** Os Termos de Uso
   do site (`termos.html`, seção 7) dizem "cobrado por representante ativo por
   mês". Publicar o contrato sem alinhar Termos e Privacidade cria dois
   documentos públicos que se contradizem.

### Regras que este plano implementa (decisão de produto de 15/10/2026)

- **Contrato de licença de uso.** Duas partes: **condições gerais**, texto fixo e
  versionado, e **quadro-resumo**, gerado do cadastro e do contrato. O modelo é
  editável no painel. Vai ao ADMIN por e-mail com link; o ADMIN lê no painel e
  aceita. Ficam registrados quem aceitou, a data e a hora, o IP, o navegador e o
  SHA-256 do texto. O PDF sai pela impressão do navegador.
- **Antes do aceite, nada começa**: sem limite, sem mudança na Inteligência, sem
  cobrança. A data de início do contrato é a data do aceite.
- **Aditivos.** Troca de pacote, de tipo ou de valor gera um aditivo, que o
  ADMIN aceita do mesmo jeito. Até o aceite valem os termos anteriores.
- **Alterações e reajuste.** Qualquer alteração (pacote, tipo, valor, reajuste
  ou nova versão das condições gerais) só vale depois do aceite de um aditivo.
  Aumento de preço é comunicado com no mínimo 30 dias de antecedência, e o
  cliente que não concordar cancela sem ônus.
- **Tipo de licença.** Por empresa: Padrão (sem Inteligência) ou Com
  Inteligência. O contrato passa a ligar e desligar a Inteligência; o ADMIN não
  liga mais.
- **Piloto.** Empresa em piloto fica sem contrato: nada deste plano se aplica a
  ela.
- **Decisão 1.** Empresa sem contrato aceito continua como hoje. Na
  Inteligência, isso quer dizer: o SUPERADMIN continua ligando à mão (é a
  implantação e o teste).
- **Decisão 8.** Quem opera é o papel SUPERADMIN atual, e o histórico registra
  quem fez cada ação.
- **Decisão 9.** Licença extra lançada pelo superadmin sem pedido do ADMIN gera
  aditivo. O aditivo é deste plano; o pedido de licenças é do 015.
- **Decisão 10 (revista em 15/10/2026): administrador indicado.** Só o
  administrador indicado pela Empresa aceita o contrato e os aditivos (e, no
  015, pede licenças adicionais). O superadmin escolhe o indicado num select da
  aba Contrato, entre os ADMINs ativos da empresa, e só cria usuário ADMIN por
  indicação da Empresa (processo). O e-mail do envio vai só para o indicado.
  Os outros ADMINs veem o documento só para leitura, com "Aguardando o aceite
  de {nome}". Sem indicado, o envio é recusado. A regra anterior (qualquer
  ADMIN ativo aceitava e o e-mail ia para todos) deixou de valer. Detalhes na
  decisão de desenho 10.
- **Decisão 11.** Mexer no rascunho depois de enviar cancela o documento
  enviado, que precisa ser gerado e enviado de novo. Assim o texto aceito é
  sempre o dos termos gravados. Trocar o administrador indicado com documento
  enviado também cancela o documento, porque o nome dele está no texto.

### Decisões de desenho deste plano

1. **O hash é do Markdown preenchido** (`renderedBody`), não do HTML. O servidor
   calcula com `node:crypto` ao criar o documento. O navegador recalcula com Web
   Crypto sobre o texto que vai exibir, compara com o gravado antes de habilitar
   o "Aceitar" e envia o hash que **ele** calculou. Assim o aceite prova que o
   texto exibido é o gravado, e não só que o documento não mudou entre o GET e o
   POST.
2. **`trustProxy` por número de saltos, não `true`.** Com `true`, o Fastify
   confia em toda a cadeia do `X-Forwarded-For` e o `request.ip` vira a entrada
   mais à esquerda — que o próprio cliente pode escrever. Com um número N, ele
   confia só nos N proxies mais próximos, e a entrada forjada à esquerda é
   ignorada. O número vem da env nova `TRUST_PROXY_HOPS` (padrão 1), porque a
   quantidade de saltos do Render só se confirma no staging.
3. **Termos com data futura precisam de quem os aplique.** Um aditivo com "vale
   a partir de" no futuro muda a Inteligência naquela data. Uma função única,
   `syncIntelligenceWithTerms`, roda no aceite e num ticker horário mínimo
   (`apply-due-terms.ts`). Esse ticker não cobra nem avisa ninguém; o 016 o
   absorve no agendador de cobrança.
4. **A impressão fica dentro do layout do painel**, com `print:hidden` na
   sidebar e na barra do celular. Uma rota fora de `(admin)` com o mesmo prefixo
   `/contrato` arriscaria conflito de rotas no Next.
5. **Moeda formatada à mão, sem `Intl`.** O texto congelado não pode depender da
   versão do ICU do Node: `Intl` usa espaço não separável, e a versão do ICU
   muda o caractere. O formatador fica em `packages/types/src/billing.ts`, onde
   o 015 vai procurá-lo.
6. **Aditivo que leva às condições gerais novas** carrega, no mesmo documento e
   no mesmo hash, o aditivo e, como anexo, o contrato consolidado na versão
   nova. A minuta do aditivo deixou esse mecanismo para este plano decidir
   (aviso do `aditivo-contratual-v1.md`, item 2). O aditivo v1 diz, no §4.1,
   que "as demais cláusulas do Contrato permanecem inalteradas", então ele
   **não serve** para levar às condições novas: o mecanismo só pode ser usado
   com uma versão do aditivo que preveja o anexo, validada pelo advogado.
7. **"Aumenta preço"** segue o texto da minuta (contrato §13, 2º parágrafo, e
   aditivo §3.3): sobe o valor do pacote (`packagePrice`), **ou** sobe o valor
   unitário da licença adicional (`extraSeatPrice`), **ou** o aditivo leva às
   condições gerais novas. Nesses casos o "vale a partir de" é obrigatório e
   fica ≥ data do envio + 30 dias. Acrescentar licenças adicionais pelo mesmo
   valor unitário aumenta o total mensal, mas não é aumento de preço: vale no
   aceite. **Aditivo a pedido da Empresa (decisão da revisão de 15/10/2026):**
   o formulário tem a caixa "A pedido da Empresa Contratante". Marcada, o
   aditivo vale no aceite mesmo com aumento de preço: a antecedência de 30
   dias protege a Empresa contra aumento unilateral e não se aplica quando é
   ela quem pede (o caso típico é o upgrade Padrão → Com Inteligência). Com a
   caixa marcada, o motivo é obrigatório e diz o que a Empresa pediu; ele entra
   no texto do aditivo por `{{aditivo.motivo}}`, que a Empresa aceita. A caixa
   é gravada em `ContractTerms.requestedByClient` (coluna nova deste plano) e
   no `BillingEvent`. O §13 da minuta prevê a exceção, com marca `[[REVISAR]]`.
   A caixa **não** vale para levar às condições gerais novas, que sempre
   esperam 30 dias.
8. **Autor sem chave estrangeira.** `sentById`, `acceptedById` e os demais ids
   de autor são colunas simples. O 013 usa relação com `User` em
   `ContractTerms.createdById` e `BillingEvent.actorId`; aqui não, porque o
   registro de aceite congela nome e e-mail, e seriam cinco relações inversas a
   mais em `User`. Usuário nunca é apagado fisicamente (soft delete). A
   exceção é o administrador indicado (decisão de desenho 10), que não é autor:
   é um ponteiro vivo que o envio, o aceite e o pedido de licenças leem.
9. **"Vale a partir de D" é gravado como 00:01 de São Paulo do dia D.** Na
   revisão de 15/10/2026, o resolvedor do 013 passou a contar, na competência
   M, só os termos com `effectiveFrom` **estritamente anterior** às 00:00 do
   dia 1 de M (nota "A fronteira do dia 1" do 013). Por isso 00:00 já
   cumpriria o §6.4 da minuta ("a competência em que ela passa a valer é
   cobrada pelas condições anteriores"); as 00:01 ficam como margem. Um
   aditivo que vale em 01/12 tem dezembro pelas condições anteriores e janeiro
   pelas novas. Limite e Inteligência mudam às 00:01, o que não faz diferença
   na prática.
10. **Administrador indicado** (decisão 10, revista em 15/10/2026).
    - **Onde mora:** coluna nova `CompanyContract.designatedAdminId`, com chave
      estrangeira para `User` (a exceção da decisão de desenho 8). A chave
      impede apontar para usuário que não existe.
    - **Quem escolhe:** o superadmin, num select próprio da aba Contrato, fora
      do formulário de rascunho do 013. O select precisa funcionar também com o
      contrato ACTIVE: se o indicado sai da empresa, os aditivos e os pedidos
      de licenças (015) ficam travados até a troca.
    - **Troca com documento SENT** cancela o documento (decisão 11), seja
      contrato, seja aditivo: o nome do indicado está no texto dos dois (o
      contrato o imprime no quadro-resumo e o aditivo v1.1, nas partes).
    - **Uma função confere quem aceita e quem pede:** `assertDesignatedAdmin`.
      Ela relê o usuário no banco, porque o `role` do JWT vale por 8 horas
      (`plugins/jwt.ts:18`). O `authenticate` relê só o `active`
      (`middleware/authenticate.ts:16-22`), então um indicado rebaixado a
      vendedor ainda carrega `role: 'ADMIN'` no token até ele expirar.
    - **E-mail do envio só para o indicado, sem cópia ao `billingEmail`.** O
      e-mail pede uma ação e leva a uma tela que só o indicado usa: para
      qualquer outro, seria um link sem saída. O contato de cobrança muitas
      vezes nem é usuário do painel. Ele recebe a confirmação do aceite (passo
      8), que é quando algo muda para a cobrança.
    - **O 422 `COMPANY_HAS_NO_ADMIN` sai.** Empresa sem ADMIN é um caso de "sem
      indicado", porque o select fica vazio. O envio recusa com
      `DESIGNATED_ADMIN_REQUIRED`, e a tela explica que falta criar o
      administrador.
    - **Criação de ADMIN.** O superadmin só cria usuário ADMIN por indicação da
      Empresa (processo, no `docs/billing/README.md`). Este plano não trava a
      criação de ADMIN pelo próprio cliente (ver "Quem cria ou promove ADMIN
      hoje", no Estado atual). Como o indicado só muda pelo select do
      superadmin, um ADMIN criado pelo cliente não aceita nada nem pede
      licenças.

## Estado atual

Conferido no commit `80fe328`.

**API**

- `apps/api/src/app.ts:34-38` — o Fastify nasce sem `trustProxy`:

  ```ts
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  })
  ```

- `apps/api/src/app.ts:46-47` — `@fastify/rate-limit` registrado com
  `global: false`; o login liga por rota em
  `apps/api/src/modules/auth/auth.routes.ts:35-48` (10 por minuto "por IP"). A
  chave padrão do plugin é `request.ip`.
- `apps/api/src/lib/rate-limit.ts:37` — o limitador próprio usa
  `request.user?.sub ?? request.ip`. Sem `trustProxy`, quem não está autenticado
  divide o balde do IP do proxy.
- `apps/api/src/app.ts:88-103` — registro das rotas; `:108-119` — o hook
  `onReady`, onde os schedulers sobem sem poder bloquear o boot.
- `apps/api/src/lib/env.ts:3-31` — schema de env. `RESEND_API_KEY` (`:14`) e
  `WEB_URL` (`:30`) são opcionais.
- `apps/api/src/modules/auth/auth.service.ts:72-108` — o padrão de e-mail que
  este plano copia: `WEB_URL` com fallback (`:72`), aviso e retorno quando falta
  `RESEND_API_KEY` (`:85-88`), `new Resend(...)` com
  `from: 'Addere <noreply@addere.com.br>'` (`:90-104`) e `try/catch` que só
  registra a falha (`:105-107`). O SDK é o `resend` 4.8, que **devolve**
  `{ data, error }` em vez de lançar erro de API: confira o `error`.
- `apps/api/src/modules/auth/auth.routes.ts:140-194` — `GET /auth/me`. O objeto
  `company` da resposta (`:186-191`) tem só `intelligenceEnabled` e
  `defaultTone`.
- `apps/api/src/modules/intelligence/admin/config.routes.ts` — a configuração
  da Inteligência:
  - `:21-27` — `putSchema` com `.strict()`, que aceita `intelligenceEnabled`;
  - `:37-44` — o GET devolve `{ intelligenceEnabled, config }`;
  - `:46-67` — o PUT grava `intelligenceEnabled` sempre que ele vem no corpo,
    para quem tem `intel.admin` (o ADMIN nasce com ela) e para o SUPERADMIN.
- `apps/api/src/modules/intelligence/admin/__tests__/admin-routes.test.ts:571-584`
  — o teste "PUT config liga a camada e persiste o merge" usa um ADMIN
  (`admin-a`) que liga a Inteligência. **Este plano muda essa regra de
  propósito**: o teste passa a ser outro (passo 9).
- Quem escreve `intelligenceEnabled` hoje: o PUT acima e dois scripts de
  dados sintéticos (`apps/api/scripts/intel-smoke.ts:36` e
  `apps/api/scripts/seed-demo-tenant.ts:59-64`). Quem lê: `require-vendor-code.ts`,
  os jobs (`scheduler.ts:92`), o motor e o `/auth/me`. Nenhum leitor muda.
- `apps/api/src/middleware/require-company.ts:23-40` — `requireCompanyScope`
  aceita ADMIN e SUPERADMIN. Não existe guard "só ADMIN da própria empresa".
- **Quem cria ou promove ADMIN hoje** (conferido em 15/10/2026, para a regra
  do administrador indicado):
  - pelo `/users`, que é o caminho do painel, só o SUPERADMIN. O
    `users.routes.ts:45-57` devolve 403 ao ADMIN que cria administrador, e o
    `:82-87`, ao que promove. O `UserFormModal.tsx:85-91` nem mostra a opção;
  - pelo `/companies/:id/users`, o ADMIN da empresa **consegue**. O `POST` e o
    `PATCH /companies/:id/users/:userId` (`companies.routes.ts:132-147`) usam
    `requireCompanyScope()` desde o `1a52ac8` (02/10/2026). O
    `createCompanyUserSchema` (`companies.schema.ts:50-60`, e o `partial()`
    dele no update) aceita `role: 'ADMIN'`. Nenhuma tela chama essas rotas (só
    o `useCreateUser`, que é código morto), mas uma chamada direta à API passa;
  - pelas duas rotas, um ADMIN também desativa outro ADMIN da mesma empresa,
    rebaixa-o a vendedor ou troca o e-mail e a senha dele.

  **Este plano não trava nada disso** (decisão de desenho 10). O indicado só
  muda pelo select do superadmin, e o aceite relê o indicado no banco
  (`assertDesignatedAdmin`). Um ADMIN que troque a senha do indicado e entre
  como ele fica fora do alcance do sistema: é confiança interna da Empresa,
  igual à de hoje. O registro de aceite congela nome, e-mail, IP e navegador, e
  a confirmação vai ao contato de cobrança e à Addere. Fechar o
  `/companies/:id/users` para o ADMIN, como o `/users` já faz, fica como
  pendência registrada no passo 14 e nas Notas de manutenção.
- `apps/api/src/lib/errors.ts:3-14` — `AppError` sem `code`. **O 013 acrescenta
  o `code`** e o `getApiErrorCode` do web; este plano usa os dois.
- `apps/api/src/modules/intelligence/jobs/scheduler.ts:155-162` —
  `initIntelScheduler`: o padrão de ticker (desligado em `test`, tick no boot,
  `setInterval(...).unref()`).
- `apps/api/src/test-utils/prisma-mock.ts:63-65` — o `$transaction` do mock
  executa a função com o próprio mock; os testes de transação se apoiam nisso.
- `render.yaml:12-35` (produção) e `:46-67` (staging) — **não declaram**
  `WEB_URL` nem `RESEND_API_KEY`. Se o painel do Render também não tiver
  `WEB_URL`, o link do e-mail cai no fallback `https://addere-web.vercel.app`
  (`auth.service.ts:72`), enquanto o `CORS_ORIGIN` de produção é
  `https://addere.vercel.app`.

**Banco**

- `packages/db/prisma/schema.prisma:8-12` — o datasource tem
  `directUrl = env("DATABASE_URL_DIRECT")`. **O `prisma migrate` usa o
  `directUrl`.** `packages/db/.env` e `apps/api/.env` existem e apontam para
  banco real: todo comando de migration local precisa das **duas** variáveis
  apontando para `localhost`.
- `packages/db/prisma/schema.prisma:56-116` — `Company`; `:80` —
  `intelligenceEnabled`.
- `packages/db/prisma/migrations/` — a mais recente em `80fe328` é
  `20261014120000_intel_llm_calls`. A do 013 virá depois dela.
- `docker-compose.yml:2-17` — Postgres 16 local (`addere_dev_user` /
  `addere_dev_password` / `addere_dev`).

**Tipos e web**

- `packages/types/src/index.ts:23-43` — `UserPublic`; `:34` — `company` tem só
  `intelligenceEnabled` e `defaultTone`. `packages/types` não tem test runner:
  funções puras dele são testadas no Vitest da API.
- `apps/web/src/components/intel/IntelConfigForm.tsx`:
  - `:70-79` — o `handleSave` manda `intelligenceEnabled: enabled` (`:71`) em
    **todo** salvamento;
  - `:92-96` — o `Switch` "Camada de Inteligência ligada para esta empresa".
  O mesmo formulário serve ao SUPERADMIN, na aba Inteligência de Empresas
  (`empresas/[id]/tabs/IntelligenceTab.tsx:14`, com `companyIdOverride`).
- `apps/web/src/app/(admin)/configuracoes/page.tsx:3-6` (comentário) e `:33-36`
  (subtítulo) — dizem que o ADMIN liga a Inteligência.
- `apps/web/src/hooks/useIntel.ts:139-142` — `ConfigResponse`; `:337-339` —
  `SaveIntelConfigInput`.
- `apps/web/src/app/(admin)/layout.tsx:61-170` — `NAV_GROUPS`; o grupo Empresa
  vai de `:132` a `:169`. `:312` — `<aside>`; `:405` — barra superior do
  celular; `:425` — `<main>`.
- `apps/web/src/contexts/AuthContext.tsx:8-20` — não há função para recarregar o
  `/auth/me` depois do login.
- `apps/web/src/middleware.ts:14-21` — sem sessão, manda ao login com `?next=`:
  o link do e-mail volta para o documento depois do login.
- `apps/web/tailwind.config.ts:73` — `plugins: []`: não há plugin de tipografia
  nem CSS de impressão no projeto.

**O que o 013 entrega e este plano usa** (não existe em `80fe328`; os nomes
abaixo são os de `plans/013-cadastro-de-clientes-e-contratos.md`, passos 1 a
9. Confira no código mergeado antes de começar):

- **Schema** (tabelas com prefixo `billing_`):
  - enums `LicenseType` (`STANDARD`, `INTELLIGENCE`), `ContractStatus`,
    `ContractTermsStatus`, `ContractTermsOrigin`;
  - `LicensePackage` (`code`, `name`, `seats`), tabela
    `billing_license_packages`;
  - `ClientProfile`, 1:1 por `companyId`: `legalName`, `tradeName`,
    `stateRegistration`, `addressStreet`, `addressNumber`,
    `addressComplement`, `addressDistrict`, `addressCity`, `addressState`,
    `addressZip` (só dígitos), `legalRepName`, `legalRepCpf` (só dígitos),
    `legalRepRole`, `contactName`, `contactEmail`, `contactPhone`,
    `billingContactName`, `billingEmail`, `billingPhone`, `notes`;
  - `CompanyContract` (`companyId @unique`, `status`, `startDate @db.Date`,
    `graceMonths`, `firstBilledCompetence @db.Date`, `dueDay`,
    `overdueBlockDays`, `seatGuardVersion`), tabela
    `billing_company_contracts`. Este plano acrescenta `designatedAdminId`
    (passo 4);
  - `ContractTerms` (`contractId`, `version` por contrato, `status`, `origin`,
    `proposedEffectiveFrom DateTime?` — instante, não `@db.Date` —,
    `effectiveFrom`, `packageId`, `licenseType`, `includedSeats`,
    `extraSeats`, `packagePrice`, `extraSeatPrice`, `reason String?`,
    `createdById`), tabela `billing_contract_terms`;
  - `BillingEvent` (`type String`, `companyId String?` — nulo nos eventos
    globais —, `actorId`, `payload`, `dedupeKey`) e `BillingSettings`
    (`overdueBlockDays`, `notifyEmail`).
- **`packages/types/src/billing.ts`**: `computeBillingCalendar`,
  `resolveCurrentTerms`, `resolveCompetenceTerms`, `competenceStartInstant`,
  `contractMonthlyTotal` (dinheiro como string `'1234.56'`),
  `formatBillingDate` (lê `@db.Date` em UTC), `BILLING_EVENT_TYPES`,
  `BillingErrorCode` e os DTOs. A conversão instante → dia civil de São Paulo
  (`civilDateInSaoPaulo`) e o `toCents` são internos, sem `export`.
- **API**: `AppError(status, message, details?, code?)` e os atalhos
  `forbidden(message, code)`, `conflict(message, code)`,
  `unprocessable(message, details, code)`; o módulo
  `apps/api/src/modules/billing/` com `billing.routes.ts`
  (`billingAdminRoutes`, prefixo `/admin/billing`, todas com
  `requireSuperAdmin`), `billing-events.ts` (`recordBillingEvent(db, { type,
  companyId, actorId, fields, ref? })`, com `ref` restrito a identificadores
  que não são dado pessoal), `clients.service.ts` e `contract.service.ts`
  (`saveContractDraft`). O passo 4 do `saveContractDraft` recusa contrato fora
  de DRAFT com 409 `CONTRACT_NOT_DRAFT`, e o 013 avisa que este plano muda isso
  para PENDING_ACCEPTANCE.
- **Web**: `getApiErrorCode` em `lib/api.ts`; o requisito `'companyAdmin'` em
  `lib/nav-gating.ts`; o grupo Gestão Addere em `NAV_GROUPS` (Clientes,
  Pacotes e regras, Piloto); `hooks/useBilling.ts` (`billingKeys`);
  `lib/billing-ui.ts` (`BILLING_EVENT_LABELS: Record<BillingEventType,
  string>`, que não compila sem rótulo para tipo novo); a ficha
  `gestao/clientes/[id]/page.tsx` com `tabs/ContratoTab.tsx`, que fica só
  leitura fora de DRAFT.

**Os textos do contrato** (`docs/billing/`, escritos na branch de docs junto
com este plano):

- `contrato-licenca-de-uso-v1.md` (versão 1.1-minuta, com as decisões de
  15/10/2026) — o corpo fica entre `<!-- INÍCIO DO TEXTO PUBLICÁVEL -->` (hoje
  `:265`) e `<!-- FIM DO TEXTO PUBLICÁVEL -->` (hoje `:514`). O aviso de minuta
  (`:17-189`) traz uma tabela de promessas com 24 linhas: as 8 do plano
  aprovado mais 16 que a minuta acrescentou. As linhas 21 a 23 são a meta de
  disponibilidade de 99,5 % (§9.7 a §9.10), e a 24 é o administrador indicado.
  O quadro-resumo imprime o administrador indicado
  (`{{cliente.administradorNome}}` e `{{cliente.administradorEmail}}`). O §14.1
  diz que o aceite é do administrador indicado no quadro-resumo, e o §8.8 traz
  o encarregado com o nome completo.
- `aditivo-contratual-v1.md` (versão 1.1-minuta) — corpo entre os mesmos
  marcadores (hoje `:75` e `:135`). A seção "Notas para o plano 014"
  (`:60-71`) pede que `aditivo.valeAPartirDe` nunca saia vazio. As partes
  nomeiam o administrador indicado, com os mesmos dois campos.
- Conferido em 15/10/2026: os dois usam só campos da lista fechada, nenhum
  `aditivo.*` no contrato, e o corpo só tem títulos, listas, parágrafos e
  negrito. O corpo do contrato tem 55 marcas `[[REVISAR`, e o do aditivo, 9.

**Repo do site** (`c:\Projetos-Claude\sites\addere`, outro repositório)

- **Já na `master`** (commit `ec49444`, 15/10/2026, feito por outra pessoa):
  razão social "GH ENGENHARIA LTDA - ME" em `termos.html` (`:136`, `:225` e o
  rodapé `:281`), `privacidade.html` (`:136`, `:153` e o rodapé `:274`) e
  `index.html` (`:2408` e `:2503`). Também o encarregado com o nome completo,
  Gustavo Henrique Palitot Costa, na seção 12 da Privacidade (`:243`), o
  `CLAUDE.md:182` com "- ME" e o `lastmod` 2026-10-15 nas três URLs do
  `sitemap.xml`. As linhas não mudaram de lugar.
- `termos.html:127` — "Última atualização: 11/09/2026" (o `ec49444` não mudou
  a data).
- `termos.html:139` — "contrato assinado"; `:152` — "Quando a Empresa
  Contratante liga a Camada de Inteligência".
- `termos.html:176-179` (seção 7) — "cobrado por representante ativo por mês".
- `termos.html:218-221` (seção 13) — só o papel de operador.
- `termos.html:228-231` (seção 15) — exclui "indisponibilidade do ERP, da
  internet ou de provedores de terceiros".
- `termos.html:233-236` (seção 16) — suspensão por inadimplência "com aviso
  sempre que possível", sem prazo, e encerramento que "segue a proposta
  comercial".
- `termos.html:238-241` (seção 17) — alterações com "antecedência razoável".
- "Proposta comercial" aparece nos Termos em `:139`, `:178`, `:215`, `:235` e
  `:245`. O contrato passa a ser o documento comercial.
- `privacidade.html:127` (data), `:156-174` (seção 3), `:176-179` (seção 4),
  `:181-199` (seção 5; `:192`, a linha do Resend), `:211-220` (seção 8). Na
  Privacidade, a divisão controladora × operador hoje está na seção 2
  (`:149-151`); a seção 5 é "Compartilhamento".
- `termos.html:16-102` e `privacidade.html:16-102` — o `<style>`, idêntico
  byte a byte.
- **Fora do escopo, mas afetado:** `index.html:2153` diz que a Inteligência "é
  ligada … pelo administrador da própria empresa, em Configurações", e
  `index.html:2221-2235` desenha esse switch. Depois deste plano, isso deixa de
  ser verdade. A correção está sendo feita na branch
  `landing/inteligencia-pelo-contrato` do site, que vai ao ar junto com o 014
  (passo 16 e Notas de manutenção).

## Esboço de tela

**Gestão Addere › Modelos de contrato** (`/gestao/modelos`, SUPERADMIN)

```
┌ Modelos de contrato ───────────────────────────────────────────────────────┐
│ [ Contrato ]  [ Aditivo ]                                                   │
│                                                                             │
│ Versões                                                                     │
│  v2  Rascunho   criado por Gustavo em 22/10/2026          [ Editar ]        │
│  v1  Publicado  em 20/10/2026 por Gustavo     [ Ver ]  [ Nova versão ]      │
│                                                                             │
│ ┌ Editor · v2 (rascunho) ─────────────┐ ┌ Prévia · dados de exemplo ──────┐ │
│ │ # Contrato de Licença de Uso        │ │ Contrato de Licença de Uso      │ │
│ │ ## Quadro-resumo                    │ │ Quadro-resumo                   │ │
│ │ **Contratada:** {{contratada.razão… │ │ Contratada: GH ENGENHARIA LTDA… │ │
│ │ …                                   │ │ …                               │ │
│ └─────────────────────────────────────┘ └─────────────────────────────────┘ │
│ Prévia com dados de: [ exemplo ▾ | Empresa X | Empresa Y ]                  │
│                                                                             │
│ Campos — clique para inserir no cursor                                      │
│  contratada  razaoSocial · cnpj · endereco · encarregado · emailContato …   │
│  cliente     razaoSocial · nomeFantasia · cnpj · endereco · …              │
│  licenca · valores · cobranca · documento  (aditivo: só no modelo Aditivo)  │
│                                                                             │
│ O que impede publicar                                                       │
│  ✕ linha 42  [[REVISAR: cláusula nova, sem modelo no BaiaCerta]]            │
│  ✕ linha 12  campo desconhecido {{cliente.telefone}}                        │
│                                                                             │
│ [ Salvar rascunho ]                              [ Publicar ] (desabilitado)│
└─────────────────────────────────────────────────────────────────────────────┘
```

**Ficha do cliente › aba Contrato** (`/gestao/clientes/[id]`, o que este plano
acrescenta ao formulário de rascunho do 013)

```
┌ Documentos ────────────────────────────────────────────────────────────────┐
│ Administrador indicado pela Empresa                                         │
│ [ Maria Souza · maria@cliente.com.br                                    ▾ ] │
│ Só ele aceita o contrato e os aditivos e pede licenças. Trocar com um       │
│ documento enviado cancela o documento.                                      │
│                                                                             │
│ Condições gerais aceitas: v1 · publicada mais recente: v2                   │
│ [ Pré-visualizar documento ]  [ Enviar para aceite ]                        │
│                                                                             │
│ Linha do tempo                                                              │
│ ● Aditivo · modelo v1 · enviado em 18/10 10:02 por Gustavo                  │
│     e-mail ao administrador indicado em 18/10 10:02                         │
│     [ Reenviar e-mail ]  [ Cancelar envio ]                                 │
│ ● Contrato · modelo v1 · aceito em 16/10 09:13 por Maria Souza              │
│     maria@cliente.com.br · IP 177.10.20.30 · SHA-256 3f2a9c…                │
│     [ Imprimir ]                                                            │
│ ○ Contrato · modelo v1 · cancelado em 15/10 (rascunho alterado depois do    │
│     envio)                                                                  │
│                                                                             │
│ [ Propor aditivo ]                                                          │
│   pacote · tipo · quantidade · adicionais · preços · vale a partir de ·     │
│   motivo · [ ] levar às condições gerais publicadas (v2)                    │
│   "Este aditivo aumenta o valor: vale a partir de, no mínimo, 14/11/2026."  │
└─────────────────────────────────────────────────────────────────────────────┘
```

**ADMIN › Contrato** (`/contrato`)

```
┌ Contrato ──────────────────────────────────────────────────────────────────┐
│ Seu contrato  ● Ativo desde 16/10/2026                                      │
│ Pacote 10 · Padrão (sem Inteligência) · 10 licenças + 0 adicionais          │
│ R$ 1.000,00 por mês · vencimento no dia 10                                  │
│ A partir de 17/11/2026: Pacote 10 · Com Inteligência (aditivo aceito)       │
│                                                                             │
│ ┌ Aguardando seu aceite ─────────────────────────────────────────────────┐ │
│ │ Contrato de Licença de Uso · enviado em 15/10/2026                      │ │
│ │                                                                         │ │
│ │ Contrato de Licença de Uso do Addere                                    │ │
│ │ Quadro-resumo                                                           │ │
│ │ Contratada: GH ENGENHARIA LTDA - ME …                                   │ │
│ │ … (texto inteiro, na rolagem da página)                                 │ │
│ │                                                                         │ │
│ │ [ ] Li e concordo com o Contrato de Licença de Uso                      │ │
│ │ Ao aceitar, registramos seu nome e e-mail, a data e a hora, o IP, o     │ │
│ │ navegador e o código de integridade (SHA-256) deste texto.             │ │
│ │                                                  [ Aceitar ] (inativo)  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Documentos aceitos                                                          │
│  Contrato · aceito em 16/10/2026 por Maria Souza   [ Ver ] [ Imprimir ]     │
│  Aditivo  · aceito em 02/11/2026 por Maria Souza   [ Ver ] [ Imprimir ]     │
└─────────────────────────────────────────────────────────────────────────────┘
```

Esse é o que vê o administrador indicado. Para os outros ADMINs da empresa, o
quadro do documento pendente tem o título "Aguardando o aceite de Maria Souza"
e mostra o texto inteiro só para leitura, sem a caixa de concordância e sem o
botão. Se o indicado deixou de ser ADMIN ativo, todos veem "O administrador
indicado (Maria Souza) não está mais ativo. Fale com a Addere para indicar
outro."

**Faixa no painel do ADMIN**, enquanto houver documento pendente (some em
`/contrato`):

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ⓘ Contrato aguardando seu aceite.                        [ Ler e aceitar ] │
└──────────────────────────────────────────────────────────────────────────┘
```

Para os outros ADMINs, a faixa diz "Contrato aguardando o aceite de Maria
Souza." (ou "Aditivo …"), com o botão "Ver contrato".

**Impressão** (`/contrato/[id]/imprimir`; no papel, sem sidebar, preto no
branco):

```
Contrato de Licença de Uso do Addere
… texto inteiro …
─────────────────────────────────────────────────────────────
Registro de aceite eletrônico
Aceito por: Maria Souza (maria@cliente.com.br)
Em: 16/10/2026 09:13:22 (horário de Brasília)
IP: 177.10.20.30
Navegador: Mozilla/5.0 (…)
SHA-256 do texto: 3f2a9c…(64 caracteres)
Documento: Contrato · modelo v1 · id 7c1e…
                                       [ Imprimir / salvar PDF ] (só na tela)
```

**Configurações** do ADMIN: o Switch vira status só de leitura.

```
┌──────────────────────────────────────────────────────────────┐
│ Camada de Inteligência   ● Incluída no seu plano              │
│ Definida pelo seu contrato. Ver contrato →                    │
└──────────────────────────────────────────────────────────────┘
```

## Quem acessa

| Perfil | O que muda |
|---|---|
| SUPERADMIN | Modelos de contrato (versões, editar, publicar). Na ficha: escolher o administrador indicado, prévia, enviar, reenviar e-mail, cancelar envio, propor e descartar aditivo, linha do tempo, imprimir qualquer documento. Liga e desliga a Inteligência só em empresa **sem** contrato ACTIVE; com contrato ACTIVE, recebe 409 e o switch fica só leitura. |
| Administrador indicado (`CompanyContract.designatedAdminId`) | `/contrato`: lê e aceita o documento pendente; vê e imprime os aceitos, com o registro de aceite. Recebe o e-mail do envio e o da confirmação. Vê a faixa "Contrato aguardando seu aceite". Em Configurações, a Inteligência vira status só de leitura (403 se tentar mudar pela API). |
| Outros ADMINs da empresa | `/contrato`: leem o documento pendente só para leitura, com "Aguardando o aceite de {nome}" (403 `NOT_DESIGNATED_ADMIN` se tentarem aceitar pela API); veem e imprimem os aceitos, com o registro de aceite. A faixa diz "Contrato aguardando o aceite de {nome}". Não recebem o e-mail do envio; recebem o da confirmação. Em Configurações, o mesmo status só de leitura. |
| Vendedor e gerente (`SALESPERSON`) | Nada novo. `/billing/me/*` responde 403 e `/auth/me` devolve `pendingDocument: null`. |

LGPD: nome, e-mail, IP e navegador de quem aceita são tratados por execução de
contrato (art. 7º, V). O SUPERADMIN lê os de todas as empresas; o ADMIN, só os
da própria. O `BillingEvent` grava ids e nomes de campo, nunca IP nem texto.

## Comandos que você vai precisar

Rode no Git Bash. No PowerShell, o `>` pode gravar o arquivo em UTF-16.

| Para quê | Comando | Esperado |
|---|---|---|
| Instalar | `npm install` | exit 0 |
| Gerar o client | `npm run db:generate` | exit 0 (não precisa de banco) |
| Checar tipos | `npm run type-check` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Testes da API | `npm test --workspace=apps/api` | todos passam |
| Testes do web | `npm test --workspace=apps/web` | todos passam |
| Todos os testes | `npm test` | todos passam (API, web e mobile) |
| Build | `npm run build:api && npm run build:web` | exit 0 (o web exige `apps/web/.env.local`, copiado de `.env.local.example`) |
| Postgres local e bancos descartáveis | `docker compose up -d db && docker compose exec db createdb -U addere_dev_user addere_p014 && docker compose exec db createdb -U addere_dev_user addere_p014_shadow` | exit 0 |
| Gerar o delta (passo 15) | ver o passo 15: saída para um arquivo **fora** de `migrations/`, com as duas URLs na mesma linha | só o que é deste plano |
| Aplicar em banco limpo e conferir | `cd packages/db && L=postgresql://addere_dev_user:addere_dev_password@localhost:5432 && DATABASE_URL=$L/addere_p014 DATABASE_URL_DIRECT=$L/addere_p014 npx prisma migrate deploy && DATABASE_URL=$L/addere_p014 DATABASE_URL_DIRECT=$L/addere_p014 npx prisma migrate diff --from-url $L/addere_p014 --to-schema-datamodel ./prisma/schema.prisma --exit-code` | `deploy` sem erro; `diff` com exit 0 |
| Campos dos textos | `grep -oh "{{[^}]*}}" docs/billing/contrato-licenca-de-uso-v1.md docs/billing/aditivo-contratual-v1.md \| sort -u` | só chaves da lista fechada (passo 1) |
| `<style>` igual nas duas páginas (no site) | `diff <(sed -n '/<style>/,/<\/style>/p' termos.html) <(sed -n '/<style>/,/<\/style>/p' privacidade.html)` | saída vazia |

**Nunca** rode `npm run db:migrate`, `prisma migrate dev`, `prisma migrate reset`
ou `prisma db push`. Nunca conecte no Neon. `apps/api/.env` e
`packages/db/.env` apontam para o banco real e o Prisma os lê sozinho: todo
comando Prisma que fala com banco leva `DATABASE_URL` **e**
`DATABASE_URL_DIRECT` na **mesma linha**, as duas com `localhost`. Variável de
shell e `cd` não sobrevivem de uma chamada para a outra.

## Escopo

**Dentro do escopo (monorepo):**

- `packages/db/prisma/schema.prisma` — enums `ContractDocumentKind`,
  `ContractTemplateStatus`, `ContractDocumentStatus`; modelos
  `ContractTemplate` e `ContractDocument`; as relações inversas em `Company`,
  `CompanyContract` e `ContractTerms`; as colunas novas
  `CompanyContract.designatedAdminId` (com a relação inversa em `User`) e
  `ContractTerms.requestedByClient`.
- `packages/db/prisma/migrations/<YYYYMMDDHHMMSS>_contract_documents/migration.sql`
  (passo 15).
- `packages/types/src/contract-template.ts` (novo) — campos, renderizador,
  validações, formatação de CNPJ e CPF, e DTOs.
- `packages/types/src/reais-por-extenso.ts` (novo).
- `packages/types/src/billing.ts` (do 013) — só acréscimos: `moneyToCents`,
  `formatBrl`, `civilDaySaoPaulo`, `effectiveInstantOfDay`, os tipos novos em
  `BILLING_EVENT_TYPES` e os códigos novos em `BillingErrorCode`.
- `packages/types/src/index.ts` — exports e
  `UserPublic.company.pendingDocument`.
- `apps/api/src/app.ts` — `trustProxy`, registro das rotas novas, ticker no
  `onReady`.
- `apps/api/src/lib/env.ts`, `.env.example`, `apps/api/.env.example`,
  `render.yaml` — env `TRUST_PROXY_HOPS` (e as entradas `WEB_URL` e
  `RESEND_API_KEY` no `render.yaml`, com `sync: false`).
- `apps/api/src/lib/__tests__/env.test.ts` e
  `apps/api/src/lib/__tests__/trust-proxy.test.ts` (novo).
- `apps/api/src/middleware/require-company.ts` — `requireCompanyAdmin` (o 013
  não cria guarda de ADMIN; o 015 e o 016 contam com esta).
- `apps/api/src/modules/auth/auth.routes.ts` — `company.pendingDocument` no
  `/auth/me`.
- `apps/api/src/modules/intelligence/admin/config.routes.ts` e o teste
  `admin-routes.test.ts`.
- `apps/api/src/modules/billing/` (arquivos novos):
  `contract-fields.ts`, `amendment-rules.ts`, `billing-mailer.ts`,
  `contract-email.ts`, `designated-admin.ts`,
  `contract-templates.{routes,service,schema}.ts`,
  `contract-documents.{routes,service,schema}.ts`, `me.routes.ts`,
  `jobs/apply-due-terms.ts` e os testes em `__tests__/`.
- Nos arquivos do 013 em `apps/api/src/modules/billing/`, **só**:
  `contract.service.ts` (o passo 4 do `saveContractDraft` passa a cancelar o
  documento em PENDING_ACCEPTANCE, passo 7), `billing-events.ts` (os
  identificadores novos aceitos no `ref`) e o teste `billing-routes.test.ts`
  (um caso novo).
- `apps/web/src/components/intel/IntelConfigForm.tsx`,
  `apps/web/src/app/(admin)/configuracoes/page.tsx`,
  `apps/web/src/hooks/useIntel.ts`.
- `apps/web/src/app/(admin)/layout.tsx` — itens de menu, faixa e
  `print:hidden`.
- `apps/web/src/contexts/AuthContext.tsx` — `refreshUser`.
- `apps/web/src/hooks/useContracts.ts` (novo).
- `apps/web/src/lib/billing-ui.ts` (do 013) — rótulos dos tipos de evento
  novos.
- `apps/web/src/app/(admin)/gestao/modelos/` (novo).
- `apps/web/src/app/(admin)/gestao/clientes/[id]/tabs/ContratoTab.tsx` (do
  013) e os componentes novos que ele usar.
- `apps/web/src/app/(admin)/contrato/` (novo): `layout.tsx`, `page.tsx`,
  `[id]/page.tsx`, `[id]/imprimir/page.tsx`.
- `apps/web/src/components/contracts/` (novo): `ContractDocumentView.tsx`,
  `AcceptanceRecord.tsx`, `PendingContractBanner.tsx`; e
  `apps/web/src/components/ContractAccessOnly.tsx` (novo).
- `apps/web/src/lib/contract-hash.ts` e
  `apps/web/src/lib/__tests__/contract-hash.test.ts` (novos).
- `apps/web/src/lib/contract-acceptance.ts` e
  `apps/web/src/lib/__tests__/contract-acceptance.test.ts` (novos) — quem vê o
  documento pendente para aceitar e quem vê só para leitura.
- `apps/web/src/app/globals.css` — estilos `.contract-doc` e `@media print`.
- `docs/billing/README.md` (novo) — seção "Contrato e aceite" (passo 14).

**Dentro do escopo (repo do site, passo 16):** `termos.html`,
`privacidade.html` e `sitemap.xml`. O `CLAUDE.md` do site já está certo desde
o `ec49444` e só é conferido.

**Fora do escopo (NÃO toque):**

- `docs/billing/contrato-licenca-de-uso-v1.md` e
  `docs/billing/aditivo-contratual-v1.md` — são a fonte do texto. Se precisarem
  mudar, PARE.
- `apps/mobile/**` — o app continua lendo `intelligenceEnabled` do `/auth/me`.
  Sem OTA e sem build.
- Os leitores de `intelligenceEnabled`: `require-vendor-code.ts`,
  `intelligence/jobs/**`, `intelligence/engine/**`, `intelligence/geo/**`,
  `health.service.ts`. Se algum precisar mudar, PARE.
- `apps/api/scripts/**` — o smoke e o tenant de demonstração escrevem
  `intelligenceEnabled` direto, em empresa sem contrato. Continua valendo.
- `apps/api/src/lib/rate-limit.ts` — o código não muda; o `trustProxy` corrige
  a entrada dele.
- Trava de licenças, `LicenseRequest` e `/plano` (015); faturas, agendador de
  cobrança, **lembrete de documento pendente há mais de 3 dias** e
  cancelamento do contrato (016 — que chama o `cancelSentDocuments` deste
  plano); bloqueio, `authenticate` e `allowBlockedCompany` (017); painel
  `/gestao` (018); assinatura por plataforma (pendência da segunda etapa).
- No site: `index.html`, `ajuda/`, `assets/`, os workflows e qualquer deploy.

## Fluxo de git

- **Pré-requisito:** o 013 mergeado na `staging`. Se não estiver, PARE e
  pergunte. Não empilhe a branch sobre a do 013 (ver o incidente do #171 em
  `plans/README.md`).
- `git fetch origin && git switch -c advisor/014-contrato-de-licenca-e-aceite origin/staging`
- Um commit por passo (os passos 1 e 17 não geram commit). Mensagens em
  português, no estilo `types: modelo de contrato e valor por extenso`,
  `api: IP real atrás do proxy do Render`, `web: aceite do contrato pelo ADMIN`.
- **A migration é o último commit do monorepo** (passo 15). Até lá, o schema
  muda sem migration; o `db:generate` não precisa de banco.
- O passo 16 é em outro repositório (`c:\Projetos-Claude\sites\addere`): branch
  `advisor/014-termos-e-privacidade` a partir do `master`, um commit, sem push e
  sem deploy.
- NÃO faça push nem abra PR a menos que quem despachou tenha mandado.
- NÃO publique build nem OTA do app (`eas build`, `eas update`). Este plano não
  toca `apps/mobile`.
- NÃO copie `.env` para worktree nenhum.

## Passos

### Passo 1: Conferir os textos do contrato (sem commit)

Os dois textos foram escritos na branch `docs/plano-gestao-clientes`, junto com
este plano. Confira:

**(a) Os arquivos existem** na `staging`:

```bash
ls docs/billing/contrato-licenca-de-uso-v1.md docs/billing/aditivo-contratual-v1.md
```

**(b) Todo `{{campo}}` está na lista fechada.** Rode o grep da tabela de
comandos, um arquivo de cada vez. Cada chave tem de estar nesta lista:

- `contratada.razaoSocial`, `contratada.cnpj`, `contratada.endereco`,
  `contratada.encarregado`, `contratada.emailContato`, `contratada.emailSuporte`
- `cliente.razaoSocial`, `cliente.nomeFantasia`, `cliente.cnpj`,
  `cliente.endereco`, `cliente.representanteNome`, `cliente.representanteCpf`,
  `cliente.representanteCargo`, `cliente.emailCobranca`,
  `cliente.administradorNome`, `cliente.administradorEmail` (os dois últimos
  vêm do administrador indicado, decisão de desenho 10)
- `licenca.pacote`, `licenca.tipo`, `licenca.quantidade`, `licenca.adicionais`,
  `licenca.total`, `licenca.inteligencia`
- `valores.pacote`, `valores.pacoteExtenso`, `valores.adicional`,
  `valores.adicionalExtenso`, `valores.mensal`, `valores.mensalExtenso`
- `cobranca.carenciaMeses`, `cobranca.diaVencimento`,
  `cobranca.diasParaSuspensao`
- `documento.dataEmissao`, `documento.versaoModelo`
- `aditivo.contratoAceitoEm`, `aditivo.pacoteAnterior`, `aditivo.tipoAnterior`,
  `aditivo.quantidadeAnterior`, `aditivo.adicionaisAnterior`,
  `aditivo.valorPacoteAnterior`, `aditivo.valorAdicionalAnterior`,
  `aditivo.mensalAnterior`, `aditivo.valeAPartirDe`, `aditivo.motivo` — **só**
  no aditivo. Um `aditivo.*` no contrato é erro.

**(c) O corpo só usa a sintaxe do renderizador**: títulos (`#` a `###`),
parágrafos, listas (`- ` e `1. `), negrito (`**…**`) e a linha `---`. Tabela,
itálico, link ou citação no **corpo** aparecem como texto cru no documento. O
aviso de minuta em citação (`>`) fica fora do corpo e não conta.

**(d) Identifique o corpo.** É o que fica **entre** as linhas
`<!-- INÍCIO DO TEXTO PUBLICÁVEL -->` e `<!-- FIM DO TEXTO PUBLICÁVEL -->`,
sem as duas linhas de marcação. Fica de fora tudo o que está antes (cabeçalho
da minuta, aviso, "Como ler esta minuta", "Notas para o plano 014") e depois
(histórico de versões). Anote, para cada arquivo, a primeira e a última linha
do corpo; o passo 15 usa. Em 15/10/2026, depois das decisões do dono do
produto: contrato `:266-513`, aditivo `:76-134`. O contrato ainda estava sendo
ajustado nesse dia: confie no `grep` abaixo, não nestes números.

```bash
grep -n "TEXTO PUBLICÁVEL" docs/billing/contrato-licenca-de-uso-v1.md docs/billing/aditivo-contratual-v1.md
```

→ duas linhas por arquivo. Mais ou menos que isso é PARADA.

**(e) Leia como o aditivo usa `{{aditivo.valeAPartirDe}}`.** Hoje, no §3.1: "As
condições novas valem a partir de {{aditivo.valeAPartirDe}} ou da data do
aceite deste termo aditivo, o que for posterior." Pelas notas da minuta
(`aditivo-contratual-v1.md:62-64`), o campo nunca sai vazio: sem "vale a partir
de", ele recebe a **data de emissão** do documento, e o "o que for posterior"
leva à data do aceite. Confira que a frase fica correta com uma data qualquer.

**(f) Toda promessa do texto tem quem a cumpra.** A minuta do contrato traz, no
aviso, a tabela "Promessas do contrato × sistema" com 24 linhas: as 8 do plano
aprovado e 16 que ela acrescentou (entre elas, a meta de disponibilidade nas
linhas 21 a 23 e o administrador indicado na 24). Leia as condições gerais e
case cada promessa com uma linha dessa tabela. Promessa sem linha, ou linha
sem dono, é PARADA. As linhas que são deste plano estão nos Critérios de
conclusão.

**(g) As decisões de 15/10/2026 estão nos textos.** Confira:

- o quadro-resumo do contrato imprime o administrador indicado com
  `{{cliente.administradorNome}}` e `{{cliente.administradorEmail}}`, e as
  partes do aditivo também;
- o §14.1 diz que o aceite é do administrador indicado no quadro-resumo, e o
  §3.5 diz que é ele quem pede licenças adicionais;
- o §8.8 traz o encarregado com o nome completo, **Gustavo Henrique Palitot
  Costa**, igual ao `CONTRATADA.encarregado` do passo 2 e à seção 12 da
  `privacidade.html` do site (corrigidos por outra pessoa em 15/10/2026; aqui
  só se confere);
- o §9.7 a §9.10 trazem a meta de 99,5 % de cada mês civil, o crédito
  proporcional abatido na fatura da competência seguinte, o teto da
  indenização para quem não é consumidor e o Pix em até 30 dias sem fatura
  seguinte.

```bash
grep -c "{{cliente.administradorNome}}" docs/billing/contrato-licenca-de-uso-v1.md docs/billing/aditivo-contratual-v1.md
grep -n "Gustavo Henrique Palitot Costa\|^\*\*9\.[0-9]*\|^\*\*14\.1" docs/billing/contrato-licenca-de-uso-v1.md
```

→ pelo menos 1 em cada arquivo no primeiro; no segundo, o §8.8 com o nome e os
§9.7 a §9.10 e §14.1 presentes.

**Verificar**: (a) a (g) conferidos. Arquivo ausente, campo fora da lista,
sintaxe sem suporte no corpo, marcadores do corpo faltando ou repetidos, frase
quebrada no (e), promessa sem dono ou decisão de 15/10/2026 ausente do texto
são condições de PARADA. Não edite os textos.

### Passo 2: Módulo puro do modelo de contrato (`packages/types`)

Crie `packages/types/src/reais-por-extenso.ts`:

- `reaisPorExtenso(cents: number): string` — recebe **centavos inteiros**.
  Lança `RangeError` para negativo, não inteiro ou acima de
  99.999.999.999.999 centavos (999 bilhões).
  - unidades até 19 com "quatorze"; dezenas; "cem" para 100 exato e "cento"
    para 101–199; "mil" sem "um" na frente; "milhão/milhões", "bilhão/bilhões";
  - entre grupos não nulos, vírgula; a **última** junção usa " e " quando o
    último grupo é menor que 100 ou múltiplo de 100;
  - "de reais" quando a parte inteira tem milhão ou bilhão e os grupos de mil e
    de unidade são zero;
  - "real" para 1, "reais" para o resto; centavos depois de " e ", com
    "centavo" para 1; só centavos sai sem "zero reais"; zero sai
    "zero reais".

Acrescente a `packages/types/src/billing.ts` (do 013), sem mudar o que já
existe:

- `moneyToCents(value: string): number` — o `toCents` interno do 013, agora
  exportado. Não reimplemente.
- `formatBrl(value: string | number): string` — `R$ 1.234,56`, com **espaço
  comum**, separador de milhar `.` e decimal `,`, sem `Intl` (decisão de
  desenho 5). Converte por centavos. É o formatador que o 015 procura neste
  arquivo.
- `civilDaySaoPaulo(instant: Date): Date` — o dia civil de São Paulo do
  instante, como `@db.Date` (meia-noite UTC), sobre o `civilDateInSaoPaulo`
  interno. Serve para `startDate` e para formatar datas de instantes com
  `formatBillingDate`.
- `effectiveInstantOfDay(ymd: string): Date` — 00:01 de São Paulo do dia
  `YYYY-MM-DD` (`Date.UTC(y, m - 1, d, 3, 1)`, com o mesmo comentário de UTC−3
  fixo de `competenceStartInstant`). É como o "vale a partir de" é gravado
  (decisão de desenho 9).
- Em `BILLING_EVENT_TYPES`: `TEMPLATE_VERSION_CREATED`, `TEMPLATE_PUBLISHED`,
  `DOCUMENT_SENT`, `DOCUMENT_RESENT`, `DOCUMENT_CANCELLED`,
  `DOCUMENT_ACCEPTED`, `AMENDMENT_PROPOSED`, `AMENDMENT_WITHDRAWN`,
  `INTELLIGENCE_APPLIED` e `DESIGNATED_ADMIN_CHANGED`. É `String` no banco:
  nada de migration de enum.
- Em `BillingErrorCode`: os códigos novos deste plano (lista no fim do passo
  8).

Crie `packages/types/src/contract-template.ts`:

- `type ContractDocumentKind = 'CONTRACT' | 'AMENDMENT'`. O enum do
  `@prisma/client` tem o mesmo nome: num arquivo da API que precise dos dois,
  importe um com alias (a mesma regra do 013).
- `CONTRATADA` — as constantes da contratada:
  `razaoSocial: 'GH ENGENHARIA LTDA - ME'`, `cnpj: '07.841.407/0001-90'`,
  `endereco: 'Rua Débora da Silva Braga, 55, Bessa, João Pessoa/PB, CEP 58037-350'`,
  `encarregado: 'Gustavo Henrique Palitot Costa'` (nome completo, decidido em
  15/10/2026; é o mesmo do §8.8 do contrato e da seção 12 da Política de
  Privacidade), `emailContato: 'contato@addere.com.br'`,
  `emailSuporte: 'suporte@addere.com.br'`.
- `CONTRACT_FIELDS` — a lista fechada do passo 1, cada item com `key`, `group`,
  `label` (para a lista de inserção do editor) e `kinds` (`aditivo.*` só em
  `AMENDMENT`; o resto nos dois). `ContractFieldKey` é a união das chaves.
- `SAMPLE_CONTRACT_VALUES` — uma entrada para cada chave de
  `CONTRACT_FIELDS`, com valores fictícios e evidentes para a prévia do editor
  (ex.: `Empresa Exemplo Ltda`, CNPJ `00.000.000/0000-00`, valores redondos
  como `R$ 1.000,00`). Nunca dado real.
- `normalizeTemplateBody(body)` — `\r\n` e `\r` viram `\n`, e o texto sai sem
  espaço no começo e no fim. Tudo abaixo passa por ela primeiro.
- `checkTemplateForPublish(kind, body): TemplateIssue[]`, com
  `TemplateIssue = { type, text, line }` e `type` entre:
  - `UNKNOWN_FIELD` — `{{grupo.campo}}` fora da lista;
  - `FIELD_NOT_ALLOWED_FOR_KIND` — `aditivo.*` num modelo `CONTRACT`;
  - `REVIEW_MARKER` — qualquer `[[…]]` (cobre `[[A DEFINIR]]` e
    `[[REVISAR: …]]`) e `[[` ou `]]` soltos;
  - `MALFORMED_PLACEHOLDER` — `{{` ou `}}` que sobram depois de tirar os campos
    bem formados.
  Corpo vazio também é um problema (`type: 'EMPTY'`). Lista vazia = pode
  publicar.
- `fillContractTemplate(body, values): { text: string; missing: string[] }` —
  troca cada `{{grupo.campo}}` pelo valor. Antes de entrar, o valor perde
  quebras de linha (viram espaço) e os caracteres `*`, `{`, `}`, `[` e `]`, e
  leva `trim`. Assim dado de cadastro não vira marcação nem campo novo. Valor
  `null`, `undefined` ou vazio depois disso entra em `missing` (sem repetir a
  chave) e o marcador fica no texto. Campo fora da lista também entra em
  `missing`.
- `renderContractMarkdown(markdown): string` — HTML seguro e determinístico:
  - escapa `&`, `<`, `>`, `"` e `'` **antes** de qualquer marcação;
  - `#`, `##` e `###` no início da linha viram `h1`, `h2` e `h3`; com mais
    `#`, `h3`;
  - linhas seguidas viram um `<p>`, unidas por espaço; linha em branco separa
    blocos;
  - `- ` ou `* ` viram `<ul><li>`; `1. ` ou `1) ` viram `<ol start="N"><li>`;
    linha indentada logo abaixo de um item continua o item;
  - `---` sozinho na linha vira `<hr>`;
  - `**texto**` vira `<strong>`; asterisco sem par fica como está;
  - todo o resto (tabela, `>`, link, itálico) sai como texto escapado;
  - sem `id`, sem `class`, sem atributo além do `start`.
- `formatCnpj` e `formatCpf`. CNPJ com 14 dígitos e CPF com 11, depois de
  tirar a pontuação, são formatados; outro formato sai como veio, sem espaços
  nas pontas (o 013 grava o CNPJ como digitado e o CPF só com dígitos). Datas
  usam `formatBillingDate` do 013.
- DTOs: `ContractTemplateDto`, `ContractDocumentDto` (com `renderedBody`,
  `sha256`, versões do modelo, envio, aceite e cancelamento),
  `DesignatedAdminRef = { id: string; name: string; valid: boolean }` (`valid`
  = o usuário ainda é ADMIN ativo da empresa) e
  `PendingDocumentRef = { id: string; kind: ContractDocumentKind; sentAt: string; designatedAdmin: DesignatedAdminRef | null }`.

Exporte os dois módulos em `packages/types/src/index.ts`. Em `UserPublic.company`,
acrescente `pendingDocument?: PendingDocumentRef | null`.

**Testes** (Vitest da API, que já resolve `@addere/types`):

- `apps/api/src/modules/billing/__tests__/reais-por-extenso.test.ts`: 0, 1, 2,
  0,01, 0,50, 1,01, 100, 101, 110, 1.000, 1.001, 1.100, 1.101, 1.250,50, 2.000,
  21.000, 100.000, 1.000.000 ("um milhão de reais"), 1.200.000 ("um milhão e
  duzentos mil reais"), 1.250.000 ("um milhão, duzentos e cinquenta mil
  reais"), 2.500.000,01, 1.000.000.000; erro para −1, 1,5 e acima do teto;
  `formatBrl` para `'0'`, `'0.05'`, `'1234.56'`, `'1000000'` e `2400.5`;
  `civilDaySaoPaulo` às 23h30 de 31/10 em São Paulo (`2026-11-01T02:30:00Z`)
  dá 31/10; `effectiveInstantOfDay('2026-12-01')` fica **depois** de
  `competenceStartInstant` de dezembro, e
  `resolveCompetenceTerms` de dezembro **não** conta um termo com esse
  `effectiveFrom`, enquanto o de janeiro conta.
- `apps/api/src/modules/billing/__tests__/contract-template.test.ts`:
  - renderizador: `<script>` e `<img onerror=…>` saem escapados; `&` vira
    `&amp;`; títulos, `ul`, `ol` com `start`, `hr`, negrito, negrito sem par;
    parágrafo de várias linhas vira um `<p>`; CRLF e LF dão o mesmo HTML; tabela
    sai como texto;
  - validações: campo desconhecido, `aditivo.*` em `CONTRACT`,
    `[[A DEFINIR]]`, `[[REVISAR: motivo]]`, `{{` solto, corpo vazio; corpo
    limpo devolve lista vazia; a `line` aponta a linha certa;
  - preenchimento: todos os campos; campo sem dado entra em `missing` uma vez
    só; valor com `**`, `{{x.y}}` ou `[[REVISAR]]` não vira marcação nem campo;
  - `CONTRACT_FIELDS` tem exatamente as chaves do passo 1;
  - **os textos reais**: leia os dois arquivos de `docs/billing/` com
    `node:fs` (caminho a partir de `process.cwd()`, que é `apps/api`, até
    `../../docs/billing/`), recorte o corpo pelos marcadores e confira que
    `checkTemplateForPublish` só devolve problemas do tipo `REVIEW_MARKER` e
    que `fillContractTemplate` com `SAMPLE_CONTRACT_VALUES` não deixa nada em
    `missing`. Esse teste quebra se alguém puser no texto um campo ou uma
    marcação que o código não conhece, e é de propósito.

Em `apps/web/src/lib/billing-ui.ts` (do 013), dê rótulo aos tipos de evento
novos em `BILLING_EVENT_LABELS` ("Versão de modelo criada", "Modelo
publicado", "Documento enviado", "E-mail reenviado", "Documento cancelado",
"Documento aceito", "Aditivo proposto", "Aditivo descartado", "Inteligência
aplicada pelo contrato", "Administrador indicado alterado"). Sem isso o web
não compila.

**Verificar**: `npm run type-check && npm test --workspace=apps/api && npm test --workspace=apps/web` → exit 0.

### Passo 3: IP real atrás do proxy (`trustProxy`)

1. `apps/api/src/lib/env.ts`: acrescente
   `TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1)`, com
   comentário: quantos proxies ficam na frente da API (o Render, 1); 0
   desliga.
2. `apps/api/src/app.ts`: `Fastify({ trustProxy: env.TRUST_PROXY_HOPS, logger: … })`.
   Comentário: por que número e não `true` (decisão de desenho 2) e o efeito no
   rate limit (abaixo).
3. `.env.example` e `apps/api/.env.example`: `TRUST_PROXY_HOPS=1` com uma linha
   de explicação.
4. `render.yaml`, nos **dois** serviços: `TRUST_PROXY_HOPS` com `value: '1'` e
   comentário "confira no staging que o IP do cliente aparece nos logs".
   Acrescente também `WEB_URL` e `RESEND_API_KEY` com `sync: false`: os links
   e o envio dos e-mails deste plano dependem delas, e hoje elas não estão
   declaradas.

**Efeito no rate limit** (escreva isto no comentário do `app.ts`): o
`@fastify/rate-limit` do login, do refresh, do forgot-password, do
reset-password e do logout usa `request.ip` como chave. Hoje, atrás do proxy, é
provável que todos os clientes dividam um balde só: 10 logins por minuto para o
país inteiro. O `userRateLimit` de `lib/rate-limit.ts:37` cai no mesmo IP
quando não há usuário autenticado. Com o `trustProxy`, cada cliente passa a ter
o próprio balde. O código dos limitadores não muda.

**Testes:**

- `apps/api/src/lib/__tests__/trust-proxy.test.ts` (novo; mocka `@addere/db`
  como `admin-routes.test.ts`). Monte o app com `buildApp()`, registre antes do
  `ready()` uma rota de teste que devolve `request.ip`, e confira:
  - sem `X-Forwarded-For` → `127.0.0.1`;
  - `x-forwarded-for: 203.0.113.9` → `203.0.113.9`;
  - `x-forwarded-for: 198.51.100.20, 203.0.113.9` → `203.0.113.9` (a entrada
    que o cliente forjou à esquerda é ignorada);
  - login: 10 `POST /auth/login` com o mesmo `X-Forwarded-For` respondem 400 ou
    401; o 11º responde 429; o primeiro com outro `X-Forwarded-For` não
    responde 429.
- `apps/api/src/lib/__tests__/env.test.ts`: padrão 1; aceita `0` e `3`; recusa
  `9` e `abc`.

**Verificar**: `npm test --workspace=apps/api` → passa, com os casos novos.
`grep -n "trustProxy" apps/api/src/app.ts` → uma linha.

### Passo 4: Modelos no schema (sem migration)

Em `packages/db/prisma/schema.prisma`, perto dos modelos do 013:

```prisma
enum ContractDocumentKind {
  CONTRACT  // Contrato de Licença de Uso
  AMENDMENT // aditivo
}

enum ContractTemplateStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

enum ContractDocumentStatus {
  SENT
  ACCEPTED
  CANCELLED
}

// Modelo do texto do contrato e do aditivo, versionado (plano 014). Markdown
// restrito com campos {{grupo.campo}}. Um só PUBLISHED por kind (garantido no
// serviço). Editar um publicado cria uma versão nova.
model ContractTemplate {
  id            String                 @id @default(uuid())
  kind          ContractDocumentKind
  version       Int
  status        ContractTemplateStatus @default(DRAFT)
  body          String
  changeNote    String?
  createdById   String? // null = gravado pela migration
  publishedAt   DateTime?
  publishedById String?
  createdAt     DateTime               @default(now())
  updatedAt     DateTime               @updatedAt

  documents          ContractDocument[] @relation("DocumentTemplate")
  conditionDocuments ContractDocument[] @relation("DocumentConditionsTemplate")

  @@unique([kind, version])
  @@index([kind, status])
  @@map("billing_contract_templates")
}

// Documento enviado para aceite (plano 014). renderedBody e sha256 nunca mudam
// depois de criados: o texto aceito é este, não o modelo atual.
model ContractDocument {
  id                String                 @id @default(uuid())
  kind              ContractDocumentKind
  status            ContractDocumentStatus @default(SENT)
  renderedBody      String
  sha256            String
  sentAt            DateTime               @default(now())
  sentById          String
  lastEmailAt       DateTime?
  acceptedAt        DateTime?
  acceptedById      String?
  acceptedByName    String? // congelado no aceite
  acceptedByEmail   String? // congelado no aceite
  acceptedIp        String?
  acceptedUserAgent String?
  cancelledAt       DateTime?
  cancelledById     String?
  cancelReason      String?
  createdAt         DateTime               @default(now())
  updatedAt         DateTime               @updatedAt

  companyId            String
  company              Company           @relation(fields: [companyId], references: [id])
  contractId           String
  contract             CompanyContract   @relation(fields: [contractId], references: [id])
  termsId              String
  terms                ContractTerms     @relation(fields: [termsId], references: [id])
  templateId           String
  template             ContractTemplate  @relation("DocumentTemplate", fields: [templateId], references: [id])
  // Condições gerais que este documento carrega: o próprio modelo num CONTRACT;
  // num aditivo, só quando ele leva o cliente a uma versão nova.
  conditionsTemplateId String?
  conditionsTemplate   ContractTemplate? @relation("DocumentConditionsTemplate", fields: [conditionsTemplateId], references: [id])

  @@index([companyId, status])
  @@index([contractId, sentAt])
  @@map("billing_contract_documents")
}
```

Em `ContractTerms` (do 013), acrescente a coluna `requestedByClient Boolean
@default(false)`: aditivo feito a pedido da Empresa (decisão de desenho 7). A
migration do passo 15 leva o `ALTER TABLE "billing_contract_terms" ADD COLUMN
"requestedByClient" BOOLEAN NOT NULL DEFAULT false`.

Em `CompanyContract` (do 013), acrescente o administrador indicado (decisão de
desenho 10):

```prisma
  // Administrador indicado pela Empresa (plano 014): o único que aceita o
  // contrato e os aditivos e pede licenças adicionais (015). Escolhido pelo
  // superadmin na aba Contrato. Ponteiro vivo, com chave estrangeira (exceção
  // da decisão de desenho 8).
  designatedAdminId String?
  designatedAdmin   User?   @relation("ContractDesignatedAdmin", fields: [designatedAdminId], references: [id])
```

Em `User`, a relação inversa
`designatedInContracts CompanyContract[] @relation("ContractDesignatedAdmin")`.
A tabela do 013 é `billing_company_contracts` (`@@map` do `CompanyContract`).
A migration do passo 15 leva as duas linhas que o Prisma gera para isso:

```sql
ALTER TABLE "billing_company_contracts" ADD COLUMN "designatedAdminId" TEXT;
ALTER TABLE "billing_company_contracts" ADD CONSTRAINT "billing_company_contracts_designatedAdminId_fkey" FOREIGN KEY ("designatedAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

O `ON DELETE SET NULL` é o padrão do Prisma para relação opcional. Usuário
nunca é apagado fisicamente, então ele não deve disparar.

As tabelas seguem o prefixo `billing_` do 013. Relações inversas:
`contractDocuments ContractDocument[]` em `Company`, `documents
ContractDocument[]` em `CompanyContract` e em `ContractTerms`. Rode
`npx prisma format --schema packages/db/prisma/schema.prisma`.

`BillingEvent.type` é `String` no 013: os tipos novos entram só em
`BILLING_EVENT_TYPES` (passo 2), sem migration.

> ⚠️ **NÃO rode `npm run db:migrate`, `prisma migrate dev`, `prisma migrate reset`
> nem `prisma db push`.** A migration é o passo 15, contra Postgres local.

**Verificar**: `npm run db:generate && npm run type-check` → exit 0.

### Passo 5: Valores dos campos (API)

Crie `apps/api/src/modules/billing/contract-fields.ts`:

- `buildContractFieldValues(input): Record<ContractFieldKey, string | null>` —
  **pura**. Recebe as linhas já carregadas: empresa, `ClientProfile`, contrato,
  administrador indicado (`id`, `name`, `email`, ou `null`), termos usados no
  documento, termos anteriores (aditivo), documento CONTRACT aceito (aditivo),
  modelo, `BillingSettings` e a data de emissão.
- `loadContractFieldInput(companyId, kind, now)` — faz as consultas Prisma e
  monta o `input`. O indicado vem de `CompanyContract.designatedAdmin`.

Origem e formato de cada campo:

| Campo | De onde vem | Formato |
|---|---|---|
| `contratada.*` | `CONTRATADA` | como está |
| `cliente.razaoSocial` | `ClientProfile.legalName` | texto |
| `cliente.nomeFantasia` | `ClientProfile.tradeName`, ou `legalName` quando vazio | texto |
| `cliente.cnpj` | `Company.cnpj` | `formatCnpj` |
| `cliente.endereco` | `addressStreet`, `addressNumber`, `addressComplement`, `addressDistrict`, `addressCity`, `addressState`, `addressZip` | `Logradouro, número[, complemento], bairro, Cidade/UF, CEP 00000-000`. Faltou logradouro, número, bairro, cidade, UF ou CEP ⇒ `null` |
| `cliente.representanteNome` | `legalRepName` | texto |
| `cliente.representanteCpf` | `legalRepCpf` | `formatCpf` |
| `cliente.representanteCargo` | `legalRepRole` | texto |
| `cliente.emailCobranca` | `billingEmail` | e-mail |
| `cliente.administradorNome` | `User.name` do administrador indicado (`CompanyContract.designatedAdminId`) | texto |
| `cliente.administradorEmail` | `User.email` do administrador indicado | e-mail |
| `licenca.pacote` | `LicensePackage.name` | ex.: `Pacote 10`, `Ilimitado` |
| `licenca.tipo` | `licenseType` | `STANDARD` ⇒ `Padrão (sem Inteligência)`; `INTELLIGENCE` ⇒ `Com Inteligência` |
| `licenca.quantidade` | `includedSeats` | inteiro |
| `licenca.adicionais` | `extraSeats` | inteiro |
| `licenca.total` | `includedSeats + extraSeats` | inteiro |
| `licenca.inteligencia` | `licenseType` | `Sim` ou `Não` |
| `valores.pacote` / `valores.pacoteExtenso` | `packagePrice` | `formatBrl` / `reaisPorExtenso` |
| `valores.adicional` / `valores.adicionalExtenso` | `extraSeatPrice` | idem |
| `valores.mensal` / `valores.mensalExtenso` | `contractMonthlyTotal` (013) | idem |
| `cobranca.carenciaMeses` | `graceMonths` | inteiro (o texto do modelo diz que zero é sem carência) |
| `cobranca.diaVencimento` | `dueDay` | inteiro |
| `cobranca.diasParaSuspensao` | `overdueBlockDays`, ou `BillingSettings.overdueBlockDays` | inteiro |
| `documento.dataEmissao` | o instante do envio (na prévia, agora) | `formatBillingDate(civilDaySaoPaulo(x))` |
| `documento.versaoModelo` | `ContractTemplate.version` do modelo preenchido | inteiro |
| `aditivo.contratoAceitoEm` | `acceptedAt` do documento CONTRACT aceito (o original, não o último aditivo) | `formatBillingDate(civilDaySaoPaulo(x))` |
| `aditivo.pacoteAnterior` … `aditivo.mensalAnterior` | os termos EFFECTIVE de maior `effectiveFrom` | os mesmos formatos de `licenca.*` e `valores.*` |
| `aditivo.valeAPartirDe` | `proposedEffectiveFrom` | data; sem `proposedEffectiveFrom`, a **data de emissão** (notas da minuta do aditivo) |
| `aditivo.motivo` | `ContractTerms.reason` dos termos propostos | texto |

Regras:

- Dinheiro: `Decimal` → string com `.toFixed(2)` (como o 013 faz nos DTOs);
  `formatBrl` recebe a string; `reaisPorExtenso` recebe
  `moneyToCents(string)`. Nunca `Number(decimal) * 100`.
- Datas de instantes sempre por `civilDaySaoPaulo` e `formatBillingDate`.
- Texto vazio ou só espaços vale `null`. `null` vira "campo sem dado" no envio.
- `cliente.endereco`: complemento vazio some junto com a vírgula; o CEP sai
  `00000-000` a partir dos 8 dígitos.
- **Nome fantasia vazio usa a razão social** (revisão de 15/10/2026). É o
  único campo com reserva: muita empresa não tem nome fantasia, e repetir a
  razão social no cadastro só para destravar o envio seria trabalho à toa.
- Num CONTRACT, os `aditivo.*` não são preenchidos. Num AMENDMENT, `licenca.*`
  e `valores.*` são os termos **propostos**.
- **Administrador indicado**: os dois campos vêm do usuário apontado pelo
  contrato, lidos na hora de gerar o texto. Sem indicado, os dois são `null`:
  a prévia os lista como faltando, e o envio já recusa antes, com
  `DESIGNATED_ADMIN_REQUIRED` (passo 7). Este campo não confere se o indicado
  ainda é ADMIN ativo; quem confere é o envio.

**Testes** (`__tests__/contract-fields.test.ts`, sobre a função pura): todos os
formatos da tabela; Ilimitado com quantidade digitada; mensal com e sem
adicionais; `null` para cada dado ausente do perfil; sem indicado,
`cliente.administradorNome` e `cliente.administradorEmail` `null`; endereço sem CEP dá
`null`; endereço sem complemento; aditivo com `proposedEffectiveFrom` e sem
ele (`aditivo.valeAPartirDe` = data de emissão); `aditivo.contratoAceitoEm`
vem do CONTRACT mesmo com aditivos aceitos depois; data de emissão às 23h30
de São Paulo cai no dia certo.

**Verificar**: `npm test --workspace=apps/api` → passa.

### Passo 6: Modelos de contrato (API)

Crie `contract-templates.{schema,service,routes}.ts`. Todas as rotas usam
`requireSuperAdmin`, e o autor é `request.user.sub`. Registre o plugin novo em
`app.ts`, logo depois do `billingAdminRoutes` do 013, com prefixo
`/admin/billing/contract-templates`.

| Rota | O que faz | Erros |
|---|---|---|
| `GET /` | versões dos dois tipos, sem `body`, ordem `kind`, `version` desc | — |
| `GET /:id` | a versão com `body` | 404 |
| `POST /` `{ kind, fromTemplateId? }` | cria DRAFT com `version` = maior + 1, copiando o corpo de `fromTemplateId` ou da maior versão do tipo | 409 `TEMPLATE_DRAFT_EXISTS` se já há DRAFT do tipo |
| `PUT /:id` `{ body, changeNote? }` | edita; grava o corpo normalizado (`normalizeTemplateBody`); limite de 200.000 caracteres | 409 `TEMPLATE_NOT_DRAFT` |
| `POST /:id/preview` `{ companyId }` | preenche com os dados reais da empresa: `{ renderedBody, missing, issues }` | 404 |
| `POST /:id/publish` | roda `checkTemplateForPublish`; numa transação, arquiva o PUBLISHED do tipo e publica este (`publishedAt`, `publishedById`) | 409 `TEMPLATE_NOT_DRAFT`; 422 `TEMPLATE_NOT_PUBLISHABLE` com `details: { issues }` |

A publicação fica registrada na própria linha (`publishedAt`,
`publishedById`) e num `BillingEvent` global (`companyId: null`) por
`recordBillingEvent`: `TEMPLATE_VERSION_CREATED` no `POST /` e
`TEMPLATE_PUBLISHED` no publish, com `ref: { templateKind, templateVersion }`.
Acrescente esses dois identificadores, e `documentId` e `documentKind` (passo
7), à lista do que o `ref` aceita em `billing-events.ts`; nenhum deles é dado
pessoal.

**Testes** (`__tests__/contract-templates.test.ts`, com `app.inject` e o mock):
ADMIN recebe 403; segunda versão com DRAFT aberto dá 409; editar PUBLISHED dá
409; publicar com `[[REVISAR: x]]` dá 422 e não chama `update`; publicar limpo
arquiva o anterior e publica, na mesma transação; o `PUT` grava LF mesmo
recebendo CRLF.

**Verificar**: `npm test --workspace=apps/api` → passa.

### Passo 7: Documentos — prévia, envio, reenvio, cancelamento e aditivo (API)

Crie `amendment-rules.ts` (puro), `billing-mailer.ts`, `contract-email.ts`,
`designated-admin.ts` e `contract-documents.{schema,service,routes}.ts`.

**`amendment-rules.ts`:**

- `isPriceIncrease(previous, proposed, carryConditions)` — verdadeiro se o
  `packagePrice` proposto é maior que o anterior, se o `extraSeatPrice`
  proposto é maior que o anterior, ou se `carryConditions` (decisão de desenho
  7; contrato §13 e aditivo §3.3). Compare em centavos (`moneyToCents`). Mais
  licenças adicionais pelo mesmo valor unitário **não** é aumento.
- `minimumEffectiveDate(sentYmd)` — `sentYmd` + 30 dias corridos (`YYYY-MM-DD`).
- `assertAmendmentNotice({ increase, requestedByClient, carryConditions,
  proposedEffectiveFromYmd, sentYmd })` — a antecedência é exigida quando
  `carryConditions`, ou quando `increase` e **não** `requestedByClient`
  (decisão de desenho 7). Exigida e com `proposedEffectiveFromYmd` ausente
  **ou** menor que `minimumEffectiveDate`: 422 `AMENDMENT_NOTICE_TOO_SHORT`,
  com `details: { minimumEffectiveFrom }`. Com `requestedByClient`, o motivo
  vazio dá 422 `AMENDMENT_REASON_REQUIRED`. Testes: aumento sem caixa (exige
  30 dias), aumento com caixa (vale no aceite), condições novas com caixa
  (exige 30 dias), sem aumento (vale no aceite).
- O formulário manda o "vale a partir de" como `YYYY-MM-DD`; a API grava
  `effectiveInstantOfDay(ymd)` em `proposedEffectiveFrom` (decisão de desenho
  9), e lê de volta com `civilDaySaoPaulo`.

**`billing-mailer.ts`** — o envio genérico do módulo, no padrão de
`auth.service.ts:72-108`. O 015 e o 016 vão procurar um helper de e-mail no
módulo `billing` e acrescentar as funções deles aqui:

- `sendBillingEmail({ to, subject, html }): Promise<boolean>`, um destinatário
  por chamada (sem expor os endereços uns aos outros);
- sem `RESEND_API_KEY`, `console.warn` e `false`, sem erro;
- `from: 'Addere <noreply@addere.com.br>'`; `replyTo` = `CONTRATADA.emailContato`
  (confira o nome do campo no tipo do SDK);
- confira o `error` devolvido pelo SDK: falha devolve `false` e vai para
  `captureError`, sem dados pessoais;
- `escapeHtml(text)`, exportado: todo texto vindo do banco passa por ele antes
  de entrar no HTML (o `auth.service.ts` não faz isso; aqui é obrigatório);
- `webUrl(path)`: `WEB_URL` com o mesmo fallback de `auth.service.ts:72`.

**`contract-email.ts`** — os dois e-mails deste plano, sobre o
`sendBillingEmail`:

- `sendDocumentPendingEmail(doc, recipient)` — **um destinatário só, o
  administrador indicado** (decisão de desenho 10; sem cópia ao
  `billingEmail` nem aos outros ADMINs). Assunto "Contrato de Licença de Uso do
  Addere aguardando seu aceite" (ou "Aditivo ao Contrato de Licença de Uso do
  Addere aguardando seu aceite") e link `webUrl('/contrato/{id}')`. Devolve se
  o e-mail saiu;
- `sendDocumentAcceptedEmail(doc, recipients)` — "… aceito", com quem aceitou,
  quando e o mesmo link. Sem IP e sem o texto do contrato. Devolve quantos
  e-mails saíram.

**`designated-admin.ts`** — a regra do administrador indicado num lugar só. O
aceite (passo 8) e o pedido de licenças do 015 usam a segunda função:

- `assertValidDesignee(db, companyId, userId)` — lê o usuário no banco. Se ele
  não existe, ou não é `role: 'ADMIN'`, `active: true` e da `companyId`, lança
  422 `DESIGNATED_ADMIN_INVALID`, "O administrador indicado precisa ser um
  administrador ativo desta empresa.". Senão devolve `{ id, name, email }`.
- `assertDesignatedAdmin(db, contract, userId)` — `contract.designatedAdminId`
  nulo ou diferente de `userId`, ou o usuário, relido no banco, já não é ADMIN
  ativo da empresa do contrato: 403 `NOT_DESIGNATED_ADMIN`, "Só o
  administrador indicado pela sua empresa pode fazer isso.". Senão devolve
  `{ id, name, email }`, lidos do banco. Não confia no `role` do JWT
  (decisão de desenho 10).
- `designatedAdminRef(contract)` — monta o `DesignatedAdminRef` (`id`, `name`,
  `valid`) a partir do contrato com `designatedAdmin` incluído, para o
  `/auth/me` e o `GET /billing/me`. Sem indicado, `null`.

**Rotas do SUPERADMIN** (`requireSuperAdmin`), no prefixo `/admin/billing`:

| Rota | O que faz |
|---|---|
| `GET /clients/:companyId/documents` | linha do tempo (documentos da empresa, mais novo primeiro, com o nome de quem enviou), `conditions: { acceptedVersion, latestPublishedVersion }`, `activePilot` (há `Pilot` da empresa com `status: 'ACTIVE'`), `designatedAdmin` (`DesignatedAdminRef` com `email`, ou `null`) e `adminCandidates` (ADMINs ativos da empresa: `id`, `name`, `email`, por nome) para o select |
| `PUT /clients/:companyId/designated-admin` `{ userId }` | troca o administrador indicado (abaixo) |
| `POST /clients/:companyId/documents/preview` `{ carryConditions? }` | o que seria enviado: `{ kind, templateVersion, renderedBody, missing, priceIncrease, minimumEffectiveFrom }`. Não falha por campo faltando: mostra a lista |
| `POST /clients/:companyId/documents/send` `{ carryConditions? }` | envia (abaixo) |
| `GET /documents/:id` | documento completo, de qualquer empresa (impressão do superadmin) |
| `POST /documents/:id/resend` | reenvia o e-mail ao administrador indicado; só SENT (409 `DOCUMENT_NOT_PENDING`); indicado que deixou de ser ADMIN ativo ⇒ 422 `DESIGNATED_ADMIN_INVALID` (troque o indicado, o que cancela o documento, e envie de novo); atualiza `lastEmailAt`; `BillingEvent` `DOCUMENT_RESENT` |
| `POST /documents/:id/cancel` `{ reason? }` | `cancelSentDocuments` para esse documento |
| `PUT /clients/:companyId/amendment` | cria ou atualiza o aditivo proposto (abaixo) |
| `POST /clients/:companyId/amendment/withdraw` | termos PROPOSED do aditivo → WITHDRAWN e cancela o documento SENT dele; `BillingEvent` `AMENDMENT_WITHDRAWN` |

São rotas novas no mesmo prefixo `/admin/billing/clients/:companyId` que o 013
usa na ficha. Ponha-as num plugin próprio (`contract-documents.routes.ts`)
registrado com prefixo `/admin/billing`, ou acrescente-as ao
`billingAdminRoutes`; as duas formas servem.

**Envio** (`sendDocument`), nesta ordem:

1. **Qual documento.** Contrato em DRAFT ⇒ CONTRACT, com os termos PROPOSED de
   origem CONTRACT. Contrato ACTIVE com termos PROPOSED de origem AMENDMENT ⇒
   AMENDMENT. Qualquer outro caso ⇒ 409 `NOTHING_TO_SEND`.
2. **Modelo.** O PUBLISHED do tipo; com `carryConditions`, também o PUBLISHED
   de CONTRACT. Sem ele ⇒ 422 `TEMPLATE_NOT_PUBLISHED` ("Publique o modelo em
   Gestão Addere › Modelos de contrato"). Por garantia, rode
   `checkTemplateForPublish` de novo; se houver problema, 422
   `TEMPLATE_NOT_PUBLISHABLE`.
3. **Administrador indicado** (decisão 10). `contract.designatedAdminId` nulo
   ⇒ 422 `DESIGNATED_ADMIN_REQUIRED`, mensagem "Escolha o administrador
   indicado pela Empresa antes de enviar.". Com indicado,
   `assertValidDesignee(prisma, companyId, contract.designatedAdminId)`: se
   ele não é ADMIN ativo da empresa, 422 `DESIGNATED_ADMIN_INVALID`. O 422
   `COMPANY_HAS_NO_ADMIN` da versão anterior deste plano não existe mais:
   empresa sem ADMIN cai em `DESIGNATED_ADMIN_REQUIRED`, porque o select fica
   vazio.
4. **Aditivo.** `assertAmendmentNotice` com a data de hoje em São Paulo.
5. **Texto.** `fillContractTemplate` com `buildContractFieldValues`. Com
   `carryConditions`, o texto é o aditivo preenchido + `\n\n---\n\n` + a linha
   `# Anexo: Contrato de Licença de Uso consolidado` + o modelo CONTRACT
   preenchido com os termos propostos. `missing` não vazio ⇒ 422
   `CONTRACT_FIELDS_MISSING`, com `details: { missing }`.
6. **Transação:**
   - trave a linha do contrato com
     `companyContract.update({ where: { id }, data: { seatGuardVersion: { increment: 1 } } })`
     — serializa dois envios da mesma empresa, sem SQL cru;
   - já existe documento SENT do contrato ⇒ 409 `DOCUMENT_ALREADY_SENT`;
   - crie o `ContractDocument` com `renderedBody`, `sha256` (abaixo),
     `templateId`, `conditionsTemplateId` (o próprio modelo no CONTRACT; o
     modelo CONTRACT com `carryConditions`; senão `null`), `sentById`;
   - CONTRACT: `companyContract.updateMany({ where: { id, status: 'DRAFT' }, data: { status: 'PENDING_ACCEPTANCE' } })`;
     `count` 0 ⇒ 409 `NOTHING_TO_SEND`;
   - `recordBillingEvent` `DOCUMENT_SENT` com
     `ref: { documentId, documentKind }`.
7. **Depois do commit**, nunca dentro da transação: um e-mail, só ao
   administrador indicado (`sendDocumentPendingEmail`); `lastEmailAt` se ele
   saiu. Os outros ADMINs e o `billingEmail` não recebem este e-mail (decisão
   de desenho 10). Falha de e-mail não desfaz o envio: a resposta traz
   `emailSent` e o superadmin usa "Reenviar e-mail".

`sha256 = createHash('sha256').update(renderedBody, 'utf8').digest('hex')`, de
`node:crypto`.

**Cancelamento — `cancelSentDocuments(tx, contractId, actorId, reason)`:**

- `contractDocument.updateMany({ where: { contractId, status: 'SENT' }, data: { status: 'CANCELLED', cancelledAt, cancelledById, cancelReason } })`;
- se cancelou um CONTRACT e o contrato está PENDING_ACCEPTANCE, ele volta a
  DRAFT; num aditivo, o contrato continua ACTIVE e os termos continuam PROPOSED;
- `recordBillingEvent` `DOCUMENT_CANCELLED` com
  `ref: { documentId, documentKind }`.

Chame essa função, **na mesma transação**:

- no `saveContractDraft` do 013 (`contract.service.ts`). Hoje o passo 4 dele
  recusa qualquer contrato fora de DRAFT com 409 `CONTRACT_NOT_DRAFT`. Mude
  **só** o caso PENDING_ACCEPTANCE: chame `cancelSentDocuments` (`reason`:
  "Rascunho alterado depois do envio" — decisão 11), volte o contrato a DRAFT
  e siga o fluxo de edição do rascunho. ACTIVE e CANCELLED continuam com o
  409; depois do aceite, mudança é por aditivo. Atualize o comentário do 013
  que anunciava esta mudança;
- no `PUT …/amendment` e no `…/amendment/withdraw` deste passo;
- no `PUT …/designated-admin` deste passo, quando o indicado muda (`reason`:
  "Administrador indicado trocado depois do envio" — decisão 11).

O cancelamento do contrato é do 016, e a decisão D6 dele já prevê cancelar os
documentos em SENT: ele chama esta mesma função.

**Administrador indicado — `PUT /clients/:companyId/designated-admin`**
`{ userId }` (decisão de desenho 10), numa transação só:

- sem contrato ⇒ 404 "Salve o rascunho do contrato antes de indicar o
  administrador."; contrato CANCELLED ⇒ 409 `CONTRACT_NOT_ACTIVE`, "Contrato
  cancelado: o administrador indicado não muda mais.". DRAFT,
  PENDING_ACCEPTANCE e ACTIVE aceitam a troca;
- `assertValidDesignee(tx, companyId, userId)` ⇒ 422
  `DESIGNATED_ADMIN_INVALID` se não for ADMIN ativo da empresa;
- `userId` igual ao atual ⇒ 200 sem escrever nada (não cancela documento);
- senão `companyContract.update({ where: { id }, data: { designatedAdminId: userId } })`.
  O `UPDATE` também prende a linha do contrato, como a trava do envio e a do
  015, e por isso não corre junto com um envio nem com um pedido de licenças
  da mesma empresa;
- `cancelSentDocuments(tx, contractId, actorId, 'Administrador indicado trocado depois do envio')`:
  um CONTRACT em PENDING_ACCEPTANCE volta a DRAFT, e um aditivo SENT é
  cancelado com o contrato ACTIVE. Sem documento SENT, não faz nada;
- `recordBillingEvent` `DESIGNATED_ADMIN_CHANGED` com
  `fields: ['designatedAdminId']`, sem nome nem e-mail.

Pedido de licenças pendente (015) não muda com a troca. Ele foi feito por
quem era o indicado na hora, e a declaração não leva o nome dele.

**Aditivo — `PUT /clients/:companyId/amendment`:**

- contrato precisa estar ACTIVE (409 `CONTRACT_NOT_ACTIVE`);
- termos EFFECTIVE com `effectiveFrom` no futuro (aditivo aceito que ainda não
  vale) ⇒ 409 `AMENDMENT_NOT_YET_EFFECTIVE`;
- corpo: `packageId`, `licenseType`, `includedSeats?`, `extraSeats`,
  `packagePrice`, `extraSeatPrice` (as mesmas regras do `contractDraftSchema`
  do 013 — reaproveite as peças dele, como `money`), `proposedEffectiveFrom?`
  (`YYYY-MM-DD`) e `reason` **obrigatório** (1 a 500). `includedSeats` sai do
  pacote, como no rascunho do 013;
- um só aditivo proposto por vez: se já existe PROPOSED de origem AMENDMENT,
  atualize no lugar e chame `cancelSentDocuments`; senão crie com a próxima
  `version` do contrato e `createdById` = autor;
- já confira a regra dos 30 dias com a data de hoje, para o formulário avisar
  cedo; o envio confere de novo;
- `recordBillingEvent` `AMENDMENT_PROPOSED`, com os **nomes** dos campos
  alterados (`changedFields` do 013) e `ref: { termsVersion }`.

**Testes** (`__tests__/amendment-rules.test.ts` e
`__tests__/contract-documents.test.ts`):

- regras: valor do pacote maior ⇒ aumento; adicional mais caro com pacote
  igual ⇒ aumento; mais licenças adicionais pelo mesmo valor unitário (total
  mensal maior) ⇒ **não** é aumento; valores menores ⇒ não é aumento;
  `carryConditions` sempre exige data; envio em 15/10/2026 ⇒ 13/11 recusado e
  14/11 aceito; envio às 23h30 de São Paulo usa o dia de São Paulo; o
  "vale a partir de" 01/12 é gravado como `effectiveInstantOfDay('2026-12-01')`;
- envio: sem modelo publicado ⇒ 422; sem indicado ⇒ 422
  `DESIGNATED_ADMIN_REQUIRED` e nenhum `create`; indicado inativo, vendedor
  ou de outra empresa ⇒ 422 `DESIGNATED_ADMIN_INVALID` e nenhum `create`;
  campo faltando ⇒ 422 com a lista; segundo envio ⇒ 409; envio feliz cria o
  documento com o SHA-256 do texto, passa o contrato a PENDING_ACCEPTANCE e
  manda **um** e-mail, ao indicado (com dois ADMINs ativos na empresa e
  `billingEmail` preenchido, `sendBillingEmail` é chamado uma vez só, com o
  e-mail do indicado); `RESEND_API_KEY` ausente não derruba o envio;
- administrador indicado: trocar com o CONTRACT em SENT cancela o documento e
  devolve o contrato a DRAFT; trocar com um aditivo em SENT cancela o
  documento do aditivo e mantém o contrato ACTIVE; o mesmo `userId` não
  cancela nada nem grava evento; usuário que não é ADMIN ativo da empresa ⇒
  422 `DESIGNATED_ADMIN_INVALID`; o evento `DESIGNATED_ADMIN_CHANGED` leva só
  o nome do campo; o `GET …/documents` lista em `adminCandidates` só os ADMINs
  ativos da empresa;
- aditivo que aumenta preço sem data, ou com data curta ⇒ 422
  `AMENDMENT_NOTICE_TOO_SHORT`;
- `PUT /admin/billing/clients/:id/contract` (013) com o contrato em
  PENDING_ACCEPTANCE: cancela o documento e devolve o contrato a DRAFT (caso
  novo em `billing-routes.test.ts`; o caso do ACTIVE com 409 continua igual);
  editar o aditivo cancela o documento do aditivo e mantém o contrato ACTIVE;
- ADMIN recebe 403 em todas as rotas `/admin/billing/*` deste passo;
- o `payload` dos eventos não leva texto do contrato, e-mail nem IP
  (`JSON.stringify` da chamada ao `billingEvent.create`).

**Verificar**: `npm test --workspace=apps/api` → passa.

### Passo 8: Aceite pelo administrador indicado (API)

**Guarda.** Crie `requireCompanyAdmin` em
`apps/api/src/middleware/require-company.ts`: `authenticate`, depois
`role === 'ADMIN'` com `companyId`; senão 403 "Acesso restrito ao
administrador da empresa". O SUPERADMIN também leva 403: ele usa as rotas
`/admin/billing`. É a "guarda do ADMIN do 014" que o 015, o 016 e o 017 usam
nas `/billing/me/*`. Ela deixa **qualquer** ADMIN da empresa ler. O que só o
indicado faz (aceitar aqui, pedir licenças no 015) confere, além dela,
`assertDesignatedAdmin` (passo 7) dentro da transação.

**Rotas** em `apps/api/src/modules/billing/me.routes.ts` (`billingMeRoutes`,
todas com `requireCompanyAdmin`), registradas em `app.ts` com prefixo
`/billing/me`. O 015, o 016 e o 017 acrescentam as deles neste arquivo:

| Rota | O que faz |
|---|---|
| `GET /` | `MyBillingDto`: `contract` (`status`, `startDate`, `graceMonths`, `firstBilledCompetence`, `dueDay`) ou `null`; `currentTerms` (os termos atuais por `resolveCurrentTerms`: `packageCode`, `packageName`, `licenseType`, `includedSeats`, `extraSeats`, `packagePrice`, `extraSeatPrice`, `monthlyTotal`, `effectiveFrom`) ou `null`; `scheduledTerms` (EFFECTIVE com `effectiveFrom` no futuro, mesmo formato) ou `null`; `pendingDocument` ou `null`; `designatedAdmin` (`DesignatedAdminRef`, por `designatedAdminRef`) ou `null`. Dinheiro como string `'1234.56'`, datas ISO. O 015 acrescenta `seats` e `licenseRequests` e usa o `designatedAdmin` no `/plano` |
| `GET /documents` | `{ pending: ContractDocumentDto \| null, accepted: [...] }`, só da empresa do usuário. Todo ADMIN da empresa lê o pendente; só o indicado aceita |
| `GET /documents/:id` | o documento da própria empresa, em qualquer status (o link de um documento cancelado mostra que ele foi substituído). De outra empresa ⇒ 404 |
| `POST /documents/:id/accept` `{ sha256 }` | aceite (abaixo) |

**Aceite (`acceptDocument`)**, numa transação só:

1. `contractDocument.findFirst({ where: { id, companyId: request.user.companyId } })`;
   não achou ⇒ 404.
2. Status diferente de SENT ⇒ 409 `DOCUMENT_NOT_PENDING` ("Este documento já
   foi aceito ou cancelado.").
3. **Só o indicado** (decisão 10). Leia o contrato do documento e chame
   `assertDesignatedAdmin(tx, contract, request.user.sub)`. Ele tem de ser o
   `designatedAdminId` do contrato e, relido no banco, ADMIN ativo da mesma
   empresa; qualquer outro recebe 403 `NOT_DESIGNATED_ADMIN`. Contrato sem
   indicado também dá 403: ninguém aceita. A função devolve nome e e-mail
   lidos do banco (não do JWT), que são os congelados no aceite. Vem antes do
   hash, para quem não pode aceitar não receber mensagem sobre o texto.
4. `sha256` do corpo diferente do gravado ⇒ 422 `DOCUMENT_HASH_MISMATCH`.
5. `contractDocument.updateMany({ where: { id, status: 'SENT' }, data: { status: 'ACCEPTED', acceptedAt: now, acceptedById, acceptedByName, acceptedByEmail, acceptedIp: request.ip, acceptedUserAgent } })`.
   `count` 0 ⇒ 409 `DOCUMENT_NOT_PENDING`. É isso que garante que, com dois
   aceites ao mesmo tempo (o indicado em duas abas), o segundo recebe 409, e
   que um documento cancelado por troca de indicado no meio do caminho não é
   aceito. O navegador vem de `request.headers['user-agent']`, cortado em 512
   caracteres.
6. Termos do documento: EFFECTIVE, com `effectiveFrom` = o maior entre `now` e
   `proposedEffectiveFrom` (já gravado às 00:01 de São Paulo — decisão de
   desenho 9). Num CONTRACT, `effectiveFrom` = `now`.
7. CONTRACT: contrato ACTIVE, `startDate` = `civilDaySaoPaulo(now)`,
   `firstBilledCompetence` de
   `computeBillingCalendar({ acceptDate: now, graceMonths, dueDay })` (013).
8. `syncIntelligenceWithTerms(tx, companyId, now)` (abaixo).
9. `recordBillingEvent` `DOCUMENT_ACCEPTED`, com
   `ref: { documentId, documentKind, termsVersion }` e o indicado como autor.

Depois do commit: `sendDocumentAcceptedEmail` aos ADMINs ativos, ao
`billingEmail` do perfil e ao `BillingSettings.notifyEmail`, sem repetir
endereço e pulando os vazios. Falha de e-mail não desfaz o aceite.

**`syncIntelligenceWithTerms(tx, companyId, now)`** — em
`apps/api/src/modules/billing/jobs/apply-due-terms.ts`. Com contrato ACTIVE,
resolve os termos atuais com `resolveCurrentTerms` (013) e calcula o valor
esperado (`licenseType === 'INTELLIGENCE'`). Se for diferente de
`company.intelligenceEnabled`, grava o novo valor e um `BillingEvent`
`INTELLIGENCE_APPLIED` com `fields: ['intelligenceEnabled']` e
`ref: { termsVersion }`. Sem contrato ACTIVE, ou sem termos atuais, não faz
nada.

**Ticker `initApplyDueTermsTicker()`** no mesmo arquivo, copiando
`initIntelScheduler` (`scheduler.ts:155-162`): desligado em `test`, uma
passada no boot (catch-up), `setInterval` de 1 hora com `.unref()`. Cada
passada roda `syncIntelligenceWithTerms` para cada contrato ACTIVE, com
`try/catch` e `captureError` por empresa. Chame no `onReady` de `app.ts`,
depois de `initIntelScheduler()`, sem poder derrubar o boot. Comentário: o 016
absorve este ticker no agendador de cobrança.

**`/auth/me`** (`auth.routes.ts:140-194`): para `role === 'ADMIN'`, acrescente
em `company` o `pendingDocument`
(`contractDocument.findFirst({ where: { companyId, status: 'SENT' }, select: { id, kind, sentAt, contract: { select: { designatedAdmin: { select: { id, name, role, active, companyId } } } } } })`,
devolvido como `PendingDocumentRef` com `designatedAdmin` por
`designatedAdminRef`); para os outros papéis, `null`. A faixa do painel
compara `pendingDocument.designatedAdmin.id` com o usuário logado. O app
ignora o campo novo.

**Testes** (`__tests__/contract-accept.test.ts` e
`__tests__/apply-due-terms.test.ts`):

- hash diferente ⇒ 422 e nenhum `updateMany`;
- **só o indicado aceita**: outro ADMIN ativo da mesma empresa ⇒ 403
  `NOT_DESIGNATED_ADMIN` e nenhum `updateMany`; contrato com
  `designatedAdminId` nulo ⇒ 403 para qualquer ADMIN; indicado rebaixado a
  vendedor (JWT ainda com `role: 'ADMIN'`, banco com `SALESPERSON`) ⇒ 403;
  aceite feliz grava `acceptedById` = o indicado e `acceptedByName` e
  `acceptedByEmail` lidos do banco, não do JWT;
- documento CANCELLED ⇒ 409; documento de outra empresa ⇒ 404;
- `updateMany` com `count` 0 (segundo aceite) ⇒ 409 e **nenhuma** outra
  escrita (termos, contrato, empresa, evento);
- aceite feliz: `updateMany` filtra `status: 'SENT'`; termos EFFECTIVE;
  contrato ACTIVE com `startDate` e `firstBilledCompetence`; Inteligência
  gravada; evento; tudo dentro de um `$transaction`;
- **IP real**: `remoteAddress: '10.0.0.5'` e
  `x-forwarded-for: '198.51.100.20, 203.0.113.9'` ⇒ `acceptedIp` gravado é
  `203.0.113.9`;
- aditivo com `proposedEffectiveFrom` futuro: `effectiveFrom` = a data (00:01
  de São Paulo), e a Inteligência **não** muda no aceite; o ticker, com `now`
  depois da data, muda e grava `INTELLIGENCE_APPLIED`;
- **fronteira do dia 1**: aditivo aceito antes, com "vale a partir de"
  01/12/2026 ⇒ `resolveCompetenceTerms` de 12/2026 devolve os termos
  anteriores e o de 01/2027 devolve os novos (contrato §6.4);
- aditivo sem data: vale no aceite; a Inteligência muda na mesma transação;
- SALESPERSON e SUPERADMIN em `/billing/me/documents` ⇒ 403;
- `GET /billing/me`: sem contrato ⇒ tudo `null`; contrato ACTIVE com aditivo
  aceito para o futuro ⇒ `currentTerms` e `scheduledTerms` diferentes;
  `designatedAdmin` com `valid: true` para o indicado ativo e `valid: false`
  depois de ele ser desativado ou rebaixado;
- `/auth/me`: ADMIN com documento SENT recebe `pendingDocument` com o
  `designatedAdmin` (id e nome), seja ele o indicado ou não; vendedor recebe
  `null`.

**Códigos de erro deste plano** (acrescente a `BillingErrorCode`):
`TEMPLATE_DRAFT_EXISTS`, `TEMPLATE_NOT_DRAFT`, `TEMPLATE_NOT_PUBLISHABLE`,
`TEMPLATE_NOT_PUBLISHED`, `NOTHING_TO_SEND`, `DESIGNATED_ADMIN_REQUIRED`,
`DESIGNATED_ADMIN_INVALID`, `NOT_DESIGNATED_ADMIN`,
`CONTRACT_FIELDS_MISSING`, `DOCUMENT_ALREADY_SENT`, `DOCUMENT_NOT_PENDING`,
`DOCUMENT_HASH_MISMATCH`, `AMENDMENT_NOTICE_TOO_SHORT`,
`AMENDMENT_REASON_REQUIRED`, `AMENDMENT_NOT_YET_EFFECTIVE`,
`CONTRACT_NOT_ACTIVE` e `INTEL_MANAGED_BY_CONTRACT` (passo 9). Todos saem por
`new AppError(status, message, details?, code)` ou pelos atalhos do 013. O
`COMPANY_HAS_NO_ADMIN` da versão anterior deste plano saiu (decisão de
desenho 10). O 015 usa o `NOT_DESIGNATED_ADMIN` no pedido de licenças.

**Verificar**: `npm test --workspace=apps/api` → passa.

### Passo 9: Inteligência pelo contrato (API)

Em `apps/api/src/modules/intelligence/admin/config.routes.ts`:

- **GET** (`:37-44`): acrescente `managedByContract` (há `CompanyContract` da
  empresa com `status === 'ACTIVE'`) e
  `canToggle = request.user.role === 'SUPERADMIN' && !managedByContract`.
- **PUT** (`:46-67`): depois do `resolveTenant`, se `body.intelligenceEnabled`
  veio **e** é diferente de `company.intelligenceEnabled`:
  - quem não é SUPERADMIN ⇒ 403 com `code: 'INTEL_MANAGED_BY_CONTRACT'` e a
    mensagem "A Inteligência é definida pelo contrato da empresa. Fale com a
    Addere.";
  - SUPERADMIN com contrato ACTIVE ⇒ 409, mesmo `code`, mensagem "Empresa com
    contrato ativo: a Inteligência muda por aditivo, na aba Contrato da Gestão
    Addere.".
  Valor **igual** ao atual é ignorado: não grave o flag e siga com o resto do
  config. É o que mantém funcionando o bundle antigo do painel, que manda o
  flag em todo salvamento (`IntelConfigForm.tsx:71`).
- O `.strict()` do `putSchema` (`:21-27`) fica como está.

Em `admin-routes.test.ts`:

- o teste `:571-584` ("PUT config liga a camada…", com ADMIN) passa a esperar
  **403** com o `code`, e `company.update` não é chamado;
- novo: ADMIN mandando o **mesmo** valor ⇒ 200 e o config é gravado sem o flag;
- novo: SUPERADMIN sem contrato liga ⇒ 200;
- novo: SUPERADMIN com contrato ACTIVE muda ⇒ 409;
- novo: GET devolve `managedByContract` e `canToggle` para ADMIN e SUPERADMIN.

Esta é a única asserção pré-existente que muda neste plano. Explique no commit.

**Verificar**: `npm test --workspace=apps/api` → passa.
`git diff --stat -- apps/api/src/middleware/require-vendor-code.ts apps/api/src/modules/intelligence/jobs apps/api/src/modules/intelligence/engine apps/api/src/modules/intelligence/geo`
→ vazio.

### Passo 10: Inteligência pelo contrato (web)

- `apps/web/src/hooks/useIntel.ts:139-142`: `ConfigResponse` ganha
  `managedByContract: boolean` e `canToggle: boolean`.
- `IntelConfigForm.tsx`:
  - com `data.canToggle`, o `Switch` (`:92-96`) fica como está;
  - sem `canToggle`, ele vira status só de leitura: "Incluída no seu plano"
    (ligada) ou "Não incluída no seu plano — fale com a Addere" (desligada).
    Para o ADMIN, link "Ver contrato" para `/contrato`. Para o SUPERADMIN com
    contrato ACTIVE, "Definida pelo contrato" e link para
    `/gestao/clientes/{companyId}`. Use os componentes e tokens existentes,
    sem cor fixa;
  - `handleSave` (`:70-79`) só manda `intelligenceEnabled` quando
    `data.canToggle`;
  - trate `INTEL_MANAGED_BY_CONTRACT` com `getApiErrorCode` (do 013),
    mostrando a mensagem da API.
- `configuracoes/page.tsx`: o comentário `:3-6` e o subtítulo `:33-36` deixam
  de dizer que o ADMIN liga a Inteligência. Subtítulo: "Camada de Inteligência
  da sua empresa: horários do sync, tom das mensagens e retenção de dados. A
  Inteligência entra pelo contrato."
- `(admin)/layout.tsx`, comentário do grupo Empresa (`:134-135`): mesma
  correção.

O plano aprovado manda o link para `/plano`, que só nasce no 015. Até lá, o
link aponta para `/contrato`; o 015 troca.

**Verificar**: `npm run type-check && npm run lint && npm test --workspace=apps/web` → exit 0.

### Passo 11: Modelos de contrato (web)

- `apps/web/src/hooks/useContracts.ts` (novo): queries e mutations dos passos
  6, 7 e 8, com chaves próprias. Toda mutação que muda contrato ou documento
  (enviar, cancelar, aditivo, trocar o indicado, aceite) invalida também
  `billingKeys.all` do
  `useBilling.ts`, porque a situação do cliente na lista muda.
- Item **Modelos de contrato** (`/gestao/modelos`, ícone `FileText` do
  `lucide-react`, `requires: 'superadmin'`) no grupo Gestão Addere, logo antes
  de Pacotes e regras. É a ordem da tabela do plano aprovado; Faturas e
  Solicitações entram depois, antes dele. Atualize o comentário do grupo, que
  lista o que os planos seguintes acrescentam.
- `apps/web/src/app/(admin)/gestao/modelos/page.tsx` e os componentes dela,
  como no esboço:
  - abas Contrato e Aditivo, com a lista de versões e o status;
  - "Nova versão" (`POST`), "Editar" (só DRAFT) e "Ver" (só leitura);
  - editor em `Textarea` com a prévia ao lado. A prévia **ao vivo** roda no
    navegador: `fillContractTemplate` com `SAMPLE_CONTRACT_VALUES` e
    `renderContractMarkdown`, sem chamada à API. Um seletor "Prévia com dados
    de" chama o `POST /:id/preview` com a empresa escolhida;
  - lista de campos de `CONTRACT_FIELDS`, agrupada e filtrada por `kinds`; o
    clique insere `{{grupo.campo}}` na posição do cursor;
  - "O que impede publicar": `checkTemplateForPublish` ao vivo, com linha e
    texto;
  - "Publicar" desabilitado enquanto a lista não estiver vazia. O 422 da API
    mostra a lista que veio em `details.issues`.
- A prévia renderiza com `dangerouslySetInnerHTML` **só** a saída de
  `renderContractMarkdown`, num contêiner `.contract-doc`. Comentário dizendo
  por que é seguro: o renderizador escapa todo HTML.

**Verificar**: `npm run type-check && npm run lint && npm test --workspace=apps/web` → exit 0.

### Passo 12: Aba Contrato da ficha (web)

Em `apps/web/src/app/(admin)/gestao/clientes/[id]/tabs/ContratoTab.tsx` (do
013):

- **O formulário de rascunho em PENDING_ACCEPTANCE.** Hoje ele fica só leitura
  fora de DRAFT. Em PENDING_ACCEPTANCE ele volta a ser editável, com o aviso
  "Salvar cancela o documento enviado ao cliente; será preciso enviar de novo."
  e uma confirmação antes de salvar (decisão 11). Em ACTIVE e CANCELLED
  continua só leitura. O título "Rascunho — o cliente ainda não vê este
  contrato." só aparece em DRAFT.

Abaixo do formulário:

- **Administrador indicado pela Empresa** (decisão de desenho 10), no topo de
  Documentos, como no esboço: `FormSelect` com `adminCandidates` (nome e
  e-mail), que chama o `PUT …/designated-admin` ao mudar. Fica fora do
  formulário de rascunho e editável em DRAFT, PENDING_ACCEPTANCE e ACTIVE;
  some em CANCELLED. Abaixo dele, a frase "Só ele aceita o contrato e os
  aditivos e pede licenças.". Casos:
  - sem candidatos: "Nenhum administrador ativo nesta empresa. Crie, em
    Usuários, o administrador indicado pela Empresa (só por indicação dela).";
  - com documento SENT, a troca pede confirmação: "Trocar o administrador
    indicado cancela o documento enviado; será preciso enviar de novo.";
  - indicado gravado que deixou de ser ADMIN ativo (`designatedAdmin.valid`
    falso): aviso "{nome} não é mais administrador ativo desta empresa.
    Escolha outro indicado.", com o select em erro.
- **Documentos**: "Pré-visualizar documento" abre um `Modal` com o texto
  renderizado e, se houver, a lista de campos faltando, com os `label` de
  `CONTRACT_FIELDS`. "Enviar para aceite" pede confirmação e fica desabilitado
  enquanto houver campo faltando. Com `activePilot`, a confirmação avisa
  "Esta empresa tem um piloto ativo. Empresa em piloto fica sem contrato:
  encerre o piloto antes, se for o caso." (regra do piloto; o envio não é
  bloqueado).
- Erros do envio por `getApiErrorCode`: `CONTRACT_FIELDS_MISSING` (lista),
  `DESIGNATED_ADMIN_REQUIRED` ("Escolha o administrador indicado pela Empresa
  antes de enviar."), `DESIGNATED_ADMIN_INVALID` (a mensagem da API),
  `TEMPLATE_NOT_PUBLISHED`, `AMENDMENT_NOTICE_TOO_SHORT` (com a data mínima),
  `DOCUMENT_ALREADY_SENT`.
- **Linha do tempo** de `GET …/documents`: tipo, versão do modelo, status;
  envio (quando, por quem, último e-mail); aceite (quem, e-mail, quando, IP,
  os 12 primeiros caracteres do SHA-256); cancelamento (quando e motivo). Ações:
  "Reenviar e-mail" e "Cancelar envio" (com motivo opcional) no SENT;
  "Imprimir" (nova aba, `/contrato/{id}/imprimir`) em todos.
- **Propor aditivo**, só com contrato ACTIVE: os campos de termos do 013 (com
  o mesmo pré-preenchimento pela tabela), "Vale a partir de" (data, opcional),
  "Motivo" (obrigatório), a caixa "A pedido da Empresa Contratante" e, quando `latestPublishedVersion > acceptedVersion`,
  a caixa "Levar às condições gerais publicadas (vN)", com a dica "Só com um
  modelo de aditivo que preveja o anexo das condições gerais; o v1 não prevê"
  (decisão de desenho 6). Enquanto o usuário preenche, mostre o aviso do
  esboço quando `isPriceIncrease` for verdadeiro e a caixa "A pedido da
  Empresa Contratante" estiver desmarcada, com a data mínima.
  "Descartar aditivo" chama o `withdraw`.
- A linha "Condições gerais aceitas: vX · publicada mais recente: vY".

**Verificar**: `npm run type-check && npm run lint && npm test --workspace=apps/web` → exit 0.

### Passo 13: Contrato do ADMIN, impressão e faixa (web)

1. **`apps/web/src/lib/contract-hash.ts`**:
   `sha256Hex(text: string): Promise<string>` com
   `crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))`, saída em
   hexadecimal minúsculo. Teste em `lib/__tests__/contract-hash.test.ts`: o
   vetor conhecido da string vazia
   (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`) e
   igualdade com `node:crypto` num texto com acentos, `R$` e travessão.
   **`apps/web/src/lib/contract-acceptance.ts`** (puro, decisão 10):
   - `pendingDocumentMode(userId, designatedAdmin)` devolve `'accept'` quando o
     usuário é o indicado e ele está válido, `'readonly'` quando o indicado é
     outro e está válido, e `'designee-invalid'` quando não há indicado ou ele
     deixou de ser ADMIN ativo;
   - `pendingBannerText(kind, mode, designatedAdminName)` devolve "Contrato
     aguardando seu aceite." no `'accept'` e "Contrato aguardando o aceite de
     {nome}." no `'readonly'` (ou "Aditivo …" nos dois). No
     `'designee-invalid'`, devolve "O administrador indicado não está mais
     ativo. Fale com a Addere para indicar outro.".
   Teste em `lib/__tests__/contract-acceptance.test.ts`: os três modos; a
   faixa de contrato e de aditivo; indicado nulo e indicado com `valid` falso
   caem em `'designee-invalid'`.
2. **`AuthContext.tsx`**: `refreshUser(): Promise<void>`, que relê o
   `/auth/me` e atualiza o usuário, exposto no contexto. O 017 também prevê um
   `refreshUser` com essa assinatura e vai reaproveitar este.
3. **`components/contracts/ContractDocumentView.tsx`**: renderiza
   `renderContractMarkdown(doc.renderedBody)` num `.contract-doc` (mesma regra
   de `dangerouslySetInnerHTML` do passo 11).
   **`AcceptanceRecord.tsx`**: o bloco de aceite do esboço (quem, e-mail,
   quando no fuso de Brasília, IP, navegador, SHA-256 inteiro, tipo, versão e
   id). Documento ainda não aceito: "Aguardando aceite". O bloco é montado pelo
   sistema, fora do modelo.
4. **`app/(admin)/contrato/layout.tsx`**: guarda para ADMIN e SUPERADMIN, no
   molde de `SuperAdminOnly` (`components/ContractAccessOnly.tsx`). Vendedor e
   gerente vão para `/inteligencia`.
5. **`/contrato`** (`page.tsx`): `GET /billing/me` e
   `GET /billing/me/documents`.
   - No topo, o cartão "Seu contrato" do esboço, de `GET /billing/me`:
     situação, início, pacote, tipo, licenças, total mensal (`formatBrl`), dia
     de vencimento e, se houver `scheduledTerms`, a linha "A partir de …".
     Datas `@db.Date` com `formatBillingDate`. Sem contrato ACTIVE, o cartão
     não aparece.
   - Pendente, pelo `pendingDocumentMode` com o `designatedAdmin` do
     `GET /billing/me`:
     - `'accept'` (o indicado): título, data do envio, `ContractDocumentView`
       com o texto inteiro **na rolagem da página** (sem caixa com rolagem
       própria), depois a caixa "Li e concordo com o Contrato de Licença de
       Uso" (ou "com o Aditivo"), o aviso do que é registrado e o botão
       "Aceitar";
     - `'readonly'` (outro ADMIN): título "Aguardando o aceite de {nome}", data
       do envio e o texto inteiro, sem a caixa e sem o botão;
     - `'designee-invalid'`: o texto inteiro, sem a caixa e sem o botão, com o
       aviso "O administrador indicado ({nome}) não está mais ativo. Fale com
       a Addere para indicar outro.".
   - Ao montar, calcule `sha256Hex(doc.renderedBody)`. Diferente de
     `doc.sha256` ⇒ mensagem "Não foi possível conferir o texto. Recarregue a
     página." e "Aceitar" fica desabilitado.
   - "Aceitar" só habilita com a caixa marcada e o hash conferido. Envia o
     hash **calculado no navegador**. Sucesso ⇒ toast, `refreshUser()` e
     recarga da lista. `DOCUMENT_NOT_PENDING`, `DOCUMENT_HASH_MISMATCH` e
     `NOT_DESIGNATED_ADMIN` (o indicado mudou com a página aberta) mostram a
     mensagem da API e recarregam.
   - Aceitos: tipo, quando e quem; "Ver" (`/contrato/{id}`) e "Imprimir / salvar
     PDF" (`/contrato/{id}/imprimir`).
   - Sem nenhum documento: `Card` com "Sua empresa ainda não tem contrato no
     Addere."
   - SUPERADMIN nesta rota: aviso "Os contratos ficam na ficha do cliente, em
     Gestão Addere" com link.
6. **`/contrato/[id]`**: o link do e-mail. SENT ⇒ a mesma área de aceite, com
   os mesmos três modos (lê o `designatedAdmin` do `GET /billing/me`);
   ACCEPTED ⇒ texto, `AcceptanceRecord` e "Imprimir"; CANCELLED ⇒ "Este
   documento foi cancelado ou substituído." com link para `/contrato`.
7. **`/contrato/[id]/imprimir`**: ADMIN usa `GET /billing/me/documents/:id`;
   SUPERADMIN usa `GET /admin/billing/documents/:id`. Mostra
   `ContractDocumentView` e `AcceptanceRecord`, e um botão "Imprimir / salvar
   PDF" (`window.print()`) com `print:hidden`.
8. **`globals.css`**: estilos de `.contract-doc` (títulos em Plus Jakarta Sans,
   corpo em Inter, espaçamento múltiplo de 4, cores por variável) e um
   `@media print` que força texto preto em fundo branco **também no tema
   escuro**, tira sombras e bordas de card e evita quebrar o bloco de aceite.
9. **`(admin)/layout.tsx`**:
   - `print:hidden` na `<aside>` e no `<header>` do celular;
     `print:overflow-visible print:p-0` no `<main>` (em `80fe328`, `:312`,
     `:405` e `:425`; o 013 desloca essas linhas);
   - item **Contrato** (`/contrato`, ícone `FileSignature`) no grupo Empresa,
     com `requires: 'companyAdmin'`;
   - `PendingContractBanner` acima do conteúdo do `<main>` quando
     `isAdmin && user.company?.pendingDocument` e a rota não começa com
     `/contrato`. O texto sai de `pendingBannerText`, com o modo calculado
     sobre `pendingDocument.designatedAdmin`: para o indicado, "Contrato
     aguardando seu aceite." (ou "Aditivo …") e o botão "Ler e aceitar"; para
     os outros ADMINs, "Contrato aguardando o aceite de {nome}." e o botão
     "Ver contrato".

**Verificar**: `npm run type-check && npm run lint && npm test --workspace=apps/web && npm run build:web` → exit 0.

### Passo 14: Processos do contrato (`docs/billing/README.md`)

O 013 não cria este arquivo; os planos 015 a 018 acrescentam seções nele.
Crie-o com um título curto ("Gestão Addere — operação") e a seção "Contrato e
aceite". A minuta do contrato (aviso, item 4 de "Bloqueia a publicação") exige
que ele exista antes da publicação.

- **Publicar um modelo**: só depois do OK do advogado; quem tira as marcas
  `[[REVISAR]]` é o superadmin, no painel; os itens que bloqueiam a publicação
  (instrumento de transferência internacional conferido fornecedor a
  fornecedor; Termos e Privacidade do site alinhados e publicados; monitor de
  disponibilidade com histórico mensal da API e do painel no ar, medindo há
  algumas semanas) precisam estar resolvidos antes. Contrato e aditivo são
  publicados juntos (o aditivo cita cláusulas do contrato).
- **A tabela de promessas** da minuta do contrato (24 linhas), com o dono de
  cada uma e a data em que o plano dono entrou em produção.
- **Disponibilidade e crédito** (§9.7 a §9.10): qual monitor mede a API e o
  painel e onde fica o histórico por mês civil; como fechar o mês (minutos
  fora, sem as janelas de manutenção comunicadas antes); o crédito
  proporcional (`minutos fora ÷ minutos do mês × valor mensal daquele mês`),
  lançado à mão como item `DISCOUNT` "Crédito por indisponibilidade" na fatura
  da competência seguinte (plano 016); e, sem fatura seguinte, o pagamento por
  Pix em até 30 dias do encerramento, fora do sistema.
- **Administrador indicado** (decisão 10): o superadmin só cria usuário ADMIN
  por indicação da Empresa e só troca o indicado a pedido dela, guardando o
  pedido (e-mail do representante legal ou do contato principal). A troca
  com documento enviado cancela o documento. Registre o achado do Estado
  atual: o ADMIN do cliente consegue criar ou promover ADMIN pelo
  `/companies/:id/users` e trocar e-mail e senha de outro ADMIN; fechar isso é
  pendência fora deste plano.
- **O que é cumprido à mão até o plano dono entrar**: enquanto o 015, o 016 e
  o 017 não estiverem em produção, o limite de licenças, a emissão de faturas,
  os avisos de atraso e a suspensão com aviso de 10 dias são feitos pela
  Addere fora do sistema. Escreva como, item a item.
- **Processos sem sistema**: incidente comunicado à Empresa em até 48 horas
  (quem avisa e por qual canal); pedido de cópia dos dados em até 30 dias do
  encerramento, entregue em até 15 dias corridos, e eliminação depois;
  eliminação dos dados de um titular a pedido da Empresa.
- **Retenção**: contrato, documentos e registros de aceite durante a vigência
  e por 5 anos depois do encerramento. Nenhum job de expurgo toca
  `billing_contract_documents`.
- **IP do aceite**: `TRUST_PROXY_HOPS` e como conferir nos logs do Render.
- **Levar um cliente às condições gerais novas**: aditivo com "Levar às
  condições gerais publicadas", sempre com "vale a partir de" ≥ envio + 30
  dias, e só com um modelo de aditivo que preveja o anexo (o v1 não prevê).

**Verificar**: `grep -nE "postgres(ql)?://|neon\.tech|passw(or)?d=" docs/billing/README.md`
→ nada (nenhuma URL de banco nem credencial no documento).

### Passo 15: Migration (último commit do monorepo)

> ⚠️ **NÃO rode `npm run db:migrate`, `prisma migrate dev`, `prisma migrate
> reset` nem `prisma db push`. NÃO conecte no Neon (staging nem produção).**
> Cada bloco abaixo é **uma chamada só**, a partir da raiz do monorepo, com as
> duas URLs na mesma linha. Antes de apertar Enter, confira que as duas dizem
> `localhost`. É o mesmo procedimento do passo 11 do 013.

1. Nome da pasta: `date -u +%Y%m%d%H%M%S` no momento da execução, mais
   `_contract_documents`. O timestamp tem de ser posterior a `20261014120000`
   **e** à migration do 013 (`<…>_billing_clients_contracts`); confira com
   `ls packages/db/prisma/migrations | tail -3`. Abaixo, `<pasta>` é esse nome.
2. Suba o Postgres local e crie os dois bancos descartáveis:

   ```bash
   docker compose up -d db && \
     docker compose exec db createdb -U addere_dev_user addere_p014 && \
     docker compose exec db createdb -U addere_dev_user addere_p014_shadow
   ```

3. Gere o DDL (delta, nunca `--from-empty`). A saída vai primeiro para um
   arquivo **fora** de `migrations/`: se o `>` criasse o `migration.sql` vazio
   dentro da pasta, o `--from-migrations` o leria junto.

   ```bash
   cd packages/db && L=postgresql://addere_dev_user:addere_dev_password@localhost:5432 && \
     DATABASE_URL=$L/addere_p014 DATABASE_URL_DIRECT=$L/addere_p014 npx prisma migrate diff \
       --from-migrations ./prisma/migrations \
       --to-schema-datamodel ./prisma/schema.prisma \
       --shadow-database-url $L/addere_p014_shadow \
       --script > ../../contract_014.sql
   ```

   ```bash
   mkdir -p packages/db/prisma/migrations/<pasta> && \
     mv contract_014.sql packages/db/prisma/migrations/<pasta>/migration.sql
   ```

   O delta só pode ter:
   - 3 `CREATE TYPE` (`ContractDocumentKind`, `ContractTemplateStatus`,
     `ContractDocumentStatus`);
   - 2 `CREATE TABLE` (`billing_contract_templates`,
     `billing_contract_documents`);
   - 2 colunas novas em tabelas do 013: `"requestedByClient"` em
     `billing_contract_terms` e `"designatedAdminId"` em
     `billing_company_contracts` (passo 4);
   - 4 índices (o único de `kind, version` e os três `@@index`);
   - 6 `FOREIGN KEY`: documento → empresa, contrato, termos, modelo e modelo
     das condições, e contrato → usuário indicado
     (`billing_company_contracts_designatedAdminId_fkey`, para `"users"`).

   Se preferir escrever à mão, o resultado tem de ser o mesmo.
4. **No topo**, o comentário em português, no formato de
   `20261014120000_intel_llm_calls/migration.sql`:

   ```sql
   -- Contrato de licença de uso e aceite eletrônico (plano 014): modelos de
   -- texto versionados e os documentos enviados para aceite, com o texto
   -- congelado, o SHA-256 e o registro do aceite. Cria tipos e tabelas e
   -- acrescenta duas colunas a tabelas do plano 013: o aditivo a pedido da
   -- Empresa nos termos e o administrador indicado no contrato.
   -- Dados: as versões v1 do contrato e do aditivo, em rascunho.
   ```

5. **No fim**, as duas versões v1:

   ```sql
   -- Versões v1 em rascunho. Corpo de docs/billing/*-v1.md entre os marcadores
   -- de texto publicável. Publicar exige o OK do advogado e tirar as marcas
   -- [[REVISAR]] no painel (Gestão Addere › Modelos de contrato).
   INSERT INTO "billing_contract_templates" ("id", "kind", "version", "status", "body", "changeNote", "createdAt", "updatedAt")
   VALUES (
     gen_random_uuid()::text, 'CONTRACT', 1, 'DRAFT',
     $contrato_v1$<corpo do contrato>$contrato_v1$,
     '1.1-minuta (15/10/2026): adaptado da minuta 1.6 do BaiaCerta, revisão jurídica de 04/10/2026, com as decisões de 15/10/2026',
     NOW(), NOW()
   );

   INSERT INTO "billing_contract_templates" ("id", "kind", "version", "status", "body", "changeNote", "createdAt", "updatedAt")
   VALUES (
     gen_random_uuid()::text, 'AMENDMENT', 1, 'DRAFT',
     $aditivo_v1$<corpo do aditivo>$aditivo_v1$,
     '1.1-minuta (15/10/2026): modelo de aditivo, com o administrador indicado',
     NOW(), NOW()
   );
   ```

   - O corpo é o trecho anotado no passo 1(d), copiado **sem mudar nada**,
     sem as linhas dos marcadores. O primeiro caractere vem logo depois da
     etiqueta de abertura e o último logo antes da de fechamento.
   - Nenhum corpo contém a própria etiqueta:
     `grep -c 'contrato_v1\$\|aditivo_v1\$' docs/billing/*-v1.md` → `0` nos
     dois.
   - O `id` é `TEXT` e o `@default(uuid())` do Prisma é gerado no cliente, por
     isso o `gen_random_uuid()::text` (nativo do Postgres desde a versão 13;
     o 013 usa o mesmo).
   - O arquivo fica em UTF-8: `file migration.sql` → "UTF-8 … text".
6. Aplique num banco limpo e confira que o schema bate:

   ```bash
   cd packages/db && L=postgresql://addere_dev_user:addere_dev_password@localhost:5432 && \
     DATABASE_URL=$L/addere_p014 DATABASE_URL_DIRECT=$L/addere_p014 npx prisma migrate deploy && \
     DATABASE_URL=$L/addere_p014 DATABASE_URL_DIRECT=$L/addere_p014 npx prisma migrate diff \
       --from-url $L/addere_p014 --to-schema-datamodel ./prisma/schema.prisma --exit-code
   ```

   → o `deploy` aplica todas as migrations sem erro; o `diff` sai com
   **exit 0**.
7. Confira as linhas gravadas e compare cada corpo com o arquivo de origem:

   ```bash
   docker compose exec -T db psql -U addere_dev_user -d addere_p014 -At \
     -c 'SELECT kind, version, status FROM billing_contract_templates ORDER BY kind'
   ```

   → `AMENDMENT|1|DRAFT` e `CONTRACT|1|DRAFT`.

   ```bash
   docker compose exec -T db psql -U addere_dev_user -d addere_p014 -At \
     -c "SELECT body FROM billing_contract_templates WHERE kind = 'CONTRACT'" > contrato-db.tmp && \
     diff --strip-trailing-cr contrato-db.tmp <(sed -n '<primeira>,<última>p' docs/billing/contrato-licenca-de-uso-v1.md); \
     rm -f contrato-db.tmp
   ```

   O `diff` só pode mostrar linha em branco no fim. Repita para o aditivo.
8. O corpo gravado tem marcas `[[REVISAR` (por isso não publica) e não tem o
   envelope de minuta: um `SELECT` com `position('[[REVISAR' in body) > 0` dá
   verdadeiro nos dois, e com `position('TEXTO PUBLICÁVEL' in body) > 0` ou
   `position('Histórico de versões' in body) > 0` dá falso.
9. Apague os bancos descartáveis:

   ```bash
   docker compose exec db dropdb -U addere_dev_user addere_p014 && \
     docker compose exec db dropdb -U addere_dev_user addere_p014_shadow
   ```

10. Commit só com a pasta da migration.

**Verificar**: os itens 3, 6, 7 e 8 acima;
`grep -nE "DROP|ALTER TABLE \"(companies|users|billing_[a-z_]+)\"|ALTER TYPE" packages/db/prisma/migrations/<pasta>/migration.sql`
→ só estas linhas: as `ALTER TABLE "billing_contract_documents" ADD
CONSTRAINT …` das chaves estrangeiras; `ALTER TABLE "billing_contract_terms"
ADD COLUMN "requestedByClient" …`; e, em `billing_company_contracts`, o `ADD
COLUMN "designatedAdminId" TEXT` e o `ADD CONSTRAINT
"billing_company_contracts_designatedAdminId_fkey" … REFERENCES "users"("id")`.
Nada de `DROP`, de `ALTER TYPE` nem de outro `ALTER` em tabela que já existia.
`npm run db:generate && npm run type-check` → exit 0; `git show --stat HEAD` →
só o `migration.sql`.

### Passo 16: Termos e Privacidade do site (outro repositório)

Leia `c:\Projetos-Claude\sites\addere\CLAUDE.md` antes e respeite as regras
dele: HTML estático, sem build, `termos.html` e `privacidade.html` com o mesmo
`<style>` byte a byte, deploy manual. Branch
`advisor/014-termos-e-privacidade` a partir do `master`.

O que alinhar está listado no aviso da minuta do contrato
(`contrato-licenca-de-uso-v1.md`, "Bloqueia a publicação", item 2); este passo
cumpre essa lista. A redação abaixo é o ponto de partida: ela segue a minuta e
a revisão jurídica do BaiaCerta. Não prometa nada que não esteja na tabela de
promessas da minuta.

**Já feito em 15/10/2026, só confira** (commit `ec49444` do site, na `master`,
feito por outra pessoa): a razão social "GH ENGENHARIA LTDA - ME" nas duas
páginas e no rodapé delas; o encarregado com o nome completo, Gustavo Henrique
Palitot Costa, na seção 12 da `privacidade.html` (`:243`), igual ao §8.8 do
contrato e ao `CONTRATADA.encarregado`; o `CLAUDE.md:182` ("Controladora: GH
ENGENHARIA LTDA - ME, CNPJ 07.841.407/0001-90."). Se algum deles não estiver
na `master`, PARE: alguém desfez o commit.

**`termos.html`**

- `:127` — "Última atualização" com a data da execução.
- `:139` — "Se houver proposta comercial ou contrato assinado com a Empresa
  Contratante, as condições específicas desse documento prevalecem…" → "Para
  a Empresa Contratante, o Contrato de Licença de Uso aceito no painel
  prevalece sobre estes Termos naquilo em que forem diferentes." (contrato
  §15).
- `:152` — "Quando a Empresa Contratante liga a Camada de Inteligência" →
  "Quando a Empresa Contratante contrata a Camada de Inteligência".
- **"Proposta comercial" sai dos Termos**, que passam a remeter ao Contrato de
  Licença de Uso: além do `:139` e da seção 7, a seção 12 (`:215`, "Horários
  e prazos de atendimento são os da proposta comercial" → "…os do Contrato de
  Licença de Uso, quando houver") e a seção 18 (`:245`, "salvo disposição
  diferente na proposta comercial ou em lei" → "…no Contrato de Licença de
  Uso ou em lei").
- **Seção 7** (`:176-179`), novo texto: "Fora do piloto, o Addere é remunerado
  por pacote de licenças, nas condições do Contrato de Licença de Uso aceito
  pela Empresa Contratante no painel: pacote, quantidade de licenças, tipo de
  licença (padrão ou com a Camada de Inteligência), valores, carência e dia de
  vencimento. A cobrança é mensal e pós-paga. Alterações de pacote, de tipo ou
  de valor só valem depois de aceitas em aditivo, e o aumento de preço é
  comunicado com antecedência mínima de 30 dias."
- **Seção 13** (`:218-221`): "O tratamento de dados pessoais segue a Política
  de Privacidade. Em relação aos dados dos clientes da Empresa Contratante e à
  atividade da equipe dela no Addere, como pedidos, visitas e check-in com
  localização, a Empresa Contratante é a controladora e nós atuamos como
  operador, conforme as suas instruções. Somos controladores dos tratamentos de
  finalidade própria: as contas de acesso, a cobrança da licença, o registro do
  aceite do contrato, o monitoramento de erros e de segurança e os dados
  agregados de uso."
- **Seção 15** (`:228-231`): troque "por indisponibilidade do ERP, da internet
  ou de provedores de terceiros" por "por interrupções decorrentes de falha de
  internet, de rede ou de energia da Empresa Contratante, dos seus dispositivos
  ou do seu ERP, nem de caso fortuito ou força maior (art. 393 do Código
  Civil)". O resto da seção fica.
- **Seção 16** (`:233-236`): "Podemos suspender o acesso em caso de violação
  destes Termos ou de risco à segurança do serviço, com aviso à Empresa
  Contratante sempre que possível. Por atraso no pagamento, a suspensão só
  acontece depois de aviso ao contato de cobrança da Empresa Contratante com
  antecedência mínima de 10 (dez) dias corridos, informando a data prevista; a
  suspensão não apaga dados. A Empresa Contratante pode cancelar a qualquer
  tempo, com efeito no fim do mês do pedido; nós rescindimos com aviso de 30
  dias, salvo uso ilícito ou violação grave. Encerrada a contratação, o acesso
  é bloqueado, a Empresa Contratante pode pedir cópia dos seus dados em até 30
  dias, entregue em até 15 dias corridos, e depois os dados são eliminados,
  ressalvados os registros que a lei manda guardar. Os pedidos já
  sincronizados permanecem no ERP da Empresa Contratante." (contrato §3.9 e
  §12).
- **Seção 17** (`:238-241`): mantenha a primeira frase e troque a última por
  "Para a Empresa Contratante, alterações nas condições contratadas seguem o
  Contrato de Licença de Uso: só valem depois de aceitas em termo aditivo, e o
  aumento de preço é comunicado com antecedência mínima de 30 dias." (contrato
  §13).

**`privacidade.html`**

- `:127` — data da execução.
- `:174` (3.9) — "Quando a Empresa Contratante liga a camada" → "Quando a
  Empresa Contratante contrata a camada".
- **Seção 3**, dois itens novos depois do 3.9:
  - "**3.10 Dados de contratação e cobrança.** Da Empresa Contratante,
    tratamos razão social, nome fantasia, CNPJ, inscrição estadual, endereço,
    o representante legal (nome, CPF e cargo), o contato principal (nome,
    e-mail e telefone) e o contato de cobrança (nome, e-mail e telefone),
    usados no Contrato de Licença de Uso, nas faturas e nos avisos de
    cobrança." É a lista de campos do `ClientProfile` do 013; confira no
    schema e não declare nem mais nem menos (as observações internas da
    Addere não entram).
  - "**3.11 Registro de aceite eletrônico.** Quando o administrador indicado
    pela Empresa Contratante aceita o Contrato de Licença de Uso ou um termo
    aditivo no painel, ou pede licenças adicionais pelo painel, registramos
    quem fez (nome e e-mail), a data e a
    hora, o endereço IP, a identificação do navegador e o código de
    integridade (SHA-256) do texto aceito." O pedido de licenças nasce no
    015; ele já entra aqui porque o contrato (§14.3) o promete e a Política
    vai ao ar junto com o contrato.
- **Seção 4** (`:176-179`): acrescente a finalidade "gerir o Contrato de
  Licença de Uso com a Empresa Contratante, emitir a cobrança e registrar o
  aceite eletrônico (execução de contrato e cumprimento de obrigação legal)".
  Sem ela, a coleta nova da seção 3 fica sem finalidade declarada.
- **Seção 5** (`:181-199`), papéis: antes da lista de operadores, o parágrafo
  "A GH ENGENHARIA LTDA - ME é controladora dos tratamentos de finalidade
  própria: contas de acesso, cobrança da licença, registro do aceite do
  contrato, monitoramento de erros e de segurança e dados agregados de uso. Em
  relação aos dados dos clientes da Empresa Contratante e à atividade da equipe
  dela (pedidos, visitas e check-in com localização), a Empresa Contratante é a
  controladora e nós atuamos como operador; os provedores abaixo atuam como
  suboperadores." Na linha do Resend (`:192`): "envio de e-mails operacionais,
  como a recuperação de senha, o envio do contrato para aceite e os avisos de
  cobrança". Confira que a seção 2 (`:149-151`) continua coerente com esse
  parágrafo.
- **Seção 8** (`:211-220`): "Os dados de contratação e de cobrança e os
  registros de aceite são mantidos durante a vigência do contrato e por 5 anos
  depois do encerramento, pelos prazos fiscais e para o exercício regular de
  direitos."
- **Não mexa na seção 6** (transferência internacional). Ela depende do item 1
  de "Bloqueia a publicação" da minuta (conferir o instrumento de cada
  fornecedor), que é processo, não código.

**`sitemap.xml`** (`:4-5`): `lastmod` da privacidade e dos termos com a data da
execução (o `ec49444` deixou 2026-10-15; se for o mesmo dia, fica). O da raiz
fica.

**Não edite `index.html`.** A branch `landing/inteligencia-pelo-contrato` do
site já tem a correção; publicar a landing junto com o 014, nem antes nem
depois. A correção trata do `index.html:2153` e do mock `:2221-2235`, que
dizem que o ADMIN liga a Inteligência em Configurações. A razão social da
landing (`:2408` e `:2503`) já está com "- ME" na `master` (`ec49444`).

**Verificar** (no repo do site):

- o `diff` do `<style>` da tabela de comandos → vazio;
- `grep -c "GH ENGENHARIA LTDA - ME" termos.html privacidade.html` → 3 nos
  termos e 4 na privacidade (as três de hoje mais o parágrafo de papéis);
- `grep -c "GH ENGENHARIA LTDA" termos.html privacidade.html` dá os mesmos
  números (nenhuma ocorrência ficou sem o "- ME");
- `grep -n "por representante ativo\|provedores de terceiros\|proposta comercial\|contrato assinado\|antecedência razoável" termos.html`
  → nada;
- `grep -n "liga a camada\|liga a Camada" termos.html privacidade.html` → nada;
- `grep -c "Gustavo Henrique Palitot Costa" privacidade.html` → 1 (só
  conferência; o `ec49444` já fez);
- `git diff --stat` → só `termos.html`, `privacidade.html` e, se a data mudou,
  `sitemap.xml`;
- um commit (`site: termos e privacidade acompanham o contrato de licença`),
  sem push e **sem deploy**. Termos e Privacidade só vão ao ar junto com a
  publicação do contrato em produção.

### Passo 17: Conferência no staging (sem commit; quem opera, depois do merge)

Este passo não é do executor: ele depende de merge e deploy. Deixe-o no
relatório final como lista a cumprir.

1. **IP real.** Com a API no staging, faça uma requisição e procure nos logs
   do Render o `remoteAddress` dela. Compare com o seu IP público
   (`curl https://api.ipify.org`). Se aparecer IP do proxy, ponha
   `TRUST_PROXY_HOPS=2` no painel do serviço de staging e repita. Se continuar
   errado, **PARE**: não publique o 014 em produção.
2. **`WEB_URL`** do staging aponta para o painel do staging, e o de produção
   para o de produção.
3. O ponta a ponta do Plano de testes.
4. **Antes de publicar o contrato em produção:** o monitor de disponibilidade
   da API e do painel no ar, com histórico mensal (§9.7; ver PARADA). No
   repo do site, Termos e Privacidade (branch
   `advisor/014-termos-e-privacidade`) e a landing (branch
   `landing/inteligencia-pelo-contrato`) vão ao ar junto com o 014, nem antes
   nem depois.

## Plano de testes

**Novos testes (API, Vitest):**

- `__tests__/reais-por-extenso.test.ts` e `__tests__/contract-template.test.ts`
  — passo 2;
- `lib/__tests__/trust-proxy.test.ts` e `env.test.ts` — passo 3;
- `__tests__/contract-fields.test.ts` — passo 5;
- `__tests__/contract-templates.test.ts` — passo 6;
- `__tests__/amendment-rules.test.ts` e `__tests__/contract-documents.test.ts`
  — passo 7 (inclusive a troca do administrador indicado e o e-mail só para
  ele);
- `__tests__/contract-accept.test.ts` (inclusive só o indicado aceita) e
  `__tests__/apply-due-terms.test.ts` — passo 8;
- `admin-routes.test.ts`, bloco de config — passo 9;
- `billing-routes.test.ts` (do 013), um caso novo: rascunho editado em
  PENDING_ACCEPTANCE — passo 7.

Padrão a espelhar: `admin-routes.test.ts` e o `billing-routes.test.ts` do 013
(`buildApp`, `app.inject`, `prismaMock`, tokens por papel). O Vitest do web só
roda `.test.ts`: as telas não ganham teste de render, por isso a lógica fica
nos módulos puros de `packages/types` e de `lib/`.

**Novos testes (web, Vitest):** `lib/__tests__/contract-hash.test.ts` e
`lib/__tests__/contract-acceptance.test.ts`.

**Ponta a ponta no staging** (banco próprio; depois do merge, por quem opera):

1. Em `/gestao/modelos`, crie a v2 de cada tipo a partir da v1, tire as marcas
   `[[REVISAR]]` (cópia de teste, **só no staging**) e publique. Antes, tente
   publicar com uma marca: o botão fica desabilitado.
2. Cadastre o cliente e monte o contrato Pacote 10 Padrão, carência 0,
   vencimento dia 10. "Pré-visualizar": todos os campos preenchidos. Apague o
   CPF do representante: a prévia lista o campo e o envio é recusado.
3. Sem ADMIN na empresa: o select "Administrador indicado pela Empresa" vem
   vazio, com o aviso de criar o administrador, e "Enviar" responde "Escolha
   o administrador indicado pela Empresa antes de enviar."
4. Crie dois ADMINs (Maria e João), indique Maria e envie. Só Maria recebe o
   e-mail, com link para o painel **do staging**; João e o `billingEmail`
   não recebem nada.
5. Mude o dia de vencimento para 5: o documento aparece cancelado ("rascunho
   alterado depois do envio") e o contrato volta a rascunho. Envie de novo.
   Troque o indicado para João: o documento é cancelado de novo
   ("administrador indicado trocado depois do envio"). Volte para Maria e
   envie de novo.
6. Entre como João: a faixa diz "Contrato aguardando o aceite de Maria Souza";
   em `/contrato`, o texto aparece sem a caixa e sem o botão; um
   `POST /billing/me/documents/:id/accept` com o token dele responde 403
   `NOT_DESIGNATED_ADMIN`. Entre como Maria: a faixa diz "Contrato aguardando
   seu aceite". Em `/contrato`, "Aceitar" só habilita com a caixa marcada.
   Aceite. A faixa some para os dois; chegam os e-mails de confirmação.
7. Na ficha: contrato ACTIVE, início hoje, 1ª competência no mês seguinte; na
   linha do tempo, o **seu** IP, o navegador e o hash.
8. `/contrato/{id}/imprimir` no tema escuro: o PDF sai preto no branco, sem
   sidebar, com o bloco de aceite inteiro.
9. Numa aba antiga, aceite de novo o mesmo documento: "Este documento já foi
   aceito ou cancelado."
10. Configurações do ADMIN: Inteligência só leitura. Aba Inteligência do
    SUPERADMIN: "Definida pelo contrato". `PUT /intel/admin/config` com valor
    diferente: 403 como ADMIN, 409 como SUPERADMIN.
11. Proponha Padrão → Com Inteligência com valor do pacote maior e sem data: o
    envio é recusado com a data mínima. Com a data mínima, envie e aceite: os
    termos ficam EFFECTIVE com `effectiveFrom` às 00:01 dessa data, o
    `/contrato` mostra "A partir de …", e a Inteligência **não** muda ainda.
12. Descarte o que sobrar e proponha um aditivo que **não** aumenta preço (Com
    Inteligência pelo mesmo valor do pacote e do adicional — só no staging — ou
    mais licenças adicionais pelo mesmo valor unitário) e aceite: vale no
    aceite. Com a troca de tipo, a Inteligência liga na hora; no app, depois de
    recarregar a sessão, aparecem Hoje e Rota.
13. Publique a v3 do contrato: o documento aceito não muda (mesmo hash). A ficha
    mostra "aceitas v2 · publicada v3". Com um aditivo de teste que preveja o
    anexo, "Levar às condições gerais publicadas" exige data ≥ envio + 30 dias.
14. Logs do Render durante os passos acima: nenhum texto de contrato, CPF ou
    e-mail de cliente.

## Critérios de conclusão

- [ ] Passo 1 conferido: os dois arquivos existem, todo campo está na lista
      fechada, o corpo só usa a sintaxe suportada, toda promessa tem dono e as
      decisões de 15/10/2026 estão nos textos (administrador indicado,
      encarregado, §9.7 a §9.10)
- [ ] `npm run db:generate`, `npm run type-check` e `npm run lint` → exit 0
- [ ] `npm test` (API, web e mobile) passa, com todos os casos novos
- [ ] `npm run build:api && npm run build:web` → exit 0
- [ ] Migration `<YYYYMMDDHHMMSS>_contract_documents`, posterior à do 013,
      aplicada com `migrate deploy` em banco limpo; `migrate diff --exit-code`
      → exit 0
- [ ] A migration só cria os três enums, as duas tabelas `billing_contract_*`,
      as duas colunas novas (`requestedByClient` e `designatedAdminId`), os 4
      índices e as 6 chaves estrangeiras, e grava as duas v1 em DRAFT com o
      corpo idêntico ao trecho entre os marcadores dos `docs/billing/*-v1.md`
- [ ] Só o administrador indicado aceita: `assertDesignatedAdmin` no
      `acceptDocument`, dentro da transação; o envio recusa sem indicado e
      manda um e-mail só, a ele; `grep -rn "COMPANY_HAS_NO_ADMIN" apps packages`
      → nada
- [ ] A migration está no último commit do monorepo, sozinha
- [ ] Nenhum comando de banco contra o Neon; `migrate dev`, `migrate reset` e
      `db push` não aparecem em lugar nenhum; nenhum `.env` criado ou copiado
- [ ] `git diff --stat origin/staging..HEAD -- apps/mobile` → vazio
- [ ] `git diff --stat origin/staging..HEAD -- apps/api/src/middleware/require-vendor-code.ts apps/api/src/modules/intelligence/jobs apps/api/src/modules/intelligence/engine apps/api/src/modules/intelligence/geo apps/api/scripts`
      → vazio
- [ ] `grep -rn "dangerouslySetInnerHTML" apps/web/src` → só onde a entrada é
      `renderContractMarkdown`
- [ ] Nenhum `update` ou `updateMany` grava `renderedBody` ou `sha256`:
      `grep -rn "renderedBody\|sha256" apps/api/src/modules/billing --include=*.ts`
      mostra escrita só no `create`
- [ ] `grep -n "trustProxy" apps/api/src/app.ts` → uma linha;
      `TRUST_PROXY_HOPS` em `env.ts`, nos dois `.env.example` e nos dois
      serviços do `render.yaml`
- [ ] O que os planos seguintes procuram existe com estes nomes:
      `requireCompanyAdmin`, `me.routes.ts` com `GET /billing/me`,
      `billing-mailer.ts` (`sendBillingEmail`, `escapeHtml`), `formatBrl` e
      `moneyToCents` em `billing.ts`, `syncIntelligenceWithTerms`,
      `cancelSentDocuments`, `refreshUser`, `CompanyContract.designatedAdminId`,
      `assertDesignatedAdmin` e `designatedAdmin` no `GET /billing/me`
- [ ] Repo do site: um commit na branch `advisor/014-termos-e-privacidade`,
      `<style>` idêntico nas duas páginas, sem deploy; no relatório, o lembrete
      de publicar a landing da branch `landing/inteligencia-pelo-contrato`
      junto com o 014
- [ ] Passo 17 listado no relatório final
- [ ] Linha de status atualizada em `plans/README.md`

**Promessas do contrato × sistema** (as 8 linhas do plano aprovado e as 3 da
meta de disponibilidade, que voltou ao contrato em 15/10/2026) — toda linha
precisa de dono antes da publicação do contrato em produção. As linhas deste
plano têm de estar cumpridas e testadas aqui; as outras ficam registradas em
`docs/billing/README.md` com o plano ou o processo que as cumpre.

| O contrato promete | Quem cumpre | Neste plano |
|---|---|---|
| Aviso de suspensão com a data, ≥ 10 dias corridos antes | Código, plano 017: só bloqueia com o aviso gravado há ≥ 10 dias | registrado |
| Suspensão não apaga dados | Código, plano 017: o bloqueio é por rota | registrado |
| Alteração só depois do aceite; até lá vale a versão anterior | Código, plano 014 | testes do passo 8: termos PROPOSED não valem; aditivo só vale no aceite ou na data |
| Aumento de preço comunicado com ≥ 30 dias | Código, plano 014: o aditivo que aumenta preço exige `proposedEffectiveFrom` ≥ envio + 30 dias | testes do passo 7 (`AMENDMENT_NOTICE_TOO_SHORT`) |
| Cancelamento com efeito no fim do mês | Código, plano 016 | registrado |
| Licença adicional cobrada a partir do mês seguinte | Código, planos 015 e 016 | registrado |
| Incidente comunicado em 48 h | Processo, em `docs/billing/README.md` | passo 14 |
| Cópia dos dados em 30 + 15 dias e eliminação depois | Processo manual; a automação fica nas pendências | passo 14 |
| Disponibilidade ≥ 99,5 % por mês civil (§9.7) | Monitor de disponibilidade com histórico mensal da API e do painel. **Pré-requisito de publicação do contrato**; ainda não existe | registrado (passo 14 e PARADA) |
| Crédito proporcional abatido na fatura seguinte (§9.8) | Processo manual: item `DISCOUNT` "Crédito por indisponibilidade" na fatura, plano 016, com os minutos do monitor | registrado (passo 14) |
| Crédito sem fatura seguinte pago por Pix em 30 dias (§9.10) | Processo manual | registrado (passo 14) |

A minuta do contrato acrescentou 16 linhas a essa tabela (aviso de
`contrato-licenca-de-uso-v1.md`, linhas 9 a 24). As três da disponibilidade
(21 a 23) estão na tabela acima. Quatro são deste plano e também são critério
de conclusão:

| # na minuta | O contrato promete | Neste plano |
|---|---|---|
| 14 | Camada de Inteligência ligada e desligada pelo tipo de licença (§3.6) | passos 8 e 9: `syncIntelligenceWithTerms`, o 403/409 do `PUT` de config e o switch só leitura |
| 16 | Registro do aceite (usuário, data e hora, IP, navegador, SHA-256), texto congelado, impressão em PDF (§14) | passos 3, 8 e 13; o IP real conferido no staging (passo 17) |
| 17 | Aditivo sem aumento de valor, ou a pedido da Empresa, vale no aceite; com aumento (sem pedido) ou nova versão das condições, 30 dias (§13) | passo 7: `isPriceIncrease` e `assertAmendmentNotice` |
| 24 | Só o administrador indicado no quadro-resumo aceita e pede licenças (§3.5, §14.1) | passos 7 e 8: o envio exige indicado, o e-mail vai só para ele e o aceite passa por `assertDesignatedAdmin` (403 `NOT_DESIGNATED_ADMIN`). O pedido de licenças é do 015, com a mesma função |

As outras nove linhas acrescentadas têm dono em outro plano ou em processo, e
vão para `docs/billing/README.md` (passo 14). Promessa do texto que não esteja
em nenhuma das 24 linhas é PARADA (passo 1).

## Condições de PARADA

- O 013 não está mergeado na `staging`, ou o que ele entregou não bate com o
  que este plano usa (nomes de modelo e de tabela `billing_*`,
  `resolveCurrentTerms`, `resolveCompetenceTerms`, `computeBillingCalendar`,
  `saveContractDraft`, `recordBillingEvent`, `AppError.code`,
  `getApiErrorCode`, `'companyAdmin'`, `ContratoTab.tsx`).
- `docs/billing/contrato-licenca-de-uso-v1.md` ou
  `docs/billing/aditivo-contratual-v1.md` não existem; usam campo fora da lista
  fechada; usam `aditivo.*` no contrato; usam sintaxe que o renderizador não
  suporta no corpo; ou têm promessa sem dono na tabela.
- Parecer necessário editar os textos de `docs/billing/`.
- Uma promessa do texto não ter quem a cumpra.
- O IP no staging continuar sendo o do proxy depois de ajustar
  `TRUST_PROXY_HOPS` (passo 17). Não publique o 014 em produção assim.
- Alguém pedir para publicar o modelo em produção ainda com `[[REVISAR]]`, ou
  com um item que bloqueia a publicação em aberto (transferência
  internacional não conferida; Termos e Privacidade do site não alinhados). O
  código impede a primeira; a segunda é processo, e o executor nunca publica
  modelo em produção.
- Publicar o contrato sem o monitor de disponibilidade no ar. O §9.7 promete
  99,5 % de cada mês civil, e o §9.8 calcula o crédito pelos minutos que só o
  monitor mede (item 3 de "Bloqueia a publicação" da minuta).
- Qualquer comando de migration sem as **duas** variáveis
  (`DATABASE_URL` e `DATABASE_URL_DIRECT`) apontando para `localhost`.
- O delta da migration trazer qualquer coisa além do listado no passo 15
  (sinal de schema local divergente ou de migration do 013 faltando).
- Precisar de SQL cru fora do `migration.sql`, ou de nível de isolamento
  SERIALIZABLE.
- Algum leitor de `intelligenceEnabled` precisar mudar.
- Algum teste pré-existente falhar fora do bloco de config de
  `admin-routes.test.ts` (passo 9), ou o caso "contrato ACTIVE → 409" do
  `billing-routes.test.ts` do 013 precisar mudar.
- Parecer necessário guardar no `BillingEvent`, em log ou em e-mail o texto
  do contrato, o IP, o navegador, o CPF ou o e-mail de alguém.

## Notas de manutenção

- **O renderizador é parte do contrato.** O hash cobre o Markdown, não o HTML,
  então mudar o renderizador não invalida aceites. Mas muda como documentos
  antigos aparecem. Toda mudança nele precisa manter o mesmo HTML para os
  corpos v1 (vale um teste com o corpo v1 como fixture).
- **A lista de campos é fechada de propósito.** Campo novo exige código
  (`CONTRACT_FIELDS` e `buildContractFieldValues`) e texto juntos. Tirar um
  campo quebra a publicação de qualquer modelo que o use.
- **`renderedBody` e `sha256` são imutáveis.** Quem revisar deve procurar
  qualquer escrita neles fora do `create`.
- **`TRUST_PROXY_HOPS` depende da infraestrutura do Render.** Se o Render puser
  outra camada na frente (CDN, outro balanceador), o IP volta a ser o do proxy.
  Depois de qualquer mudança de infraestrutura, repita a conferência dos logs.
- **015**: o pedido de licenças aprovado vira termos EFFECTIVE de origem
  LICENSE_REQUEST, sem documento. A licença extra lançada pelo superadmin sem
  pedido (decisão 9) usa o "Propor aditivo" deste plano. O link "Ver contrato"
  do `IntelConfigForm` passa a apontar para `/plano`. O pedido de licenças
  vale como contratação e, como o aceite, é só do administrador indicado: o
  015 chama `assertDesignatedAdmin` e lê o `designatedAdmin` do
  `GET /billing/me`.
- **016**: absorve o ticker `apply-due-terms.ts` no agendador de cobrança e
  implementa o lembrete de documento pendente há mais de 3 dias (usa `sentAt`,
  `lastEmailAt` e `dedupeKey` por documento, com o `sendBillingEmail` deste
  plano). A cobrança lê os termos da competência, não os atuais. No
  encerramento do contrato (decisão D6 do 016), ele chama
  `cancelSentDocuments` e grava `intelligenceEnabled=false`; o ticker deste
  plano só olha contrato ACTIVE, então os dois não brigam.
- **017**: as rotas `/billing/me/*` (inclusive as de documentos e o aceite) e
  o `/auth/me` entram na lista de `allowBlockedCompany`, e `/contrato` fica
  fora da `CompanyBlockedScreen`. Sem isso, uma empresa bloqueada não consegue
  aceitar o aditivo que a desbloquearia. O `refreshUser` deste plano é o que o
  017 usa.
- **O aditivo v1 cita o §6.4, o §6.7, o §13 e o §14 do contrato v1.** Mudar a
  numeração do contrato exige uma versão nova do aditivo, publicada junto
  (aviso da minuta do aditivo, item 1).
- **Levar às condições gerais novas** (decisão de desenho 6): o mecanismo do
  anexo está no código, mas o aditivo v1 diz que as demais cláusulas não
  mudam. Só use com um modelo de aditivo que preveja o anexo, validado pelo
  advogado.
- **Implantação com a Inteligência ligada para teste + contrato Padrão**: a
  Inteligência desliga no aceite. É o contrato valendo, não bug.
- **Landing**: `index.html:2153` e o mock `:2221-2235` do site dizem que o ADMIN
  liga a Inteligência sozinho. A branch `landing/inteligencia-pelo-contrato`
  do site já tem a correção; publicar a landing junto com o 014, nem antes nem
  depois. A razão social com "- ME" da landing já está na `master` do site
  (`ec49444`).
- **Aditivo a pedido da Empresa (desenho 7, decidido em 15/10/2026)**: o
  upgrade Padrão → Com Inteligência sobe o valor do pacote; com a caixa "A
  pedido da Empresa Contratante" marcada, ele vale no aceite, e é assim que o
  passo 9 do ponta a ponta acontece (as abas Hoje e Rota aparecem depois do
  aceite). Sem a caixa, espera 30 dias. A minuta pede ao advogado para
  confirmar o critério do §13, incluindo esta exceção.
- **Quem aceita** (decisão 10, revista em 15/10/2026): só o administrador
  indicado pela Empresa no quadro-resumo, que pode não ser o representante
  legal. O §14.1 da minuta faz quem aceita declarar ter poderes; a minuta
  pergunta ao advogado se a indicação no quadro-resumo, aceita pelo próprio
  indicado, basta como prova de poderes. Se ele disser que não, o aceite
  precisa de outra regra (ex.: só o e-mail do representante), e isso muda o
  passo 8.
- **Troca de indicado com contrato ACTIVE** não exige aditivo. O contrato
  aceito continua com o nome antigo (texto congelado), e o próximo aditivo já
  sai com o novo, porque o aditivo v1.1 nomeia o indicado nas partes. A troca
  só acontece a pedido da Empresa (processo do passo 14). Se o indicado sai da
  empresa e ninguém avisa, aditivos e pedidos de licenças ficam travados: a
  aba Contrato e o `/contrato` mostram o aviso de indicado inválido.
- **ADMIN criando ADMIN** (achado de 15/10/2026, no Estado atual): pelo
  `/companies/:id/users`, o ADMIN do cliente cria ou promove ADMIN, e por
  essas rotas e pelo `/users` troca e-mail e senha de outro ADMIN. Este plano
  não trava isso, porque o indicado só muda pelo select do superadmin.
  Pendência: alinhar o `/companies/:id/users` ao `/users` (só o SUPERADMIN cria
  ou promove ADMIN) e decidir se outro ADMIN pode mexer no e-mail, na senha, no
  papel ou no ativo do indicado. O `companies-scope.test.ts` não cobre essas
  rotas de usuário hoje.
- **Assinatura por plataforma** (Clicksign, D4Sign, ZapSign) continua nas
  pendências da segunda etapa. O registro de aceite deste plano é o que existe
  até lá.
- Quem revisar deve olhar, nesta ordem: (1) a transação do aceite, o
  `assertDesignatedAdmin` relendo o papel no banco e o `updateMany` filtrando
  SENT; (2) o hash calculado no navegador sobre o texto exibido; (3) o
  `trustProxy` por saltos e o teste da entrada forjada; (4) o cancelamento
  automático quando o rascunho ou o indicado muda depois do envio; (5) a regra
  dos 30 dias com datas de São Paulo.
