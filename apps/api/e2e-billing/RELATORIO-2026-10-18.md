# E2E da Fase 6 (planos 013 a 018) contra Postgres real — 18/10/2026

## 1. Ambiente

- **Código:** `dca2cba` (HEAD destacado em `origin/main`), worktree `../addere-e2e`. Rodei `npm install` e `npm run db:generate`. O `npm install` alterou o `package-lock.json`; restaurei com `git checkout` no fim, e o `git status` ficou limpo. Não fiz commit.
- **Banco:** `postgres:16-alpine` (`addere-e2e-db`, porta 5434). Rodei `prisma migrate deploy` (29 migrations), com `DATABASE_URL` e `DATABASE_URL_DIRECT` locais na mesma linha.
  - Pacotes, `billing_settings` e os modelos v1 vêm das migrations.
  - O catálogo de permissões (8) e o SUPERADMIN `superadmin@exemplo.test` (bcrypt) foram criados por script próprio (`seed-local.cjs`). Não rodei o `seed.ts`, porque ele cria usuários `@addere.dev`.
  - Criei mais dois SUPERADMINs por SQL, porque o `jobs/run` aceita só 3 chamadas por minuto por usuário.
- **API:**
  - Subiu com `npx tsx src/server.ts` em `apps/api`, sem `.env` (conferido antes de subir).
  - Variáveis:
    - `NODE_ENV=development`, `PORT=3334`, `WEB_URL=http://localhost:3000`, `TRUST_PROXY_HOPS=1`;
    - `RESEND_API_KEY=re_fake_e2e`, `RESEND_BASE_URL=http://127.0.0.1:3999`;
    - `SENTRY_DSN` vazio e `ANTHROPIC_API_KEY` removida do ambiente;
    - `INTEL_LLM_ENABLED=false`, `INTEL_GEOCODER=mock`, `BILLING_JOBS_ENABLED=false`;
    - `UPLOAD_DIR` na pasta do e2e (`uploads/`).
  - `GET /health` = 200. Reiniciei a API 2 vezes para rodar o ticker `apply-due-terms` no boot.
- **E-mail falso:** `fake-resend.cjs`, que grava cada corpo em `logs/emails.jsonl`.
  - Antes de qualquer fluxo, chegaram ao falso um teste direto do SDK (n=1) e o primeiro e-mail da própria API (esqueci a senha do SUPERADMIN, n=2).
  - Total recebido: 174 e-mails. O modo 500 foi usado no teste do aviso.
- **Inteligência:** as empresas Com Inteligência rodaram NIGHTLY e REFRESH sem nenhuma chamada externa. Não havia contrato publicado nem API de metas, o geocoder era o mock e o LLM estava desligado (conferido no `metadata` dos `intel_job_runs`).
- **Limpeza:**
  - A API (PID 56044) e o falso (PID 37000) foram mortos, e as portas 3334 e 3999 ficaram livres.
  - Rodei `docker rm -f addere-e2e-db`. No `docker ps -a`, o `prenotaia-postgres` continua `Up (healthy)` e o `addere-fase2-pg` continua `Exited`, intocado.
  - Um container `exciting_mendeleev`, que não era meu, estava subindo no início. Não mexi nele, e no fim ele já não existia.

## 2. Roteiro

