# E2E da Gestão Addere (planos 013 a 018)

Scripts que exercitam a API da Fase 6 contra um **Postgres real e local**, com um Resend
falso. Pegam o que os testes do Vitest, com o Prisma mockado, não pegam: corridas entre
transações, travas, deadlocks e estouro de coluna. Foi assim que o teste de 18/10/2026 achou
a corrida do aceite (A1 a A3), corrigida no PR #261. O resultado está em
[`RELATORIO-2026-10-18.md`](RELATORIO-2026-10-18.md).

Não roda no CI. É uma ferramenta para antes e depois de mexer em contrato, aceite, licenças,
faturamento ou bloqueio.

## Regras de segurança

- **Só banco local.** O `start-api.sh` monta a URL do Postgres na porta 5434 e passa
  `DATABASE_URL` e `DATABASE_URL_DIRECT` na mesma linha. O `seed-local.cjs` aborta se a URL
  não for a local.
- **Checkout sem `.env`.** O `start-api.sh` aborta se achar `.env` na raiz, em `apps/api` ou em
  `packages/db`. Rode a partir de um worktree limpo, nunca do checkout de trabalho, que tem o
  `.env` apontando para o Neon.
- **Nada externo.** O Resend é o falso da porta 3999. O LLM fica desligado, o geocoder é o
  mock, o Sentry não tem DSN e o agendador de cobrança fica desligado; os jobs rodam só pelo
  `jobs/run`.
- Os e-mails são todos `@exemplo.test`, e o SUPERADMIN do e2e é `superadmin@exemplo.test`,
  com a senha `E2e-Senha-123`.

## Preparar

```bash
# 1. Worktree limpo da branch a testar (sem .env)
git worktree add ../addere-e2e origin/staging
cd ../addere-e2e && npm ci && npm run db:generate

# 2. Postgres descartável na 5434 (a 5432 costuma estar ocupada por outro projeto)
docker run -d --name addere-e2e-db -p 5434:5432 \
  -e POSTGRES_USER=addere_dev_user -e POSTGRES_PASSWORD=addere_dev_password \
  -e POSTGRES_DB=addere_e2e postgres:16-alpine

# 3. Migrations e seed mínimo, com as duas URLs locais na mesma linha
URL=postgresql://addere_dev_user:addere_dev_password@localhost:5434/addere_e2e
DATABASE_URL=$URL DATABASE_URL_DIRECT=$URL npm run migrate:deploy --workspace=packages/db
DATABASE_URL=$URL DATABASE_URL_DIRECT=$URL node apps/api/e2e-billing/seed-local.cjs

# 4. Resend falso e API (cada um num terminal, ou em segundo plano)
cd apps/api/e2e-billing && mkdir -p logs
node fake-resend.cjs >> logs/fake-resend.log 2>&1 &
bash start-api.sh >> logs/api-addere_e2e.log 2>&1 &
curl -s http://127.0.0.1:3334/health
```

O `seed.ts` do projeto não entra: ele cria usuários `@addere.dev`. O `seed-local.cjs` cria só o
catálogo de permissões e o SUPERADMIN.

Para outra rodada no mesmo container, crie outro banco
(`docker exec addere-e2e-db createdb -U addere_dev_user addere_x`) e exporte `E2E_DB=addere_x`
em todos os comandos. O estado de cada banco fica em `state-<banco>.json`, e os resultados em
`results-<banco>.jsonl`. Os dois ficam fora do git. `E2E_CONTAINER` troca o nome do container.

## Rodar

Os scripts dependem uns dos outros pelo `state-<banco>.json`. A ordem de 18/10/2026:

| Ordem | Script | O que cobre |
|---|---|---|
| 1 | `t013.mjs` | Cadastro, contrato em rascunho, calendário, Decimal |
| 2 | `t014a.mjs` | Modelo com `[[REVISAR` recusado; v1 editada no lugar e publicada (A9) |
| 3 | `t014b.mjs` | Administrador indicado, envio, e-mail, hash, aceite, concorrência do aceite |
| 4 | `t014c.mjs` | Aceite Com Inteligência, carência, 5 aceites simultâneos |
| 5 | `t014d.mjs` | Aditivo com aumento: 30 dias, termos antigos até a data |
| 6 | `t014f.mjs move`, `bash restart-api.sh`, `t014f.mjs check` | Ticker do boot aplica o aditivo na data |
| 7 | `t015a.mjs`, `t015b.mjs`, `t015c.mjs` | Limite de licenças, concorrência da trava, pedido e aprovação |
| 8 | `t016prep.mjs` | Empresas E a H, SUPERADMINs extras, viagem no tempo |
| 9 | `t016a.mjs`, `t016b.mjs`, `t016c.mjs` | Faturas, itens, baixa, avulsa, cancelamento, lembretes |
| 10 | `t017a.mjs`, `t017b.mjs` | Aviso de suspensão, bloqueio de 9 e 10 dias, liberação, `INACTIVE` |
| 11 | `t018.mjs` | Painel conferido contra o cálculo em SQL; lista de clientes |
| 12 | `race1.mjs 30 b`, `race2.mjs 30 c`, `race2.mjs 10 l semversao` | Aceite × edição (A1 a A3) |
| 13 | `t014e.mjs c 1` | Aditivo "a pedido da Empresa" numa empresa do `race2` |
| 14 | `race3.mjs`, `race4.mjs` | Outras corridas e 40 criações simultâneas na trava |
| 15 | `a4.mjs`, `a5.mjs`, `norecipient.mjs` | Estouro do Decimal, e-mail repetido, aviso sem destinatário |

Cada script roda com `node <script>` dentro desta pasta e imprime `[PASSOU]` ou `[FALHOU]` por
item. `logins.mjs` renova os tokens quando expiram, e `node logstat.cjs '<regex da url>'` lista
o status das requisições no log da API. Os `race*.mjs` contam os deadlocks no
`logs/api-<banco>.log`, por isso a API precisa estar gravando nesse arquivo.

## Limpar

```bash
bash stop-port.sh 3334 && bash stop-port.sh 3999
docker rm -f addere-e2e-db
# no checkout principal:
git worktree remove --force ../addere-e2e
```

Antes do `docker rm`, confira o nome: só o container do e2e sai. Os de outros projetos ficam
como estão.