| # | Item | Resultado | Evidência |
|---|---|---|---|
| 013 | Cadastro com `profile` | PASSOU | `POST /companies` 201, ficha devolve o cadastro; `CLIENT_CREATED` só com nomes de campo |
| 013 | Contrato P10 Padrão, carência 0, vencimento dia 10 | PASSOU | `PUT .../contract` 200, DRAFT, termos v1 PROPOSED |
| 013 | Prévia do calendário | PASSOU | `computeBillingCalendar` dá 1ª competência 2026-11-01 e vencimento 2026-12-10; após o aceite real, o banco gravou 2026-11-01 (e 2026-12-01 com carência 1) |
| 013 | Decimal exato | PASSOU | 1800.00 → `1800.00` no banco e na API; 1800.10 e 0.20 também; edição no lugar, sem versão nova |
| 014 | Publicar v1 com `[[REVISAR` | PASSOU | 422 `TEMPLATE_NOT_PUBLISHABLE` (55 issues), contrato e aditivo |
| 014 | Criar a v2 de cada tipo | FALHOU (roteiro) | 409 `TEMPLATE_DRAFT_EXISTS`: a v1 nasce DRAFT (achado A9). Editei a v1 sem marcas e publiquei (200). Depois criei a v2 a partir da v1 publicada e publiquei |
| 014 | Envio sem indicado | PASSOU | 422 `DESIGNATED_ADMIN_REQUIRED` |
| 014 | Prévia sem campo faltando | PASSOU | antes da indicação faltam `cliente.administradorNome/Email` (esperado); com o indicado, `missing=[]` |
| 014 | E-mail só para Maria, com link, sem o texto | PASSOU | 1 e-mail para `maria@`, link `http://localhost:3000/contrato/<id>`; 0 ocorrência do texto no log |
| 014 | Rascunho mexido depois do envio | PASSOU | documento CANCELLED ("Rascunho alterado depois do envio"), contrato DRAFT; a troca de indicado também cancela |
| 014 | João aceita | PASSOU | 403 `NOT_DESIGNATED_ADMIN` |
| 014 | Hash errado | PASSOU | 422 `DOCUMENT_HASH_MISMATCH` |
| 014 | Aceite com o hash certo | PASSOU | ACTIVE, termos EFFECTIVE, `startDate` 2026-10-18, IP 203.0.113.77 (X-Forwarded-For) e UA gravados; confirmação para Maria, João e o `billingEmail` |
| 014 | Segundo aceite | PASSOU | 409 `DOCUMENT_NOT_PENDING` |
| 014 | Aceites simultâneos | PASSOU | com 5: 1×200 e 4×409, 1 evento `DOCUMENT_ACCEPTED`; com 2: 200 e 409 |
| 014 | Inteligência segue o tipo de licença | PASSOU | A (Padrão): true, ligada à mão, → false; B (Com Inteligência): false → true, com `INTELLIGENCE_APPLIED` |
| 014 | `PUT /intel/admin/config` | PASSOU | ADMIN 403 `INTEL_MANAGED_BY_CONTRACT`; SUPERADMIN 409 |
| 014 | Aditivo com aumento sem data | PASSOU | 422 `AMENDMENT_NOTICE_TOO_SHORT`, mínima 2026-11-17; 16/11 → 422; 17/11 → 200 |
| 014 | Até a data valem os termos antigos | PASSOU | v2 EFFECTIVE `effectiveFrom` 2026-11-17T03:01Z; Inteligência continua false; `/billing/me` current=STANDARD e scheduled=INTELLIGENCE; aditivo novo → 409 `AMENDMENT_NOT_YET_EFFECTIVE` |
| 014 | Troca na data (ticker) | PASSOU | movi a data para o passado e reiniciei a API: o ticker do boot ligou a Inteligência e gravou `INTELLIGENCE_APPLIED` v2 |
| 014 | Aditivo "a pedido da Empresa" (extra) | PASSOU | vale no aceite, Inteligência f → t na hora; sem motivo → 400 |
| 014 | Versão nova publicada | PASSOU | o documento aceito continua v1, com o mesmo hash |
| 015 | Antes do aceite, 12 vendedores | PASSOU | D (DRAFT P10): 12/12 criados |
| 015 | 10º e 11º com Pacote 10 | PASSOU | 10º 201; 11º 409 `SEAT_LIMIT_REACHED` `{used:10,limit:10}` |
| 015 | Os 6 caminhos | PASSOU | `POST /users`, `POST /companies/:id/users`, `PATCH /users/:id/active`, rota de empresa, ADMIN→vendedor (sessão do João intacta na recusa) e órfão: todos 409 no limite; ADMIN continua grátis |
| 015 | Concorrência 9/10, 5 simultâneas, 3 rodadas | PASSOU | cada rodada 1×201 e 4×409, total 10; mista (reativar + criar), 15 simultâneas e 40 simultâneas (7,6 s): sempre 1 passa, nenhum 500 |
| 015 | Desativar libera | PASSOU | 10 → 9, e a criação seguinte passa |
| 015 | Pedido de licenças | PASSOU | João 403 `NOT_DESIGNATED_ADMIN`; 98.00 → 409 `LICENSE_PRICE_CHANGED` `{unitPrice:"99.00"}`; 201; segundo pendente 409; 3 pedidos simultâneos → 1 criado |
| 015 | Aprovação | PASSOU | limite 12 na hora (11º e 12º 201, 13º 409 `{used:12,limit:12}`); segunda aprovação 409 `LICENSE_REQUEST_ALREADY_DECIDED`; 3 aprovações simultâneas → 1×200 e 1 termo |
| 015 | E-mail do pedido | PASSOU | para o `notifyEmail` |
| 016 | `jobs/run` gera a competência passada | PASSOU | 5 faturas 2026-09 (A, B, C, G, H); B = PACKAGE 3200 + EXTRA_SEATS 2×150,50 = 3501,00; total = soma dos itens |
| 016 | Dois `jobs/run` simultâneos | PASSOU | uma fatura por empresa; a corrida aconteceu de verdade (o segundo caiu no P2002 nas 5) |
| 016 | `jobs/run` repetido | PASSOU | 0 criadas, 8 faturas no total |
| 016 | Termos deste mês fora da fatura passada | PASSOU | A: só PACKAGE 1800,00, sem o aditivo de 17/10 nem as licenças de 18/10 |
| 016 | DRAFT e PENDING não faturam | PASSOU | D e E, mesmo com `firstBilledCompetence` posto à mão |
| 016 | Desconto e recálculo | PASSOU | −100,10 → 1699,90; ajuste 0,20; total negativo 422; remover item automático 409; o recálculo mantém os manuais |
| 016 | Baixa diferente do total | PASSOU | 1650,00 sobre 1699,90 → PAID; data futura 422 |
| 016 | PAID imutável | PASSOU | item, recálculo, cancelamento, remoção e nova baixa: 409 `INVOICE_PAID_IMMUTABLE`; NF e observação 200 |
| 016 | Avulsa | PASSOU | mês corrente 422; competência ocupada 409; antes da 1ª competência 422; vencimento passado 422; manual 201; pelo contrato (B, agosto) 3501,00 |
| 016 | Cancelar OPEN | PASSOU | CANCELLED; a competência continua ocupada; item 409 `INVOICE_CANCELLED` |
| 016 | Cancelamento do contrato | PASSOU | agendar (fim 31/10), de novo 409, desfazer 200, desfazer de novo 409; com o fim movido para 30/09, o `jobs/run` deixou CANCELLED, Inteligência desligada e empresa desativada |
| 016 | Lembrete de vencimento uma vez só | PASSOU | 1 e-mail; nos 2 `jobs/run` seguintes, `duplicate` e 0 e-mail; o lembrete de documento pendente também saiu 1 vez |
| 016 | Corridas extras | PASSOU | rascunho ×3, envio ×3, modelo ×2, avulsa ×3, itens ×5, baixa × cancelamento × item, agendamento ×2: todas consistentes |
| 017 | Aviso de suspensão | PASSOU | C vencida ontem → prevista 20261101 (vencimento + 15); B vencida 05/10 → 20261028 (envio + 10); e-mail no falso; payload sem e-mail |
| 017 | Resend 500 | PASSOU | 0 `SUSPENSION_NOTICE_SENT` depois de 10 envios recusados |
| 017 | Aviso de 9 e de 10 dias | PASSOU | 9 dias com a data prevista hoje: não bloqueia; 10 dias: bloqueia `OVERDUE`, com `ACCESS_BLOCKED` |
| 017 | 60 dias sem aviso | PASSOU | H, sem destinatário: aviso nunca gravado, nunca bloqueada |
| 017 | Empresa bloqueada | PASSOU | vendedor 403 `COMPANY_BLOCKED/OVERDUE` em `/customers` e `/orders`; `/auth/me` 200 com `access.blocked=true`; login e refresh 200; ADMIN 200 em `/billing/me`, `/invoices`, `/overdue` e `/documents`, 403 em `/users`; SUPERADMIN 200 |
| 017 | Baixa desbloqueia | PASSOU | na hora, `ACCESS_UNBLOCKED` com cause PAYMENT; o vendedor volta a 200 |
| 017 | "Liberar até" | PASSOU | +91 dias 400, ontem 400, sem bloqueio 409; libera e manda 2 e-mails; a liberação vigente segura o bloqueio; vencida, bloqueia de novo; switch desligado libera (cause RULE) |
| 017 | `active=false` | PASSOU | 403 `INACTIVE` (G, e F pela rota da empresa); `/billing/me` 200; ao reativar, volta |
| 017 | SUPERADMIN sem empresa | PASSOU | `/auth/me` 200, `company: null` |
| 018 | Dashboard bate com o cálculo à mão | PASSOU | MRR 12798,00 (2797 + 3501 + 1500 + 5000); a receber 4 / 10301,00; vencido 2 / 6500,00; 15 dias 1 / 3501,00; recebido no mês 3 / 9151,00 (pelo `paidAmount`); licenças 13/145; perto do limite: Alfa 12/13; 1 aceite pendente; faturado: set 15700,90 e ago 3801,00 |
| 018 | ADMIN | PASSOU | 403 (vendedor 403, sem token 401) |
| 018 | Lista de clientes | PASSOU | em dia (Alfa, Beta), vencido (Teta), bloqueado (Gama), aguardando aceite (Epsilon), sem contrato (Zeta, Delta), cancelado (Eta); contagem igual à do painel |
| Geral | 500 no log | FALHOU | 3 ocorrências: 2 deadlocks (A3) e 1 estouro de Decimal (A4) |
| Geral | Dado pessoal no log | PASSOU com ressalva | 0 texto de contrato, CPF, e-mail ou nome; o IP do aceite aparece no `remoteAddress` do log de acesso (A8) |

## 3. Achados (do mais grave ao menos)

**A1. ALTA — Editar o rascunho durante o aceite troca os termos já aceitos.**

- **O que acontece:** `PUT /admin/billing/clients/:id/contract` disparado junto com `POST /billing/me/documents/:id/accept`: as duas respondem 200.
- **Estado final:**
  - o contrato fica ACTIVE e o documento ACCEPTED, com o texto de R$ 1.000,00;
  - os termos v1 EFFECTIVE ficam com `packagePrice` 9999.00;
  - o histórico mostra `DOCUMENT_ACCEPTED` às 22:04:38.449 e `CONTRACT_DRAFT_UPDATED` às 22:04:38.462.
- **Reprodução:** `race1.mjs`, com 9 de 12 tentativas ruins.
- **Causa:** em `apps/api/src/modules/billing/contract.service.ts`:
  - `:75` lê o status sem trava;
  - `:105-106` só cancela se o status lido era PENDING, e o `cancelSentDocuments` devolve 0 quando o aceite já gravou;
  - `:119` e `:129` atualizam por id, sem status no where.
- **Impacto em produção:**
  - o contrato passa a cobrar um preço que o cliente não aceitou, enquanto o hash prova outro texto;
  - o gerador fatura pelo valor novo;
  - basta o PUT começar enquanto a transação do aceite está aberta, uma janela de dezenas de ms.
- **Correção sugerida:** travar a linha do contrato no começo das duas operações (o `seatGuardVersion` do `sendDocument`), reler o status depois da trava e atualizar os termos com `updateMany where status PROPOSED`, conferindo o count.

**A2. ALTA — O mesmo problema no aditivo.**

- **O que acontece:** `PUT .../amendment` junto com o aceite do aditivo. Resultado: termos v2 EFFECTIVE com `extraSeats` 5, quando o texto aceito diz 1.
- **Reprodução:** `race2.mjs`, com 6 de 10 tentativas ruins.
- **Causa:** em `contract-documents.service.ts`, `:652` lê sem trava e `:755` atualiza por id, sem status no where.

**A3. MÉDIA — Deadlock entre o aceite e a edição do aditivo devolve 500 ao ADMIN.**

- **O que acontece:** 2 de 10 tentativas em `race2.mjs`. O log mostra `40P01 deadlock detected` em `me.service.ts:273` (`tx.contractTerms.updateMany`), como `PrismaClientUnknownRequestError` não tratado.
- **Causa:** a ordem das travas é invertida:
  - o aceite trava o documento (`me.service.ts:250`) e depois os termos (`:273`);
  - o `saveAmendment` trava os termos (`contract-documents.service.ts:755`) e depois o documento (`:757`).
- **Impacto:** o ADMIN vê "Erro interno" e o caso vai ao Sentry. O estado final fica consistente: o documento é cancelado e o aditivo, editado.
- **Correção:** a mesma trava única do A1.

**A4. BAIXA — Estouro do `Decimal(14,2)` vira 500.**

- **Reprodução:** `POST /admin/billing/invoices` com 2 itens de `999999999999.99` responde 500 "Erro interno do servidor". No log: Postgres `22003 numeric field overflow`, em `invoices.service.ts:520`.
- **Causa:** `money` (`billing.schema.ts:27`) e `moneySigned` (`invoices.schema.ts:22`) aceitam 12 dígitos por valor, mas nada limita a soma.
- **Rascunho também passa:** pacote máximo + 10000 adicionais × máximo é salvo (monthlyTotal 10000999999999900.16). O gerador falharia nesse contrato toda hora.
- **Correção sugerida:** validar o total abaixo de 10^12 e responder 422.

**A5. BAIXA — Duas criações simultâneas com o mesmo e-mail vazam a mensagem do Prisma.**

- **O que acontece:** `POST /users` ×3 com o mesmo e-mail dá 201 e 2×409, e a mensagem do 409 é crua: ``Invalid `db.user.create()` invocation in C:\...\users\users.service.ts:122:13`` mais o trecho do código.
- **Causa:** `users.routes.ts:68` devolve o `message` de qualquer erro que não é `AppError`, e a checagem de e-mail fica fora da transação.
- **Alcance:** só SUPERADMIN e ADMIN chegam a essa rota.

**A6. BAIXA — Buracos na numeração das faturas.**

- **O que acontece:** dois `jobs/run` simultâneos geraram os números 1, 3, 5, 7 e 9. O INSERT que caiu no P2002 queimou o 2, o 4, o 6 e o 8 (`invoices.service.ts:218`). Insert que falha, como o do A4, também queima número.
- **Decidir:** se a numeração precisa ser contínua.

**A7. BAIXA — P2002 esperado sai como `prisma:error` no log.**

- **O que acontece:** o Prisma loga `error` também em produção (`packages/db/src/index.ts:9`).
- **Volume:** cada reserva duplicada (`billing-mailer.ts:162`) imprime "Unique constraint failed on (`dedupeKey`)" com o trecho do código. Com o agendador de hora em hora, sai um bloco por fatura na janela do lembrete e por documento SENT há mais de 72 h, até o aceite.
- **Impacto:** ruído que esconde erro de verdade. Não há dado pessoal na mensagem.

**A8. INFO — O IP do aceite aparece no log de acesso.**

- **O que acontece:** o logger padrão do Fastify grava `remoteAddress` (o `request.ip` do trustProxy) em toda requisição, inclusive em `POST /billing/me/documents/<id>/accept` (203.0.113.77) e no pedido de licenças.
- **Contexto:** o plano 014 conta com isso para conferir o `TRUST_PROXY_HOPS`, mas o roteiro proíbe IP do aceite no log.
- **Decidir:** manter, ou tirar o IP no serializer de `req`.

**A9. Roteiro — O passo 1 do ponta a ponta do 014 não é executável.**

- **O que acontece:** a v1 nasce DRAFT na migration. A API recusa versão nova com rascunho aberto (409, `contract-templates.service.ts:82`), e o painel esconde "Nova versão".
- **Consequência:** o único caminho é editar a v1 no lugar, o que sobrescreve no banco o texto da minuta.

**Observações de leitura, não reproduzidas:**

- **Tick × baixa:** o tick pode bloquear com a fatura ainda OPEN enquanto a baixa está no meio da transação, porque o filtro de relação vê o último commit. O tick seguinte libera.
- **Aviso em duplicidade:** dois ticks simultâneos tentam o aviso de suspensão duas vezes, porque o `sendBillingEmailThenRecord` confere antes e grava depois. No `t016a`, foram 10 tentativas para 5 faturas. Só o `idempotencyKey` do Resend real evita o e-mail duplicado.
- **Ruído no Sentry:** empresa sem destinatário gera "Aviso de suspensão sem destinatário" a cada hora, para sempre.

## 4. O que não deu para testar

- **Telas:** o painel e o app ficaram fora; o teste foi só da API.
- **Virada de fuso real:** 22h do dia 31 e aceite às 23h30. A API usa o relógio do sistema; isso fica com os testes unitários.
- **Ambiente de produção:**
  - dois processos da API, como num deploy: simulei com requisições paralelas no mesmo processo;
  - pooler do Neon: usei Postgres direto, sem pgbouncer;
  - Sentry: não havia DSN.
- **Jobs da Inteligência pausados para empresa bloqueada:** B ficou bloqueada só alguns minutos.
- **Lembrete de suspensão com liberação que cobre a data prevista.**

Os scripts estão nesta pasta. Os nomes dos bancos e containers da primeira rodada eram
`addere_e2e` e `addere-e2e-db`; os da rodada do conserto, `addere_fix`, `addere_fix_after` e
`addere-fix-db`. Hoje os padrões são `addere_e2e` e `addere-e2e-db` (ver `README.md`).

## 5. Depois do conserto (PR #261, 18/10/2026)

O roteiro rodou de novo, num banco limpo (`addere_fix_after`), com o código do PR #261:

- **Roteiro:** 73 itens passaram. As 3 falhas são as esperadas: a criação da v2 dos dois
  modelos (A9) e a prévia antes de indicar o administrador, que lista os dois campos dele.
- **Corridas:**

  | Script | Tentativas | Ruins antes | Ruins depois | 500 / deadlock depois |
  |---|---|---|---|---|
  | `race1` (aceite × rascunho) | 30 | 16 de 20 | 0 | 0 / 0 |
  | `race2` (aceite × aditivo, com `termsVersion`) | 30 | 14 de 20 (3 deadlocks) | 0 | 0 / 0 |
  | `race2` (sem `termsVersion`, painel antigo) | 10 | — | 0 | 0 / 0 |

  Depois do conserto, cada tentativa termina de um dos jeitos aceitáveis: o aceite passa e a
  edição leva 409, ou a edição passa e o aceite leva 409, ou (sem `termsVersion`) o aceite
  passa e a edição vira uma proposta nova.
- **A4:** a avulsa com dois itens do máximo e o item que estoura dão 422
  `AMOUNT_TOO_LARGE`, e o rascunho acima do máximo também.
- **A5:** três criações simultâneas com o mesmo e-mail dão 201 e 2×409 "Email já
  cadastrado", sem a mensagem do Prisma; fica um usuário só.
- **Aviso sem destinatário:** dois `jobs/run` seguidos gravam um evento por fatura, não um
  por tick.

O que ficou de cada achado:

| Achado | Destino |
|---|---|
| A1, A2, A3 | Corrigidos: `lockContractRow` antes de qualquer escrita (`contract-lock.ts`); ordem das travas em `docs/billing/README.md`, "Edição × aceite" |
| A4 | Corrigido: 422 `AMOUNT_TOO_LARGE` |
| A5 | Corrigido: 409 "Email já cadastrado" |
| A6 | Aceito: a numeração pode ter buraco (`docs/billing/README.md`, faturamento) |
| A7 | Corrigido: P2002 tratado não sai mais como `prisma:error` |
| A8 | Mantido e documentado: o IP no log de acesso serve para conferir o `TRUST_PROXY_HOPS` |
| A9 | Documentado: a v1 do modelo é editada no lugar e publicada |
| Tick × baixa; aviso em duplicidade | Fora do conserto: o tick seguinte libera; o `idempotencyKey` do Resend segura o e-mail repetido |
